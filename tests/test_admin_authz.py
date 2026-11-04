"""Admin-surface authorization + attribution regressions (audit-v5 A2, cat 6).

Three invariants this file pins down, each of which was false before the fixes:

1. `POST /api/admin/user/{pid}/kick` and `.../unban` must honour the same
   protected-target rule their siblings (ban / tempban / delete /
   change-password) do: a non-owner admin cannot sign the owner out of every
   device, nor lift the owner's ban state.
2. `admin_audit` rows must name the admin who acted. Every call site read
   `request.state.public_id`, which is never set, so the trail recorded the
   literal actor "admin" for every credit adjustment / token grant / plan change.
3. The email lane of mandatory purchase 2FA must deliver its code to the
   account's real address — it was addressed to the user's public_id, so no code
   could ever arrive and the failure was reported as "email not configured".
"""
import os
import uuid

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_admin_authz.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters!")

import pytest
from fastapi.testclient import TestClient

from server.auth_2fa import code_store, email_service
from server.database import AdminAction, Base, SessionLocal, User, engine
from server.security import create_jwt_token, hash_password


@pytest.fixture(scope="module", autouse=True)
def _schema():
    Base.metadata.create_all(engine)


@pytest.fixture
def client():
    from server.main import app
    return TestClient(app)


def _make_user(role="member", settings=None, public_id=None):
    db = SessionLocal()
    try:
        pid = public_id or f"adm-{uuid.uuid4().hex[:10]}"
        existing = db.query(User).filter(User.public_id == pid).first()
        if existing is not None:
            return existing.id, pid
        h, s = hash_password("userPassword123")
        u = User(public_id=pid, plan="free", credits=0, role=role,
                 password_hash=h, password_salt=s, settings=settings or {})
        db.add(u)
        db.commit()
        db.refresh(u)
        return u.id, pid
    finally:
        db.close()


def _auth(uid):
    return {"Authorization": f"Bearer {create_jwt_token(uid)}"}


@pytest.fixture(scope="module")
def actors():
    """A non-owner platform admin, an ordinary user, and the owner account."""
    admin_id, admin_pid = _make_user(role="admin")
    member_id, member_pid = _make_user()
    owner_id, owner_pid = _make_user(public_id="RoniDev")
    return {
        "admin": (admin_id, admin_pid, _auth(admin_id)),
        "member": (member_id, member_pid, _auth(member_id)),
        "owner": (owner_id, owner_pid, _auth(owner_id)),
    }


# ─── protected targets ────────────────────────────────────────────────────────

def test_non_owner_admin_cannot_kick_the_owner(client, actors):
    _, owner_pid, _ = actors["owner"]
    res = client.post(f"/api/admin/user/{owner_pid}/kick",
                      headers=actors["admin"][2])
    assert res.status_code == 403, f"expected 403, got {res.status_code}: {res.text}"
    assert "administrative" in res.json()["detail"].lower() or "owner" in res.json()["detail"].lower()


def test_non_owner_admin_cannot_unban_the_owner(client, actors):
    _, owner_pid, _ = actors["owner"]
    res = client.post(f"/api/admin/user/{owner_pid}/unban",
                      headers=actors["admin"][2])
    assert res.status_code == 403, f"expected 403, got {res.status_code}: {res.text}"


def test_admin_can_still_kick_a_regular_user(client, actors):
    _, member_pid, _ = actors["member"]
    res = client.post(f"/api/admin/user/{member_pid}/kick",
                      headers=actors["admin"][2])
    assert res.status_code == 200, res.text
    assert "session" in res.json()["message"].lower()


def test_member_cannot_reach_admin_user_management(client, actors):
    # A dedicated account: the shared member's JWT is revoked by the kick test
    # above, which would turn this into a 401 and hide the authorization result.
    fresh_id, fresh_pid = _make_user()
    res = client.post(f"/api/admin/user/{fresh_pid}/kick", headers=_auth(fresh_id))
    assert res.status_code == 403, f"expected 403, got {res.status_code}: {res.text}"


# ─── audit attribution ────────────────────────────────────────────────────────

def test_credit_adjustment_is_attributed_to_the_acting_admin(client, actors):
    admin_id, admin_pid, admin_auth = actors["admin"]
    _, member_pid, _ = actors["member"]

    res = client.post(
        f"/api/admin/user/{member_pid}/credits",
        params={"amount": 5, "reason": "audit-attribution-test"},
        headers=admin_auth,
    )
    assert res.status_code == 200, res.text

    db = SessionLocal()
    try:
        row = (
            db.query(AdminAction)
            .filter(AdminAction.target == member_pid,
                    AdminAction.action == "adjust-credits")
            .order_by(AdminAction.id.desc())
            .first()
        )
        assert row is not None, "no audit row written for the credit adjustment"
        assert row.actor == admin_pid, (
            f"audit actor was {row.actor!r}; the acting admin is {admin_pid!r} "
            "(the trail must name a person, not the literal string 'admin')"
        )
    finally:
        db.close()


def test_plan_change_is_attributed_to_the_acting_admin(client, actors):
    _, admin_pid, admin_auth = actors["admin"]
    _, member_pid, _ = actors["member"]

    res = client.post(f"/api/admin/user/{member_pid}/plan",
                      params={"plan": "basic"}, headers=admin_auth)
    assert res.status_code == 200, res.text

    db = SessionLocal()
    try:
        row = (
            db.query(AdminAction)
            .filter(AdminAction.target == member_pid,
                    AdminAction.action == "set-plan")
            .order_by(AdminAction.id.desc())
            .first()
        )
        assert row is not None
        assert row.actor == admin_pid
    finally:
        db.close()


# ─── purchase 2FA email lane ──────────────────────────────────────────────────

def test_purchase_email_challenge_delivers_to_the_account_address(client, monkeypatch):
    sent = []

    monkeypatch.setattr(email_service, "is_configured", staticmethod(lambda: True))

    def _fake_send(to_email, code, purpose_label="Email Verification"):
        sent.append((to_email, code))
        return True

    monkeypatch.setattr(email_service, "send_verification_code", staticmethod(_fake_send))

    uid, pid = _make_user(settings={"profile": {"email": "student@example.com"}})
    res = client.post("/api/auth/2fa/purchase-challenge",
                      json={"public_id": pid, "method": "email"},
                      headers=_auth(uid))
    assert res.status_code == 200, res.text
    assert len(sent) == 1
    assert sent[0][0] == "student@example.com", (
        f"code was addressed to {sent[0][0]!r}; it must go to the account's stored "
        "email, never the public_id"
    )
    # The response must not echo the public id as if it were an address.
    assert pid not in res.json()["destination"]
    # ...and the code the mail carried still verifies under the public_id key
    # that purchase-verify reads.
    ok, _msg = code_store.verify_code(pid, sent[0][1], purpose="purchase_verification")
    assert ok, "the emitted code must verify under the same key purchase-verify uses"


def test_purchase_email_challenge_without_an_address_is_a_clear_400(client, monkeypatch):
    monkeypatch.setattr(email_service, "is_configured", staticmethod(lambda: True))
    uid, pid = _make_user(settings={})
    res = client.post("/api/auth/2fa/purchase-challenge",
                      json={"public_id": pid, "method": "email"},
                      headers=_auth(uid))
    assert res.status_code == 400, res.text
    assert "email address" in res.json()["detail"].lower()
