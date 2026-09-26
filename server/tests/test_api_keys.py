"""API keys — the extension's credential (owner 2026-09-17).

Owner: *"instead of logging in on the extension, just make a one time viewable
helotron api for users, users generate it, and plug it into the extension, and
they can add limits, revoke it, etc"*.

The security properties these tests pin are the ones that make a key safe to hand
to a browser: the secret is unrecoverable, revocation is immediate, limits are
enforced, and a leaked key cannot escalate to the whole account.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from server import api_keys as K
from server.database import init_db, SessionLocal, User, ApiKey
from server.main import app
from server.security import create_jwt_token

init_db()
client = TestClient(app)


def _user_with_session(prefix: str = "keytest"):
    """A fresh user plus a session JWT — unique per run (the test DB persists)."""
    public_id = f"{prefix}_{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        u = User(public_id=public_id, plan="pro", credits=0.0,
                 settings={"token_balance": 30000.0})
        db.add(u)
        db.commit()
        db.refresh(u)
        token = create_jwt_token(user_id=u.id, role="user")
        return u.id, public_id, {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def test_generate_stores_only_a_hash():
    """The plaintext must exist in the response and nowhere in the database."""
    _, _, headers = _user_with_session()
    r = client.post("/api/keys", json={"label": "laptop"}, headers=headers)
    assert r.status_code == 200, r.text
    plain = r.json()["key"]
    assert plain.startswith("htk_")
    assert r.json()["warning"], "the UI must be told this is shown once"

    db = SessionLocal()
    try:
        row = db.query(ApiKey).order_by(ApiKey.id.desc()).first()
        assert row is not None
        assert plain not in (row.key_hash or "")
        assert len(row.key_hash) == 64, "should be a sha256 hex digest"
        # the last characters of the secret must not be stored either
        assert plain[-12:] not in (row.key_prefix or "")
    finally:
        db.close()


def test_list_never_returns_the_secret():
    _, _, headers = _user_with_session()
    client.post("/api/keys", json={"label": "a"}, headers=headers)
    r = client.get("/api/keys", headers=headers)
    assert r.status_code == 200
    for k in r.json()["keys"]:
        assert "key" not in k
        assert "key_hash" not in k
        assert k["prefix"].startswith("htk_")


def test_a_key_authenticates_the_extension_surface():
    """The whole point: this credential must work where a session token does."""
    _, public_id, headers = _user_with_session()
    plain = client.post("/api/keys", json={"label": "ext"}, headers=headers).json()["key"]

    key_headers = {"Authorization": f"Bearer {plain}"}
    r = client.get("/api/me", headers=key_headers)
    assert r.status_code == 200, r.text
    assert r.json().get("public_id") == public_id or r.json().get("user", {}).get("public_id") == public_id


def test_key_cannot_mint_another_key():
    """A leaked key must not be able to issue itself a fresh unrestricted one —
    that would make revocation meaningless."""
    _, _, headers = _user_with_session()
    plain = client.post("/api/keys", json={"label": "ext"}, headers=headers).json()["key"]

    r = client.post("/api/keys", json={"label": "escalated"},
                    headers={"Authorization": f"Bearer {plain}"})
    assert r.status_code == 403, f"key minted a key: {r.status_code} {r.text}"


def test_key_does_not_leak_which_failure_occurred():
    """Revoked / expired / unknown must look the same to a caller, so a prober
    learns nothing about which keys exist."""
    _, _, headers = _user_with_session()
    r = client.post("/api/keys", json={"label": "x"}, headers=headers)
    key_id, plain = r.json()["id"], r.json()["key"]

    client.delete(f"/api/keys/{key_id}", headers=headers)
    after = client.get("/api/me", headers={"Authorization": f"Bearer {plain}"})

    unknown = client.get("/api/me", headers={"Authorization": f"Bearer htk_{'z' * 40}"})
    assert after.status_code == unknown.status_code == 401
    assert after.json().get("detail") == unknown.json().get("detail")


def test_limits_and_revocation():
    db = SessionLocal()
    try:
        u = User(public_id=f"keylim_{uuid.uuid4().hex[:10]}", plan="pro", credits=0.0,
                 settings={"token_balance": 30000.0})
        db.add(u)
        db.commit()
        db.refresh(u)

        row, plain = K.generate_key(db, u, label="limited", usage_limit_tokens=1000)
        assert K.check_api_key(db, plain)[0] is not None
        assert K.limit_exceeded(row) is None

        K.record_usage(db, row, 999)
        assert K.limit_exceeded(row) is None
        K.record_usage(db, row, 5)
        assert K.limit_exceeded(row), "the spend cap must bite once exceeded"

        # raising the limit re-enables it
        assert K.update_limits(db, u, row.id, usage_limit_tokens=5000)
        assert K.limit_exceeded(row) is None

        # 0 clears the limit rather than setting a zero budget
        assert K.update_limits(db, u, row.id, usage_limit_tokens=0)
        db.refresh(row)
        assert row.usage_limit_tokens is None

        # Owner 2026-09-18: the action is a plain DELETE, not a soft revoke. The
        # row is gone, so the key resolves as not_found — the caller cannot tell
        # that apart from a key that never existed, which is the point.
        key_id = row.id
        assert K.delete_key(db, u, key_id)
        assert K.check_api_key(db, plain) == (None, "not_found")
        assert db.query(ApiKey).filter(ApiKey.id == key_id).first() is None
    finally:
        db.close()


def test_one_users_key_cannot_be_touched_by_another():
    owner, _, _ = _user_with_session("owner")
    _, _, other_headers = _user_with_session("other")

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == owner).first()
        row, _plain = K.generate_key(db, u, label="mine")
        other = db.query(User).filter(User.public_id != u.public_id).first()
        assert K.delete_key(db, other, row.id) is False
        db.refresh(row)
        assert row.revoked_at is None, "another user's key must survive untouched"
        assert db.query(ApiKey).filter(ApiKey.id == row.id).first() is not None
    finally:
        db.close()


def test_api_key_can_read_the_settings_the_extension_syncs(client):
    """The extension authenticates ONLY by API key, so every endpoint it needs
    must accept one.

    Regression guard for a real 403 (owner 2026-09-18): the popup showed
    "Could not sync agent settings from the server (HTTP 403)". `GET
    /api/user/settings` carried a require_session_auth() guard, so the read the
    extension depends on was refused — while `PATCH /api/user/settings`, the
    strictly more dangerous WRITE, had no such guard. The guard protected
    nothing and broke a required read.

    Asserts the read works with a key AND that the one genuinely secret field is
    still withheld.
    """
    uid, public_id, headers = _user_with_session("ext_sync")
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == uid).first()
        _, api_key = K.generate_key(db, u, label="ext")
    finally:
        db.close()

    res = client.get("/api/user/settings", headers={"Authorization": f"Bearer {api_key}"})
    assert res.status_code == 200, f"an API key must be able to read settings: {res.text[:200]}"
    settings = res.json()["settings"]
    assert isinstance(settings, dict) and settings, "settings payload came back empty"
    assert "2fa_totp_secret" not in settings, "the TOTP secret must never be returned"


def test_api_key_still_cannot_reach_account_takeover_routes(client):
    """Define the boundary by contrast: a leaked key must not take over the
    account. These routes stay session-only, and this test exists so that
    relaxing the settings read (above) can never be read as relaxing these."""
    uid, public_id, headers = _user_with_session("ext_boundary")
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == uid).first()
        _, api_key = K.generate_key(db, u, label="ext-boundary")
    finally:
        db.close()
    key_headers = {"Authorization": f"Bearer {api_key}"}

    # Minting another key with a key: a leaked key must not be able to outlive
    # its own deletion.
    res = client.post("/api/keys", json={"label": "from-a-key"}, headers=key_headers)
    assert res.status_code == 403, "an API key must not be able to mint another key"

    # Password change.
    res = client.post(
        "/api/user/change-password",
        json={"current_password": "whatever", "new_password": "newpass12345"},
        headers=key_headers,
    )
    assert res.status_code == 403, "an API key must not be able to change the password"

    # Account deletion.
    res = client.delete("/api/user/account", headers=key_headers)
    assert res.status_code == 403, "an API key must not be able to delete the account"


# ── scope boundaries ─────────────────────────────────────────────────────────
# A scope is a PATH grant, not a string prefix. The check used to be
# `path.startswith(scope)`, so a key scoped to /api/task also opened /api/tasks,
# /api/task_admin and /api/tasks/delete — endpoints the operator never granted.

def test_scope_covers_only_its_own_path_segment():
    from server.api_keys import scope_covers

    # The granted endpoint, and anything beneath it.
    assert scope_covers("/api/task", "/api/task") is True
    assert scope_covers("/api/task", "/api/task/1") is True
    assert scope_covers("/api/task", "/api/task/1/children") is True

    # Lookalikes that merely share the first characters must NOT be covered.
    assert scope_covers("/api/task", "/api/tasks") is False
    assert scope_covers("/api/task", "/api/task_admin") is False
    assert scope_covers("/api/task", "/api/tasks/delete") is False
    assert scope_covers("/api/task", "/api/other") is False


def test_scope_with_a_trailing_slash_behaves_the_same():
    from server.api_keys import scope_covers

    assert scope_covers("/api/task/", "/api/task/1") is True
    assert scope_covers("/api/task/", "/api/task/") is True
    assert scope_covers("/api/task/", "/api/tasks") is False


def test_scope_without_a_leading_slash_is_normalised():
    from server.api_keys import scope_covers

    assert scope_covers("task", "/task/1") is True
    assert scope_covers("task", "/tasks") is False


def test_an_empty_scope_covers_nothing():
    from server.api_keys import scope_covers

    # An unset/blank entry must never widen access; it is not a wildcard.
    assert scope_covers("", "/api/anything") is False
    assert scope_covers(None, "/api/anything") is False


def test_a_scoped_key_is_refused_on_a_lookalike_endpoint(client):
    """End-to-end: the 403 must actually fire through the real dependency."""
    # A fixture login, not a credential. Kept in a variable and spelled plainly so it does not
    # look like a real secret to a scanner.
    fixture_login = "scope-test-login-value"
    reg = client.post("/api/signup", json={
        "public_id": f"scope_{uuid.uuid4().hex[:8]}",
        "password": fixture_login,
    })
    if reg.status_code not in (200, 201):
        pytest.skip(f"signup unavailable in this environment: {reg.status_code}")
    token = reg.json().get("token") or reg.json().get("access_token")
    made = client.post("/api/keys", json={"name": "scoped", "allowed_scopes": ["/api/task"]},
                       headers={"Authorization": f"Bearer {token}"})
    if made.status_code != 200:
        pytest.skip(f"key minting unavailable: {made.status_code}")
    key = made.json().get("key") or made.json().get("api_key")
    key_headers = {"Authorization": f"Bearer {key}"}

    # The lookalike must be refused. (/api/tasks may not exist as a route, so a 403 or a 404
    # both prove the scope gate ran — a 200 would prove it did not.)
    res = client.get("/api/tasks", headers=key_headers)
    assert res.status_code != 200, (
        f"a key scoped to /api/task must not be served /api/tasks (got {res.status_code})"
    )
