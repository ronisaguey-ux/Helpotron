"""Password recovery + 2FA reset paths (audit-v5 A2, covers the r14 fixes).

server/recovery.py verify_and_reset: recovery code/link check, the 2FA gate
(totp | sms | email, `2fa_required` status), the TOTP replay guard shared with
login (verify_code_with_replay keyed on user.id), and the per-account lockout.
Route tests go through /api/recovery/verify so the async/sync boundary is
exercised exactly as production runs it.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_recovery_2fa.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters!")

import pyotp
import pytest
from fastapi.testclient import TestClient

from server import recovery
from server.auth_2fa import SMSVerification, TOTPAuthenticatorService, code_store, email_service
from server.database import Base, PasswordReset, SessionLocal, User, engine
from server.security import hash_password, verify_password

NEW_PW = "brandNewPass123"


@pytest.fixture(scope="module", autouse=True)
def _schema():
    Base.metadata.create_all(engine)


@pytest.fixture
def client():
    from server.main import app
    return TestClient(app)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    recovery._FAILED_RECOVERY_ATTEMPTS.clear()
    # Never reach Twilio Verify; the local SMS code store is used instead.
    monkeypatch.setattr(SMSVerification, "is_verify_enabled", staticmethod(lambda: False))
    yield
    recovery._FAILED_RECOVERY_ATTEMPTS.clear()


def _make_user(settings=None):
    db = SessionLocal()
    try:
        pid = f"rec-{uuid.uuid4().hex[:10]}"
        h, s = hash_password("oldPassword123")
        u = User(public_id=pid, plan="free", credits=0, password_hash=h,
                 password_salt=s, settings=settings or {})
        db.add(u)
        db.commit()
        return u.id, pid
    finally:
        db.close()


def _issue_code(user_id, pid, method="dev", minutes=30):
    db = SessionLocal()
    try:
        u = db.get(User, user_id)
        row, code = recovery._new_row(u, method)
        row.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=minutes)
        db.add(row)
        db.commit()
        return row.id, code, row.token
    finally:
        db.close()


def _verify(pid, **kw):
    db = SessionLocal()
    try:
        return recovery.verify_and_reset(db, public_id=pid, new_password=NEW_PW, **kw)
    finally:
        db.close()


def _password_is(user_id, pw):
    db = SessionLocal()
    try:
        u = db.get(User, user_id)
        return verify_password(pw, u.password_hash, u.password_salt)
    finally:
        db.close()


def _row_status(row_id):
    db = SessionLocal()
    try:
        return db.get(PasswordReset, row_id).status
    finally:
        db.close()


# ── plain recovery ──────────────────────────────────────────────────────────

def test_happy_path_code_resets_password_and_consumes_row():
    uid, pid = _make_user()
    rid, code, _ = _issue_code(uid, pid)
    res = _verify(pid, code=code)
    assert res["status"] == "success"
    assert _password_is(uid, NEW_PW)
    assert _row_status(rid) == "used"
    # single use
    with pytest.raises(ValueError, match="No active recovery request"):
        _verify(pid, code=code)


def test_link_token_also_resets():
    uid, pid = _make_user()
    _, _, token = _issue_code(uid, pid)
    assert _verify(pid, token=token)["status"] == "success"
    assert _password_is(uid, NEW_PW)


def test_wrong_code_rejected_and_password_unchanged():
    uid, pid = _make_user()
    rid, code, _ = _issue_code(uid, pid)
    bad = "000000" if code != "000000" else "111111"
    with pytest.raises(ValueError, match="Invalid recovery code"):
        _verify(pid, code=bad)
    assert _password_is(uid, "oldPassword123")
    assert _row_status(rid) == "active"


def test_expired_code_rejected():
    uid, pid = _make_user()
    rid, code, _ = _issue_code(uid, pid, minutes=-1)
    with pytest.raises(ValueError, match="expired"):
        _verify(pid, code=code)
    assert _row_status(rid) == "expired"
    assert _password_is(uid, "oldPassword123")


def test_weak_password_rejected_before_code_is_spent():
    uid, pid = _make_user()
    rid, code, _ = _issue_code(uid, pid)
    db = SessionLocal()
    try:
        with pytest.raises(ValueError, match="at least 8"):
            recovery.verify_and_reset(db, public_id=pid, new_password="short", code=code)
    finally:
        db.close()
    assert _row_status(rid) == "active"


def test_account_lockout_after_five_failures():
    uid, pid = _make_user()
    _, code, _ = _issue_code(uid, pid)
    for _ in range(5):
        with pytest.raises(ValueError):
            _verify(pid, code="999999" if code != "999999" else "888888")
    # Even the right code is refused while locked.
    with pytest.raises(ValueError, match="locked"):
        _verify(pid, code=code)
    assert _password_is(uid, "oldPassword123")


def test_route_wrong_code_is_400_with_reason(client):
    uid, pid = _make_user()
    _issue_code(uid, pid)
    r = client.post("/api/recovery/verify",
                    json={"public_id": pid, "new_password": NEW_PW, "code": "12345x"})
    assert r.status_code == 400
    assert "Invalid recovery code" in r.json()["detail"]


# ── TOTP 2FA ────────────────────────────────────────────────────────────────

def _totp_user():
    secret = pyotp.random_base32()
    uid, pid = _make_user({"2fa_enabled": True, "2fa_method": "totp", "2fa_totp_secret": secret})
    return uid, pid, secret


def test_totp_account_blocked_without_2fa_code():
    uid, pid, _ = _totp_user()
    rid, code, _ = _issue_code(uid, pid)
    res = _verify(pid, code=code)
    assert res["status"] == "2fa_required"
    assert res["method"] == "totp"
    assert _password_is(uid, "oldPassword123")
    assert _row_status(rid) == "active"  # code not burned by the challenge


def test_totp_wrong_code_rejected():
    uid, pid, secret = _totp_user()
    _, code, _ = _issue_code(uid, pid)
    good = pyotp.TOTP(secret).now()
    bad = "000000" if good != "000000" else "111111"
    with pytest.raises(ValueError, match="two-factor"):
        _verify(pid, code=code, two_factor_code=bad)
    assert _password_is(uid, "oldPassword123")


def test_totp_accepted_once_then_replay_rejected():
    uid, pid, secret = _totp_user()
    TOTPAuthenticatorService._used_steps.clear()
    otp = pyotp.TOTP(secret).now()
    _, code1, _ = _issue_code(uid, pid)
    assert _verify(pid, code=code1, two_factor_code=otp)["status"] == "success"
    assert _password_is(uid, NEW_PW)
    # A second recovery with the SAME authenticator code must fail.
    _, code2, _ = _issue_code(uid, pid)
    with pytest.raises(ValueError, match="two-factor"):
        _verify(pid, code=code2, two_factor_code=otp)


def test_totp_code_used_at_login_cannot_be_replayed_in_recovery():
    uid, pid, secret = _totp_user()
    otp = pyotp.TOTP(secret).now()
    # Login consumes the step under the same identifier (user.id).
    assert TOTPAuthenticatorService.verify_code_with_replay(uid, secret, otp)
    _, code, _ = _issue_code(uid, pid)
    with pytest.raises(ValueError, match="two-factor"):
        _verify(pid, code=code, two_factor_code=otp)


def test_route_returns_2fa_required_status(client):
    uid, pid, _ = _totp_user()
    _, code, _ = _issue_code(uid, pid)
    r = client.post("/api/recovery/verify",
                    json={"public_id": pid, "new_password": NEW_PW, "code": code})
    assert r.status_code == 200
    assert r.json()["status"] == "2fa_required"
    assert _password_is(uid, "oldPassword123")


# ── SMS 2FA ─────────────────────────────────────────────────────────────────

def _sms_user(**extra):
    st = {"2fa_enabled": True, "2fa_method": "sms", "phone_number": "+15555550123"}
    st.update(extra)
    return _make_user(st)


def test_sms_2fa_sends_code_and_accepts_it(client, monkeypatch):
    sent = {}

    async def fake_send(to_phone, code):
        sent["phone"], sent["code"] = to_phone, code
        return True

    from server.auth_2fa import sms_service
    monkeypatch.setattr(sms_service, "send_sms_code", fake_send)
    uid, pid = _sms_user()
    _, code, _ = _issue_code(uid, pid)
    body = {"public_id": pid, "new_password": NEW_PW, "code": code}
    r = client.post("/api/recovery/verify", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "2fa_required"
    assert sent["phone"] == "+15555550123"
    r = client.post("/api/recovery/verify", json={**body, "two_factor_code": sent["code"]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "success"
    assert _password_is(uid, NEW_PW)


def test_sms_2fa_wrong_code_rejected(client, monkeypatch):
    from server.auth_2fa import sms_service

    async def fake_send(to_phone, code):
        return True

    monkeypatch.setattr(sms_service, "send_sms_code", fake_send)
    uid, pid = _sms_user()
    _, code, _ = _issue_code(uid, pid)
    body = {"public_id": pid, "new_password": NEW_PW, "code": code}
    assert client.post("/api/recovery/verify", json=body).json()["status"] == "2fa_required"
    r = client.post("/api/recovery/verify", json={**body, "two_factor_code": "000000000000"})
    assert r.status_code == 400
    assert _password_is(uid, "oldPassword123")


def test_sms_2fa_send_failure_is_reported(client, monkeypatch):
    from server.auth_2fa import sms_service

    async def fake_send(to_phone, code):
        return False

    monkeypatch.setattr(sms_service, "send_sms_code", fake_send)
    uid, pid = _sms_user()
    _, code, _ = _issue_code(uid, pid)
    r = client.post("/api/recovery/verify",
                    json={"public_id": pid, "new_password": NEW_PW, "code": code})
    assert r.status_code == 400
    assert "could not be texted" in r.json()["detail"]


def test_sms_2fa_opted_out_is_reported(client, monkeypatch):
    calls = []

    async def fake_send(to_phone, code):
        calls.append(to_phone)
        return True

    from server.auth_2fa import sms_service
    monkeypatch.setattr(sms_service, "send_sms_code", fake_send)
    uid, pid = _sms_user(sms_opt_out=True)
    _, code, _ = _issue_code(uid, pid)
    r = client.post("/api/recovery/verify",
                    json={"public_id": pid, "new_password": NEW_PW, "code": code})
    assert r.status_code == 400
    assert "STOP" in r.json()["detail"]
    assert calls == []


# ── email 2FA ───────────────────────────────────────────────────────────────

def _email_user():
    return _make_user({"2fa_enabled": True, "2fa_method": "email",
                       "profile": {"email": "student@example.edu"}})


def test_email_2fa_sends_code_and_accepts_it_once(monkeypatch):
    sent = {}
    monkeypatch.setattr(email_service, "is_configured", staticmethod(lambda: True))

    def fake_send(to, code, purpose_label="x"):
        sent["to"], sent["code"] = to, code
        return True

    monkeypatch.setattr(email_service, "send_verification_code", fake_send)
    uid, pid = _email_user()
    _, code, _ = _issue_code(uid, pid)
    assert _verify(pid, code=code)["status"] == "2fa_required"
    assert sent["to"] == "student@example.edu"
    assert len(sent["code"]) == 12
    assert _verify(pid, code=code, two_factor_code=sent["code"])["status"] == "success"
    assert _password_is(uid, NEW_PW)
    # The emailed code is burned.
    assert code_store.verify_code(pid, sent["code"], purpose="2fa_challenge")[0] is False


def test_email_2fa_wrong_code_rejected(monkeypatch):
    monkeypatch.setattr(email_service, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(email_service, "send_verification_code", lambda *a, **k: True)
    uid, pid = _email_user()
    _, code, _ = _issue_code(uid, pid)
    assert _verify(pid, code=code)["status"] == "2fa_required"
    with pytest.raises(ValueError, match="two-factor"):
        _verify(pid, code=code, two_factor_code="000000000000")
    assert _password_is(uid, "oldPassword123")


def test_email_2fa_unconfigured_smtp_is_reported_not_silent(monkeypatch):
    monkeypatch.setattr(email_service, "is_configured", staticmethod(lambda: False))
    uid, pid = _email_user()
    _, code, _ = _issue_code(uid, pid)
    with pytest.raises(ValueError, match="cannot be sent"):
        _verify(pid, code=code)


def test_email_2fa_send_failure_is_reported(monkeypatch):
    monkeypatch.setattr(email_service, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(email_service, "send_verification_code", lambda *a, **k: False)
    uid, pid = _email_user()
    _, code, _ = _issue_code(uid, pid)
    with pytest.raises(ValueError, match="could not be emailed"):
        _verify(pid, code=code)


def test_2fa_enabled_without_usable_factor_does_not_block():
    # totp enabled but no secret stored: mirrors login, which does not challenge.
    uid, pid = _make_user({"2fa_enabled": True, "2fa_method": "totp"})
    _, code, _ = _issue_code(uid, pid)
    assert _verify(pid, code=code)["status"] == "success"
