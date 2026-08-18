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


def test_api_mandatory_purchase_2fa_routes():
    user_id = "test_purchase_user_2fa"
    password = "SuperSecretPassword123!"

    # 1. Send Email 2FA challenge for purchase
    email_dest = "student_buyer@univ.edu"
    chal_resp = client.post(
        "/api/auth/2fa/purchase-challenge",
        json={
            "public_id": user_id,
            "method": "email",
            "destination": email_dest,
        },
    )
    assert chal_resp.status_code == 200
    assert chal_resp.json()["status"] == "success"

    # Grab code from code_store
    code_entry = code_store._store.get((email_dest, "purchase_verification"))
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
            "destination": email_dest,
            "plan": "pro",
            "amount_cents": 2000,
        },
    )
    assert fail_resp.status_code == 400

    # 3. Verify with correct code and password -> Upgrade to Pro
    success_resp = client.post(
        "/api/auth/2fa/purchase-verify",
        json={
            "public_id": user_id,
            "password": password,
            "method": "email",
            "code": code,
            "destination": email_dest,
            "plan": "pro",
            "amount_cents": 2000,
        },
    )
    assert success_resp.status_code == 200
    res_data = success_resp.json()
    assert res_data["verified"] is True
    assert res_data["new_plan"] == "pro"
    assert res_data["credits_added"] == 2000

    # 4. Test SMS 2FA Purchase Flow
    sms_dest = "+15559876543"
    sms_chal_resp = client.post(
        "/api/auth/2fa/purchase-challenge",
        json={
            "public_id": user_id,
            "method": "sms",
            "destination": sms_dest,
        },
    )
    assert sms_chal_resp.status_code == 200

    sms_code_entry = code_store._store.get((sms_dest, "purchase_verification"))
    assert sms_code_entry is not None
    sms_code = sms_code_entry["code"]

    # 5. Verify SMS 2FA for Elite upgrade
    sms_verify_resp = client.post(
        "/api/auth/2fa/purchase-verify",
        json={
            "public_id": user_id,
            "password": password,
            "method": "sms",
            "code": sms_code,
            "destination": sms_dest,
            "plan": "elite",
            "amount_cents": 4000,
        },
    )
    assert sms_verify_resp.status_code == 200
    sms_data = sms_verify_resp.json()
    assert sms_data["verified"] is True
    assert sms_data["new_plan"] == "elite"
    assert sms_data["credits_added"] == 4000

