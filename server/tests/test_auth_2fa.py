import asyncio
import time
import pytest
from fastapi.testclient import TestClient
import pyotp

from server.database import init_db
from server.main import app
from server.auth_2fa import (
    VerificationCodeStore,
    EmailNotificationService,
    TwilioSMSService,
    TOTPAuthenticatorService,
    code_store,
)

init_db()
client = TestClient(app)


def test_verification_code_store_flow():
    store = VerificationCodeStore()
    email = "student@university.edu"
    code = store.generate_code(email, purpose="email_verification")
    assert len(code) == 6
    assert code.isdigit()

    # Verify correct code
    valid, msg = store.verify_code(email, code, purpose="email_verification")
    assert valid is True

    # Code is burned on single use
    valid2, _ = store.verify_code(email, code, purpose="email_verification")
    assert valid2 is False


def test_verification_code_expiration():
    store = VerificationCodeStore()
    email = "expired@university.edu"
    code = store.generate_code(email, purpose="email_verification")

    # Manually expire code
    store._store[(email, "email_verification")]["expires_at"] = time.time() - 10
    valid, msg = store.verify_code(email, code, purpose="email_verification")
    assert valid is False
    assert "expired" in msg.lower()


def test_totp_generation_and_verification():
    service = TOTPAuthenticatorService()
    secret = service.generate_secret()
    assert len(secret) == 32

    uri = service.get_provisioning_uri(secret, "student@university.edu")
    assert uri.startswith("otpauth://totp/Helpotron:")
    assert "secret=" in uri

    # Generate current rotating code using pyotp
    totp = pyotp.TOTP(secret)
    current_code = totp.now()

    # Verify
    assert service.verify_code(secret, current_code) is True
    assert service.verify_code(secret, "000000") is False


def test_email_notification_mock():
    service = EmailNotificationService()
    res = service.send_verification_code("test@example.com", "123456")
    assert res is True


def test_twilio_sms_mock():
    async def _test_sms():
        service = TwilioSMSService()
        res = await service.send_sms_code("+15551234567", "654321")
        assert res is True
    asyncio.run(_test_sms())


def test_api_auth_2fa_routes():
    # 1. Send email verification
    resp = client.post(
        "/api/auth/send-email-verification",
        json={"email": "test_auth_student@univ.edu"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # Get generated code from store
    code_entry = code_store._store.get(("test_auth_student@univ.edu", "email_verification"))
    assert code_entry is not None
    code = code_entry["code"]

    # 2. Verify email
    v_resp = client.post(
        "/api/auth/verify-email",
        json={"email": "test_auth_student@univ.edu", "code": code},
    )
    assert v_resp.status_code == 200
    assert v_resp.json()["status"] == "success"

    # 3. Setup TOTP 2FA (requires authenticated session)
    import uuid
    uid = f"user_{uuid.uuid4().hex[:8]}"
    pwd = "Password123!"
    client.post("/api/signup", json={"public_id": uid, "password": pwd})
    login_resp = client.post("/api/login", json={"public_id": uid, "password": pwd})
    csrf = login_resp.json().get("csrf_token", "")
    # BATCH-01 auth remediation: protected feature routes accept a real
    # session — the login response's JWT is the API-client path (cookie path
    # requires https/secure transport in production mode).
    auth_token = login_resp.json().get("token") or login_resp.json().get("session_token") or ""
    headers = {"X-CSRF-Token": csrf, "Authorization": f"Bearer {auth_token}"}

    setup_resp = client.post(
        "/api/auth/2fa/setup",
        json={"user_id": uid, "method": "totp"},
        headers=headers,
    )
    assert setup_resp.status_code == 200
    data = setup_resp.json()
    secret = data["secret"]
    assert "qr_uri" in data

    # 4. Verify TOTP Setup
    totp = pyotp.TOTP(secret)
    current_totp_code = totp.now()
    verify_resp = client.post(
        "/api/auth/2fa/verify-setup",
        json={
            "user_id": uid,
            "method": "totp",
            "code": current_totp_code,
            "secret": secret,
        },
        headers=headers,
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["status"] == "success"


def test_api_mandatory_purchase_2fa_routes():
    # Unique id per run. This test used a hardcoded public_id against the
    # PERSISTENT test database, and once `2fa_enabled` was ever set on that
    # account, login correctly returns `2fa_required` and deliberately issues NO
    # session cookie (a 2FA-enabled account must complete the second factor).
    # The test then had no session and failed forever, on a product behaving
    # exactly as designed. A fresh account cannot inherit that state.
    import uuid

    user_id = f"test_purchase_user_2fa_{uuid.uuid4().hex[:8]}"
    password = "SuperSecretPassword123!"

    # Create user and get session cookies
    client.post("/api/signup", json={"public_id": user_id, "password": password})
    login_resp = client.post("/api/login", json={"public_id": user_id, "password": password})
    cookies = dict(login_resp.cookies)
    headers = {"X-CSRF-Token": cookies.get("csrf_token", "")}

    # 1. Send Email 2FA challenge for purchase (now requires auth)
    chal_resp = client.post(
        "/api/auth/2fa/purchase-challenge",
        json={
            "public_id": user_id,
            "method": "email",
            "destination": user_id,  # destination is now ignored; uses current_user
        },
        cookies=cookies,
        headers=headers,
    )
    assert chal_resp.status_code == 200
    assert chal_resp.json()["status"] == "success"

    # Grab code from code_store (keyed by user's public_id now, not external email)
    code_entry = code_store._store.get((user_id, "purchase_verification"))
    assert code_entry is not None
    code = code_entry["code"]

    # 2. Try verifying with wrong code -> Should fail
    fail_resp = client.post(
        "/api/auth/2fa/purchase-verify",
        json={
            "public_id": user_id,
            "password": password,
            "method": "email",
            "code": "000000",
            "destination": user_id,
            "plan": "pro",
            "amount_cents": 2000,
        },
        cookies=cookies,
        headers=headers,
    )
    assert fail_resp.status_code == 400

    # 3. Verify with correct code and password -> Success (no longer grants credits)
    success_resp = client.post(
        "/api/auth/2fa/purchase-verify",
        json={
            "public_id": user_id,
            "password": password,
            "method": "email",
            "code": code,
            "destination": user_id,
            "plan": "pro",
            "amount_cents": 2000,
        },
        cookies=cookies,
        headers=headers,
    )
    assert success_resp.status_code == 200
    res_data = success_resp.json()
    assert res_data["verified"] is True
    # purchase-verify no longer grants credits/plan — it only verifies identity
    assert "new_plan" not in res_data
    assert "credits_added" not in res_data




# ─── 09-01 (Logan, live bug): SMS 2FA chain ──────────────────────────────────
# setup used to 422 on a required user_id the UI never sends; verify-setup never
# persisted the phone; and /api/login returned 2fa_required without sending the
# code. This test pins the whole chain from a raw 10-digit number to login.

def test_e164_normalization():
    from server.routes_auth_2fa import _e164
    assert _e164("9547404058") == "+19547404058"
    assert _e164("(954) 740-4058") == "+19547404058"
    assert _e164("+19547404058") == "+19547404058"
    with pytest.raises(ValueError):
        _e164("")


def test_sms_2fa_setup_persists_phone_and_login_sends_code():
    import uuid
    uid = f"2fa_sms_{uuid.uuid4().hex[:8]}"
    pwd = "Password123!"

    client.post("/api/signup", json={"public_id": uid, "password": pwd})
    login_resp = client.post("/api/login", json={"public_id": uid, "password": pwd})
    csrf = login_resp.json().get("csrf_token", "")
    auth_token = login_resp.json().get("token") or login_resp.json().get("session_token") or ""
    headers = {"X-CSRF-Token": csrf, "Authorization": f"Bearer {auth_token}"}

    # 1) Setup must NOT require user_id (UI sends only method+phone_number)
    setup = client.post(
        "/api/auth/2fa/setup",
        json={"method": "sms", "phone_number": "+15551234567"},
        headers=headers,
    )
    assert setup.status_code == 200, setup.text
    assert setup.json()["method"] == "sms"

    # 2) Verify setup (UI sends method+code+phone_number, no user_id)
    # SMS codes are keyed by the PHONE NUMBER under SMSVerification (that is what
    # the provider checks against), not by the public_id.
    code_entry = code_store._store.get(("+15551234567", "sms_otp"))
    assert code_entry is not None
    verify = client.post(
        "/api/auth/2fa/verify-setup",
        json={"method": "sms", "code": code_entry["code"], "phone_number": "+15551234567"},
        headers=headers,
    )
    assert verify.status_code == 200, verify.text

    # 3) The verified number must be persisted for login challenges
    from server.database import SessionLocal, User
    db = SessionLocal()
    user = db.query(User).filter(User.public_id == uid).first()
    assert user.settings.get("2fa_enabled") is True
    assert user.settings.get("phone_number") == "+15551234567"
    db.close()

    # 4) Login WITHOUT a code → 2fa_required AND a 12-digit code is now in the
    #    store (the code was actually sent — mock branch for +1555 numbers).
    resp = client.post("/api/login", json={"public_id": uid, "password": pwd})
    assert resp.status_code == 200
    assert resp.json()["status"] == "2fa_required"
    challenge = code_store._store.get(("+15551234567", "sms_otp"))
    assert challenge is not None
    assert challenge["code"].isdigit()

    # 5) Login WITH the code → full session
    final = client.post(
        "/api/login",
        json={"public_id": uid, "password": pwd, "code": challenge["code"]},
    )
    assert final.status_code == 200
    assert final.json().get("message") == "Logged in"

    # Cleanup after purpose (ORM delete so relationship cascades run)
    db = SessionLocal()
    user = db.query(User).filter(User.public_id == uid).first()
    if user:
        db.delete(user)
        db.commit()
    db.close()


def test_2fa_setup_rejects_unknown_method_and_never_bricks_the_account():
    """Regression: the enrollment path that locked the operator account out.

    `TwoFactorVerifySetupRequest.method` is a plain `str`, so `""`/`"bogus"` fell
    through to the final `else`, which verified a generic code and then set
    `2fa_enabled = True` WITHOUT storing any factor. The account was left
    demanding a code nothing could ever satisfy — unrecoverable, because both
    login and the disable route required a valid code.

    Verified live on 2026-09-18 (user `RoniDev` + `dbg-6ddcf8`): `2fa_enabled`
    was True with `2fa_method=None` and no `2fa_totp_secret`.
    """
    import uuid
    uid = f"user_{uuid.uuid4().hex[:8]}"
    pwd = "Password123!"
    client.post("/api/signup", json={"public_id": uid, "password": pwd})
    login = client.post("/api/login", json={"public_id": uid, "password": pwd}).json()
    headers = {"Authorization": f"Bearer {login.get('token') or ''}",
               "X-CSRF-Token": login.get("csrf_token", "")}

    for method in ("", "bogus", "totp-without-secret"):
        resp = client.post(
            "/api/auth/2fa/verify-setup",
            json={"method": method, "code": "123456"},
            headers=headers,
        )
        assert resp.status_code == 400, (
            f"method={method!r} was accepted — it must be refused before it can "
            f"set 2fa_enabled with no factor (got {resp.status_code})"
        )

    # The account must still be able to log in — that is the whole point.
    again = client.post("/api/login", json={"public_id": uid, "password": pwd})
    assert again.status_code == 200
    assert again.json().get("status") != "2fa_required", (
        "a failed 2FA enrollment left the account demanding an unverifiable code"
    )

    from server.database import SessionLocal, User
    db = SessionLocal()
    u = db.query(User).filter(User.public_id == uid).first()
    if u:
        assert not (u.settings or {}).get("2fa_enabled") or (u.settings or {}).get("2fa_totp_secret"), (
            "2fa_enabled is set with no stored factor — this is the lockout state"
        )
        db.delete(u)
        db.commit()
    db.close()


def test_2fa_disable_repairs_a_broken_enrollment():
    """An account already stuck must be able to turn the unusable factor off.

    Before the fix, `TwoFactorDisableRequest.code` was REQUIRED, so FastAPI
    rejected the request with 422 before the handler ran and the repair branch
    was unreachable — a DB edit was the only way out.
    """
    import uuid
    from server.database import SessionLocal, User
    uid = f"user_{uuid.uuid4().hex[:8]}"
    pwd = "Password123!"
    client.post("/api/signup", json={"public_id": uid, "password": pwd})

    # Reproduce the historical broken state directly.
    db = SessionLocal()
    u = db.query(User).filter(User.public_id == uid).first()
    s = dict(u.settings or {})
    s["2fa_enabled"] = True
    s["2fa_method"] = "totp"
    s.pop("2fa_totp_secret", None)
    u.settings = s
    db.commit()
    db.close()

    login = client.post("/api/login", json={"public_id": uid, "password": pwd}).json()
    headers = {"Authorization": f"Bearer {login.get('token') or ''}",
               "X-CSRF-Token": login.get("csrf_token", "")}
    resp = client.post("/api/auth/2fa/disable", json={}, headers=headers)
    assert resp.status_code == 200, f"repair path unreachable: {resp.status_code} {resp.text[:200]}"

    db = SessionLocal()
    u = db.query(User).filter(User.public_id == uid).first()
    assert (u.settings or {}).get("2fa_enabled") is False
    db.delete(u)
    db.commit()
    db.close()
