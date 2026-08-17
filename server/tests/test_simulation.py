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
    headers = {"X-Public-ID": "test_sim_user"}

    # 1. Get status
    stat_resp = client.get("/api/simulation/status", headers=headers)
    assert stat_resp.status_code == 200
    assert "is_enabled" in stat_resp.json()

    # 2. Toggle to disabled
    tog_off = client.post("/api/simulation/toggle", json={"enabled": False}, headers=headers)
    assert tog_off.status_code == 200
    assert tog_off.json()["is_enabled"] is False

    # 3. Toggle back to enabled
    tog_on = client.post("/api/simulation/toggle", json={"enabled": True}, headers=headers)
    assert tog_on.status_code == 200
    assert tog_on.json()["is_enabled"] is True


def test_simulation_seed_and_clear():
    headers = {"X-Public-ID": "test_sim_user"}

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
