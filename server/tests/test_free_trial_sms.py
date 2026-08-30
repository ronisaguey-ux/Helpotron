import pytest
from fastapi.testclient import TestClient

from server.auth_2fa import verification_store
from server.database import ClaimedTrialPhone, SessionLocal, User
from server.main import app
from server.plans import get_plan_catalogue
from server.security import create_jwt_token


def test_plan_catalogue_features_free_trial_instead_of_free():
    catalogue = get_plan_catalogue()
    plan_ids = [p["id"] for p in catalogue]
    assert "trial" in plan_ids
    assert "free" not in plan_ids
    assert plan_ids == ["trial", "basic", "pro", "elite"]

    trial_plan = next(p for p in catalogue if p["id"] == "trial")
    assert trial_plan["name"] == "Free Trial"
    assert trial_plan["is_trial"] is True
    assert trial_plan["requires_sms"] is True
    assert trial_plan["price_cents"] == 0
    assert trial_plan["monthly_credits"] == 100


@pytest.fixture(autouse=True)
def clean_trial_state():
    verification_store._store.clear()
    yield
    verification_store._store.clear()


def test_trial_sms_request_and_verify_activation(client, auth_headers):
    import uuid
    test_phone = f"+1555{uuid.uuid4().int % 10000000:07d}"

    # 1. Check initial status
    status_resp = client.get("/api/trial/status", headers=auth_headers)
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["eligible"] is True
    assert status_data["trial_claimed"] is False

    # 2. Request SMS code for test phone
    req_resp = client.post("/api/trial/sms/request", headers=auth_headers, json={"phone_number": test_phone})
    assert req_resp.status_code == 200
    assert req_resp.json()["status"] == "success"

    # Retrieve generated code from verification store
    key = (test_phone, "free_trial_sms")
    assert key in verification_store._store
    code = verification_store._store[key]["code"]

    # 3. Verify code and activate trial
    verify_resp = client.post("/api/trial/sms/verify", headers=auth_headers, json={"phone_number": test_phone, "code": code})
    assert verify_resp.status_code == 200
    verify_data = verify_resp.json()
    assert verify_data["status"] == "success"
    assert verify_data["user"]["plan"] == "trial"
    assert verify_data["user"]["credits"] == 100.0
    assert verify_data["user"]["trial_claimed"] is True
    assert verify_data["user"]["phone_verified"] is True

    # 4. Check post-activation status
    post_status = client.get("/api/trial/status", headers=auth_headers).json()
    assert post_status["eligible"] is False
    assert post_status["trial_claimed"] is True
    assert post_status["plan"] == "trial"


def test_trial_phone_number_single_use_enforcement(client, auth_headers, unique_user):
    import uuid
    from server.tests.conftest import _get_auth_headers_for_user
    auth_b = _get_auth_headers_for_user(f"{unique_user}-second")

    shared_phone = f"+1555{uuid.uuid4().int % 10000000:07d}"

    # User A requests and verifies
    client.post("/api/trial/sms/request", headers=auth_headers, json={"phone_number": shared_phone})
    code = verification_store._store[(shared_phone, "free_trial_sms")]["code"]
    res_a = client.post("/api/trial/sms/verify", headers=auth_headers, json={"phone_number": shared_phone, "code": code})
    assert res_a.status_code == 200

    # User B tries to use the same phone number
    res_b_req = client.post("/api/trial/sms/request", headers=auth_b, json={"phone_number": shared_phone})
    assert res_b_req.status_code == 400
    assert "already been used" in res_b_req.json()["detail"]

    res_b_ver = client.post("/api/trial/sms/verify", headers=auth_b, json={"phone_number": shared_phone, "code": "123456"})
    assert res_b_ver.status_code == 400
    assert "already been used" in res_b_ver.json()["detail"]


def test_user_cannot_claim_trial_twice(client, auth_headers):
    import uuid
    phone_1 = f"+1555{uuid.uuid4().int % 10000000:07d}"
    phone_2 = f"+1555{uuid.uuid4().int % 10000000:07d}"

    # Claim first trial
    client.post("/api/trial/sms/request", headers=auth_headers, json={"phone_number": phone_1})
    code_1 = verification_store._store[(phone_1, "free_trial_sms")]["code"]
    client.post("/api/trial/sms/verify", headers=auth_headers, json={"phone_number": phone_1, "code": code_1})

    # Try claiming again with a different phone number
    res_again = client.post("/api/trial/sms/request", headers=auth_headers, json={"phone_number": phone_2})
    assert res_again.status_code == 400
    assert "already claimed" in res_again.json()["detail"]


def test_invalid_phone_and_code_rejection(client, auth_headers):
    import uuid
    # Invalid phone format
    bad_phone_res = client.post("/api/trial/sms/request", headers=auth_headers, json={"phone_number": "1234"})
    assert bad_phone_res.status_code == 400

    # Valid phone, wrong code
    good_phone = f"+1555{uuid.uuid4().int % 10000000:07d}"
    client.post("/api/trial/sms/request", headers=auth_headers, json={"phone_number": good_phone})
    wrong_code_res = client.post("/api/trial/sms/verify", headers=auth_headers, json={"phone_number": good_phone, "code": "000000"})
    assert wrong_code_res.status_code == 400
    assert "Invalid" in wrong_code_res.json()["detail"]
