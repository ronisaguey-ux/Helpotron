"""Free Trial tests — owner 09-06 rework: 15,000 trial tokens, mandatory 2FA,
1-cent payment verification (SMS lane retired)."""
import pytest

from server.database import Payment, SessionLocal, User
from server.plans import get_plan_catalogue


def _query_user(public_id: str) -> User:
    db = SessionLocal()
    try:
        return db.query(User).filter(User.public_id == public_id).first()
    finally:
        db.close()


def _set_2fa(public_id: str, value: bool) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        settings = dict(user.settings or {})
        if value:
            settings["2fa_enabled"] = True
        else:
            settings.pop("2fa_enabled", None)
        user.settings = settings
        db.commit()
    finally:
        db.close()


def _set_payment_verified(public_id: str, value: bool = True) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        user.payment_verified = value
        db.commit()
    finally:
        db.close()


def test_plan_catalogue_reprice_and_no_usd_disclosures():
    catalogue = get_plan_catalogue()
    plan_ids = [p["id"] for p in catalogue]
    # Owner 2026-09-18: the free "testing" tier sits second, right after the
    # trial — both are free entry points, and the paid tiers follow.
    assert plan_ids == ["trial", "testing", "basic", "pro", "elite"]

    trial_plan = next(p for p in catalogue if p["id"] == "trial")
    assert trial_plan["is_trial"] is True
    assert trial_plan["requires_2fa"] is True
    assert trial_plan["requires_1c_payment"] is True
    assert trial_plan["price_cents"] == 0
    assert trial_plan["monthly_credits"] == 15000
    assert "usage_value_usd" not in trial_plan

    # The testing tier: free, no card, granted by hand on application.
    testing_plan = next(p for p in catalogue if p["id"] == "testing")
    assert testing_plan["is_testing"] is True
    assert testing_plan["requires_approval"] is True
    assert testing_plan["price_cents"] == 0
    # Owner 2026-09-19: Testing is a flat 10,000-token allocation that never
    # expires — deliberately not on the monthly ladder, because nothing
    # renews it and nothing claws it back.
    assert testing_plan["monthly_credits"] == 10000
    assert testing_plan["requires_1c_payment"] is False
    assert "usage_value_usd" not in testing_plan

    prices = {p["id"]: p["price_cents"] for p in catalogue}
    assert prices["basic"] == 1000
    assert prices["pro"] == 2000
    assert prices["elite"] == 4000

    # Owner 2026-09-17: allowances rescaled 100x to match the rate change to
    # 100 tokens = 1 cent. Same plan economics, finer unit:
    #   $10 -> 30,000 = $3.00 of service · $20 -> 100,000 = $10.00 · $40 -> 270,000 = $27.00
    allowances = {p["id"]: p["monthly_credits"] for p in catalogue}
    assert allowances["trial"] == 15000
    assert allowances["testing"] == 10000  # flat grant, never expires (owner 2026-09-19)
    assert allowances["basic"] == 30000
    assert allowances["pro"] == 100000
    assert allowances["elite"] == 270000

    # No USD-equivalence disclosures anywhere in the public catalogue.
    joined = " ".join(
        str(p.get(x, "")) for p in catalogue for x in ("tagline", "capabilities", "badge")
    )
    for leak in ("tool budget", "1 token =", "$1.00", "token = $0.01"):
        assert leak not in joined, f"USD disclosure leaked: {leak}"


def test_only_testing_tier_is_available_without_a_payment_gateway(monkeypatch):
    """Owner 2026-09-18: with Stripe unconfigured, every tier stays VISIBLE but
    only `testing` can be started. The flags must come from the gateway, not from
    a hand-set literal, so they open by themselves at launch.
    """
    import server.payments as payments
    import server.plans as plans

    monkeypatch.setattr(payments, "_stripe_enabled", lambda: False)
    monkeypatch.setattr(plans, "_stripe_enabled", lambda: False)
    availability = plans.tier_availability()
    assert availability["testing"] is True
    for paid in ("trial", "basic", "pro", "elite"):
        assert availability[paid] is False, f"{paid} must not be startable with no gateway"

    # Every tier is still present and priced — visible, just not startable.
    catalogue = {p["id"]: p for p in plans.get_plan_catalogue()}
    assert set(catalogue) == {"trial", "testing", "basic", "pro", "elite"}
    assert catalogue["basic"]["available"] is False
    assert catalogue["basic"]["unavailable_reason"]
    assert catalogue["testing"]["available"] is True

    # With a gateway configured they all open — nothing to remember at launch.
    monkeypatch.setattr(payments, "_stripe_enabled", lambda: True)
    monkeypatch.setattr(plans, "_stripe_enabled", lambda: True)
    availability = plans.tier_availability()
    assert all(availability.values())
    paid = {p["id"]: p for p in plans.get_plan_catalogue()}
    assert paid["basic"]["available"] is True
    assert paid["basic"]["unavailable_reason"] == ""



def test_status_shape(client, auth_headers, unique_user):
    res = client.get("/api/trial/status", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["requires_2fa"] is True
    assert data["requires_1c_payment"] is True
    assert data["credits_grant"] == 15000
    assert data["trial_claimed"] is False
    assert data["payment_verified"] is False
    assert data["two_fa_enabled"] is True  # conftest seeds 2FA for tests


def test_activate_requires_2fa(client, auth_headers, unique_user):
    _set_2fa(unique_user, False)
    res = client.post("/api/trial/activate", headers=auth_headers)
    assert res.status_code == 403
    assert "Two-factor" in res.json()["detail"]


def test_activate_requires_payment_verification(client, auth_headers, unique_user):
    # 2FA is seeded on; payment never verified: activate must be refused.
    res = client.post("/api/trial/activate", headers=auth_headers)
    assert res.status_code == 403
    assert "payment verification" in res.json()["detail"]


def test_payment_verify_manual_lane(client, auth_headers, unique_user, monkeypatch):
    # Force the unconfigured branch. This asserted the manual lane "because Stripe
    # keys are not configured in the test env" — true only until real keys were
    # wired into .env, at which point the route took the Stripe lane and this
    # failed. Patching the flag tests the code path, not the ambient deployment.
    import server.payments as payments
    monkeypatch.setattr(payments, "_stripe_enabled", lambda: False)

    res = client.post("/api/trial/payment-verify", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    # Stripe keys are not configured in the test env: manual lane expected.
    assert data["mode"] == "manual"
    assert data["verify_cents"] == 1

    user = _query_user(unique_user)
    db = SessionLocal()
    try:
        row = (
            db.query(Payment)
            .filter(Payment.user_id == user.id, Payment.provider_ref == f"trial_verification_{user.id}")
            .order_by(Payment.id.desc())
            .first()
        )
    finally:
        db.close()
    assert row is not None
    assert row.status == "pending"
    assert row.amount_cents == 1
    assert user.payment_verified is False  # the cent POST alone never verifies


def test_full_activation_flow(client, auth_headers, unique_user):
    _set_payment_verified(unique_user, True)

    res = client.post("/api/trial/activate", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["user"]["plan"] == "trial"
    # 09-06 (owner rework): the grant is task tokens in token_balance —
    # user.credits is discount currency and stays 0.0.
    assert data["user"]["token_balance"] == 15000.0
    assert data["user"]["credits"] == 0.0
    assert data["user"]["trial_claimed"] is True

    post_status = client.get("/api/trial/status", headers=auth_headers).json()
    assert post_status["eligible"] is False
    assert post_status["trial_claimed"] is True
    assert post_status["plan"] == "trial"

    # Second activation is refused.
    res_again = client.post("/api/trial/activate", headers=auth_headers)
    assert res_again.status_code == 400
    assert "already" in res_again.json()["detail"].lower() or "claimed" in res_again.json()["detail"]
