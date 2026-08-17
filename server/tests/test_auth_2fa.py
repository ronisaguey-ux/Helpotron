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

    # 3. Setup TOTP 2FA
    setup_resp = client.post(
        "/api/auth/2fa/setup",
        json={"user_id": "test_auth_student@univ.edu", "method": "totp"},
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
            "user_id": "test_auth_student@univ.edu",
            "method": "totp",
            "code": current_totp_code,
            "secret": secret,
        },
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["status"] == "success"
