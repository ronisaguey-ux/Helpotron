"""Session visibility + revocation routes (`/api/user/sessions`).

WHY THIS FILE EXISTS
A user could not see or end their own sessions. 2FA only guards sign-in; once a
session exists, a stolen cookie was invisible and unkillable from inside the app.
These routes close that.

The tests that matter are the SECURITY ones, not the happy path:
  - a token must never be returned (not the raw value, not its hash)
  - one user must not see or end another user's session
  - an API key must not be able to end the owner's sessions (denial of service)
  - revoke-others must keep the session making the request
"""
import re

from datetime import datetime, timedelta, timezone

from server.database import SessionLocal, UserSession
from server.security import SessionStore, _hash_token

HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _seed_session(public_id: str, user_id: int = 1, ua: str = None, ip: str = None) -> str:
    """Insert a session row directly and return the RAW token (as create_session would)."""
    import secrets
    token = secrets.token_urlsafe(48)
    db = SessionLocal()
    try:
        db.add(UserSession(
            token=_hash_token(token),
            user_id=user_id,
            public_id=public_id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            user_agent=ua,
            ip=ip,
        ))
        db.commit()
    finally:
        db.close()
    return token


def _login(client, public_id: str, password: str = "TestPass123"):
    """Sign up + log in, returning auth headers. Mirrors conftest's helper."""
    from conftest import _get_auth_headers_for_user
    return _get_auth_headers_for_user(public_id)


def _user_with_session(public_id: str, plan: str = "none"):
    """Create a user and a REAL session, returning (user_id, raw_token).

    The conftest fixture authenticates with a JWT, which has no session row — so
    `is_current` can never be true under it. The session-visibility feature is
    about DB sessions (what login sets as a cookie), so these tests mint a real
    one, exactly as the browser does.
    """
    from server.database import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(public_id=public_id, plan=plan, credits=0.0,
                        settings={"2fa_enabled": True, "token_balance": 100.0})
            db.add(user)
            db.commit()
            db.refresh(user)
        uid = user.id
    finally:
        db.close()

    token = SessionStore.create_session(user_id=uid, public_id=public_id)
    return uid, token, {"helpotron_session": token}


def _csrf(client):
    """The double-submit pair for a cookie-authenticated mutating request.

    `validate_csrf` exempts Bearer auth but not cookie auth, so any POST/DELETE
    carrying `helpotron_session` also needs the cookie + matching header — which
    is exactly what the browser sends. Minting it here keeps the tests on the real
    path instead of sidestepping the middleware.
    """
    r = client.get("/api/csrf")
    tok = r.json().get("csrf_token") or r.cookies.get("csrf_token", "")
    return {"X-CSRF-Token": tok}, {"csrf_token": tok}


def test_sessions_require_authentication(client):
    """Anonymous access must be refused on all three routes."""
    assert client.get("/api/user/sessions").status_code in (401, 403)
    assert client.delete("/api/user/sessions/1").status_code in (401, 403)
    assert client.post("/api/user/sessions/revoke-others").status_code in (401, 403)


def test_list_returns_own_sessions_and_never_a_token(client):
    _uid, _tok, cookies = _user_with_session("sess_list_owner")
    r = client.get("/api/user/sessions", cookies=cookies)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "success"
    assert isinstance(body["sessions"], list)
    assert body["sessions"], "a logged-in caller must see at least its own session"

    for s in body["sessions"]:
        # The credential must not leak in any form.
        assert "token" not in s, "the raw token must never be returned"
        assert not any(HEX64.match(str(v)) for v in s.values()), \
            "a stored hash must never be returned either"
        # And the shape the UI needs must be present.
        for k in ("id", "created_at", "last_used_at", "device", "is_current"):
            assert k in s

    assert sum(1 for s in body["sessions"] if s["is_current"]) == 1, \
        "exactly one row must be marked current"
    assert body["current_session_id"] is not None


def test_one_user_cannot_see_another_users_session(client):
    """A session list must be scoped to the caller, not global."""
    uid_a, _tok_a, cookies_a = _user_with_session("sess_scope_a")
    uid_b, tok_b, _cookies_b = _user_with_session("sess_scope_b")

    r = client.get("/api/user/sessions", cookies=cookies_a)
    assert r.status_code == 200, r.text
    ids = [s["id"] for s in r.json()["sessions"]]

    db = SessionLocal()
    try:
        row_b = db.query(UserSession).filter(UserSession.token == _hash_token(tok_b)).first()
        b_id = row_b.id if row_b else None
    finally:
        db.close()

    assert b_id is not None
    assert b_id not in ids, "another user's session must not appear in the list"
    assert uid_a != uid_b


def test_cannot_revoke_another_users_session(client):
    """A foreign id must be indistinguishable from a missing one (404, not 403)."""
    _uid_v, _tok_v, _ck_v = _user_with_session("sess_victim")
    _uid_a, _tok_a, cookies_a = _user_with_session("sess_attacker")

    db = SessionLocal()
    try:
        row = db.query(UserSession).filter(UserSession.public_id == "sess_victim").first()
        victim_id = row.id
    finally:
        db.close()

    hdrs, ck = _csrf(client)
    r = client.delete(f"/api/user/sessions/{victim_id}",
                      cookies={**cookies_a, **ck}, headers=hdrs)
    assert r.status_code == 404, f"foreign session must 404, got {r.status_code}: {r.text}"

    # And the victim's session must still exist.
    db = SessionLocal()
    try:
        assert db.query(UserSession).filter(UserSession.id == victim_id).first() is not None
    finally:
        db.close()


def test_revoke_others_keeps_the_calling_session(client):
    """Sign out everywhere ELSE — the session making the request survives."""
    uid, _tok, cookies = _user_with_session("sess_revoker")
    # A second session for the same account, which must be ended.
    SessionStore.create_session(user_id=uid, public_id="sess_revoker")

    hdrs, ck = _csrf(client)
    r = client.post("/api/user/sessions/revoke-others",
                    cookies={**cookies, **ck}, headers=hdrs)
    assert r.status_code == 200, r.text
    assert r.json()["revoked"] >= 1

    after = client.get("/api/user/sessions", cookies=cookies)
    assert after.status_code == 200, "the calling session must survive"
    assert sum(1 for s in after.json()["sessions"] if s["is_current"]) == 1


def test_refresh_records_last_used_and_device(client):
    """last_used_at must be populated by a real authenticated request."""
    _uid, _tok, cookies = _user_with_session("sess_refresh")
    client.get("/api/user/sessions", cookies=cookies)  # this request IS the refresh
    r = client.get("/api/user/sessions", cookies=cookies)
    assert r.status_code == 200
    current = next(s for s in r.json()["sessions"] if s["is_current"])
    assert current["last_used_at"], "refresh_session must stamp last_used_at"
    assert current["device"], "the device label must never be empty"
    # The label is coarse on purpose — a full UA string would be a fingerprint.
    assert "Mozilla/" not in current["device"]


def test_an_api_key_cannot_list_or_revoke_sessions(client):
    """An extension credential must not reach the session surface.

    A key that can end the owner's browser sessions is a denial of service, and
    the list itself reveals where the account is being used.
    """
    uid, _tok, _cookies = _user_with_session("sess_apikey_scope")
    _uid2, _tok2, cookies2 = _user_with_session("sess_apikey_owner")

    from server.database import User
    from server import api_keys as keys

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "sess_apikey_owner").first()
        _row, plaintext = keys.generate_key(db, user, label="test")
    finally:
        db.close()

    h = {"Authorization": f"Bearer {plaintext}"}
    assert client.get("/api/user/sessions", headers=h).status_code in (401, 403), \
        "an API key must not list sessions"
    assert client.post("/api/user/sessions/revoke-others", headers=h).status_code in (401, 403)
    assert uid is not None and cookies2
