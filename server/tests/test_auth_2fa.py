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
    user_id = "test_purchase_user_2fa"
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


