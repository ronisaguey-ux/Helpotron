"""costly_guard: per-caller buckets, and no double authentication.

TWO DEFECTS, both live until now.

1. `_caller_key` read `request.state.auth_user_public_id`, which NOTHING in the
   codebase ever sets — the shared auth path only sets `api_key_id` and
   `auth_via_api_key`. The lookup therefore always returned None and fell through
   to `request.client.host`, which behind cloudflared is always 127.0.0.1. Every
   user shared ONE bucket, so one busy account throttled everyone.

2. The factory carried its own `Depends(get_current_authenticated_user)`, so on
   any route that already depended on the same function it ran TWICE — two auth
   round-trips (a session lookup plus refresh, or an API-key hash) per request,
   for a guard whose only job is counting.

Both are asserted behaviourally, not by inspecting source text.
"""
import pytest
from starlette.requests import Request

from server import ratelimit as rl


def _req(headers=None, client_host="127.0.0.1"):
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/test",
        "headers": raw,
        "client": (client_host, 12345),
        "query_string": b"",
        "scheme": "https",
        "server": ("testserver", 443),
    }
    return Request(scope)


class _User:
    def __init__(self, public_id):
        self.public_id = public_id


def test_two_different_users_do_not_share_a_bucket():
    """The bug: both resolved to ip:127.0.0.1 and collided."""
    k1, kind1 = rl._caller_key(_req(), _User("alice"))
    k2, kind2 = rl._caller_key(_req(), _User("bob"))
    assert k1 != k2, f"two accounts must not share a bucket (both got {k1})"
    assert kind1 == "account" and kind2 == "account"
    assert "alice" in k1 and "bob" in k2


def test_same_user_is_stable_across_requests():
    a = rl._caller_key(_req(), _User("alice"))[0]
    b = rl._caller_key(_req(client_host="10.0.0.9"), _User("alice"))[0]
    assert a == b, "one account must map to one bucket regardless of source address"


def test_anonymous_callers_key_on_credential_not_the_shared_proxy_address():
    """Behind cloudflared every socket address is the edge, so it cannot key."""
    bare = rl._caller_key(_req(), None)[0]
    tok_a = rl._caller_key(_req({"Authorization": "Bearer htk_aaa"}), None)[0]
    tok_b = rl._caller_key(_req({"Authorization": "Bearer htk_bbb"}), None)[0]
    assert tok_a != tok_b, "two credentials must not share a bucket"
    assert bare.startswith("ip:"), "a genuinely anonymous caller still falls back to the address"
    # The credential must not be recoverable from the key.
    assert "htk_aaa" not in tok_a


def test_guard_does_not_authenticate_a_second_time():
    """The guard must consume the caller's user, not resolve it again.

    Non-vacuous by construction: the pre-fix factory declared
    `user=Depends(get_current_authenticated_user)`, so calling the dependency with
    no user re-entered auth. Here the guard is called directly and must not touch
    the auth function at all.
    """
    calls = {"n": 0}
    import server.routes_features as rf

    original = rf.get_current_authenticated_user

    def _spy(*a, **k):
        calls["n"] += 1
        return original(*a, **k)

    rf.get_current_authenticated_user = _spy
    try:
        dep = rl.costly_guard("test_no_double_auth", limit=1000, window=60.0)
        dep(request=_req(), user=_User("carol"))
    finally:
        rf.get_current_authenticated_user = original

    assert calls["n"] == 0, (
        "the guard must not authenticate — it is handed an already-authenticated "
        f"user (auth ran {calls['n']} extra time(s))"
    )


def test_limit_is_enforced_per_user():
    """A user over the limit gets 429; a different user is unaffected."""
    dep = rl.costly_guard("test_per_user_limit", limit=3, window=60.0)

    for _ in range(3):
        dep(request=_req(), user=_User("dave"))

    with pytest.raises(Exception) as ei:
        dep(request=_req(), user=_User("dave"))
    assert getattr(ei.value, "status_code", None) == 429
    assert "Retry-After" in (getattr(ei.value, "headers", None) or {})

    # A different account must still be allowed.
    dep(request=_req(), user=_User("erin"))


def test_429_message_tells_the_user_when_to_retry():
    dep = rl.costly_guard("test_retry_after_text", limit=1, window=60.0)
    dep(request=_req(), user=_User("frank"))
    with pytest.raises(Exception) as ei:
        dep(request=_req(), user=_User("frank"))
    detail = str(getattr(ei.value, "detail", ""))
    assert "Try again in" in detail and "seconds" in detail
