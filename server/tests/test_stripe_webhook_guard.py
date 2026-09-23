"""Stripe webhook refuses cleanly when billing is not configured.

WHY: the route had no `_stripe_enabled()` guard and reached `import stripe`, which
is not installed here — so EVERY webhook, including a valid test one, returned a
500 with a stack trace. That also let Stripe's retry storm hammer the endpoint.

The distinction the tests pin: 503 "not enabled" (honest, terminal for Stripe) is
NOT the same as 400 "bad signature" (Stripe should stop, but the request was
malformed). Collapsing them would either hide a real signature failure or make an
unconfigured deployment look broken.

2026-09-23: the not-configured tests now FORCE the flag off instead of relying on
the absence of credentials. They passed only while .env happened to have no Stripe
keys — the moment real keys were wired in, three of them failed. A test that reads
ambient deployment state tests the deployment, not the code.
"""
import pytest


def _force_unconfigured(monkeypatch):
    """Guarantee the unconfigured branch regardless of what .env holds.

    Patched on the payments module, which is where the route resolves it: the
    handler does `from .payments import _stripe_enabled` INSIDE the function body,
    so the attribute is looked up at call time and this patch takes effect.
    """
    import server.payments as payments
    monkeypatch.setattr(payments, "_stripe_enabled", lambda: False)


def test_webhook_returns_503_when_stripe_is_not_configured(client, monkeypatch):
    """The whole point: no crash, a clear terminal answer."""
    _force_unconfigured(monkeypatch)
    r = client.post("/api/stripe/webhook", content=b'{"type":"test"}',
                    headers={"Stripe-Signature": "t=1,v1=deadbeef"})
    assert r.status_code == 503, f"expected a clean 503, got {r.status_code}: {r.text[:200]}"
    assert "not enabled" in r.text.lower()


def test_webhook_fails_deliberately_not_by_crashing(client, monkeypatch):
    """503 is the intended answer; the defect was a 500 from an ImportError.

    Asserting `< 500` here would contradict the fix (503 IS >= 500). What matters
    is that the response is the guard's own message rather than an unhandled
    exception, so assert on the body, not the status class.
    """
    _force_unconfigured(monkeypatch)
    r = client.post("/api/stripe/webhook", content=b"{}")
    assert r.status_code != 500, "an unhandled exception is the bug being fixed"
    assert "not enabled" in r.text.lower(), "the refusal must be the guard's, not a crash"


def test_webhook_is_reachable_without_auth(client):
    """Stripe cannot send a session cookie — the route must stay unauthenticated.

    It is protected by the signature check, not by user auth, so a 401/403 here
    would silently break real billing.
    """
    r = client.post("/api/stripe/webhook", content=b"{}")
    assert r.status_code not in (401, 403), \
        "Stripe cannot authenticate; the route must not require a session"


def test_guard_reads_the_real_flag(client, monkeypatch):
    """Non-vacuous: when billing IS enabled the guard must NOT short-circuit."""
    import server.payments as payments
    calls = {"n": 0}

    def _fake_enabled():
        calls["n"] += 1
        return True
    monkeypatch.setattr(payments, "_stripe_enabled", _fake_enabled)

    # A handler that reports it was reached, so we can tell the guard opened.
    import server.main as m
    monkeypatch.setattr(m, "handle_stripe_webhook", lambda payload, sig: {"reached": True})

    r = client.post("/api/stripe/webhook", content=b"{}",
                    headers={"Stripe-Signature": "t=1,v1=x"})
    assert calls["n"] >= 1, "the guard must consult the flag"
    assert r.status_code == 200, f"with billing enabled the handler must run: {r.text[:200]}"
    assert r.json().get("reached") is True
