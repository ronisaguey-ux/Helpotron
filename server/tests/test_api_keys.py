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

        assert K.revoke_key(db, u, row.id)
        assert K.check_api_key(db, plain) == (None, "revoked")
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
        assert K.revoke_key(db, other, row.id) is False
        db.refresh(row)
        assert row.revoked_at is None
    finally:
        db.close()
