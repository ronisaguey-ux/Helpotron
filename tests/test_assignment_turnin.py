"""Assignment turn-in regression tests (feature 08-27).

Turn-in moves an assignment into the assignment history (turned_in=True +
a real turned_in_at timestamp); the owner can undo it (back to active);
other users get 404 (same IDOR contract as every assignment route).
"""
import os
import tempfile

# Must be set before any `server.*` import — the engine binds at import time.
# Fresh DB file per run (engine bind is process-global, so other test files in
# the same process would share it — each file runs in its own pytest process).
_fd, _db_path = tempfile.mkstemp(prefix="test_turnin_", suffix=".db")
os.close(_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["JWT_SECRET"] = "test-secret-key-minimum-32-characters!"

import pytest
from fastapi.testclient import TestClient

from server.database import Assignment, Base, User, engine
from server.security import create_jwt_token


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    from server.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def seeded(client):
    """Two users, one assignment each."""
    from server.database import SessionLocal

    db = SessionLocal()
    try:
        a = User(public_id="turnin-user-a", plan="free", credits=100)
        b = User(public_id="turnin-user-b", plan="free", credits=100)
        db.add_all([a, b])
        db.flush()
        db.add(Assignment(user_id=a.id, title="Alice term paper", prompt=""))
        db.add(Assignment(user_id=b.id, title="Bob lab report", prompt=""))
        db.commit()
        a_id, b_id = a.id, b.id
    finally:
        db.close()
    return {
        "alice": {"id": a_id, "auth": {"Authorization": f"Bearer {create_jwt_token(a_id)}"}},
        "bob": {"id": b_id, "auth": {"Authorization": f"Bearer {create_jwt_token(b_id)}"}},
    }


def test_turnin_requires_auth(client, seeded):
    res = client.patch("/api/assignments/1/turn-in")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


def test_owner_turns_in_assignment(client, seeded):
    auth = seeded["alice"]["auth"]
    res = client.patch("/api/assignments/1/turn-in", headers=auth)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["turned_in"] is True
    assert body["turned_in_at"], "turn-in must record a real timestamp"
    assert body["assignment"]["turned_in"] is True
    assert "turned_in_at" in body["assignment"]


def test_history_query_param_splits_active_vs_history(client, seeded):
    auth = seeded["alice"]["auth"]
    history = client.get("/api/assignments?history=true", headers=auth).json()["assignments"]
    active = client.get("/api/assignments?history=false", headers=auth).json()["assignments"]
    assert any(a["id"] == 1 for a in history), "turned-in assignment must be in history"
    assert all(a["id"] != 1 for a in active), "turned-in assignment must leave active"
    # legacy behavior: no param returns everything
    all_rows = client.get("/api/assignments", headers=auth).json()["assignments"]
    assert any(a["id"] == 1 for a in all_rows)


def test_turned_in_history_endpoint(client, seeded):
    res = client.get("/api/assignments/turned-in", headers=seeded["alice"]["auth"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert body["history"][0]["id"] == 1
    assert body["history"][0]["turned_in_at"] is not None


def test_owner_can_undo_turn_in(client, seeded):
    auth = seeded["alice"]["auth"]
    res = client.patch("/api/assignments/1/turn-in", headers=auth, json={"turned_in": False})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["turned_in"] is False
    assert body["turned_in_at"] is None
    active = client.get("/api/assignments?history=false", headers=auth).json()["assignments"]
    assert any(a["id"] == 1 for a in active), "undone assignment returns to active"
    history = client.get("/api/assignments/turned-in", headers=auth).json()["history"]
    assert all(h["id"] != 1 for h in history), "undone assignment leaves history"


def test_foreign_user_cannot_turn_in(client, seeded):
    res = client.patch("/api/assignments/1/turn-in", headers=seeded["bob"]["auth"])
    assert res.status_code == 404, f"Expected 404 for foreign assignment, got {res.status_code}"
