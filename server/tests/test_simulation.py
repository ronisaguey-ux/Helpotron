import pytest
from fastapi.testclient import TestClient

from server.database import init_db, SessionLocal, User, Assignment
from server.main import app
from server.mock_activity_simulator import mock_simulator

init_db()
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_sim_user():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "test_sim_user").first()
        if not user:
            user = User(
                public_id="test_sim_user",
                plan="pro",
                credits=100.0,
                settings={"operation_mode": "auto"},
            )
            db.add(user)
            db.commit()
    finally:
        db.close()


def test_simulation_toggle_and_status():
    user_headers = _auth_headers("test_sim_user")
    admin_headers = _auth_headers("test_admin_sim_user", is_admin=True)

    # 1. Get status (regular user can read status)
    stat_resp = client.get("/api/simulation/status", headers=user_headers)
    assert stat_resp.status_code == 200
    assert "is_enabled" in stat_resp.json()

    # 2. Regular user cannot toggle simulator (403 Forbidden)
    forbidden_resp = client.post("/api/simulation/toggle", json={"enabled": False}, headers=user_headers)
    assert forbidden_resp.status_code == 403

    # 3. Admin can toggle to disabled
    tog_off = client.post("/api/simulation/toggle", json={"enabled": False}, headers=admin_headers)
    assert tog_off.status_code == 200
    assert tog_off.json()["is_enabled"] is False

    # 4. Admin can toggle back to enabled
    tog_on = client.post("/api/simulation/toggle", json={"enabled": True}, headers=admin_headers)
    assert tog_on.status_code == 200
    assert tog_on.json()["is_enabled"] is True


def test_simulation_seed_and_clear():
    headers = _auth_headers("test_sim_user")

    # 1. Seed mock courses & materials
    seed_resp = client.post("/api/simulation/seed", headers=headers)
    assert seed_resp.status_code == 200
    assert seed_resp.json()["result"]["status"] == "seeded"
    assert seed_resp.json()["result"]["total_sample_cards"] >= 6

    # 2. Check cards endpoint reflects seeded assignments
    cards_resp = client.get("/api/assignments/cards", headers=headers)
    assert cards_resp.status_code == 200
    cards = cards_resp.json()["cards"]
    assert len(cards) >= 6

    # Check realistic course codes and subjects
    titles = [c["name"] for c in cards]
    assert any("CRISPR" in t or "Ethics" in t for t in titles)

    # 3. Clear mock data
    clear_resp = client.post("/api/simulation/clear", headers=headers)
    assert clear_resp.status_code == 200
    assert clear_resp.json()["result"]["status"] == "cleared"


def _auth_headers(public_id: str, is_admin: bool = False) -> dict:
    """Real auth for the hardened overlord/simulation surface (BATCH-11): a
    valid Bearer token for an existing user — X-Public-ID is never identity."""
    from server.security import create_jwt_token

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user is None:
            user = User(public_id=public_id, plan="basic", credits=50.0, settings={})
            db.add(user)
        if is_admin:
            user.role = "admin"
            user.is_admin = True
        db.commit()
        db.refresh(user)
        token = create_jwt_token(user_id=user.id, role="admin" if is_admin else "user")
    finally:
        db.close()
    return {"Authorization": f"Bearer {token}"}
