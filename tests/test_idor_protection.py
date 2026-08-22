"""IDOR protection regression tests (remediation BATCH-04).

A user must never be able to read or delete another user's assignment,
even with a valid token: foreign resources answer 404, not 403.
"""
import os

# Must be set before any `server.*` import — the engine binds at import time.
os.environ["DATABASE_URL"] = "sqlite:///./test_idor.db"
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
    """Two users; assignment #1 belongs to user_a, #2 to user_b."""
    from server.database import SessionLocal

    db = SessionLocal()
    try:
        a = User(public_id="idor-user-a", plan="free", credits=100)
        b = User(public_id="idor-user-b", plan="free", credits=100)
        db.add_all([a, b])
        db.flush()
        db.add(Assignment(user_id=a.id, title="Alice private essay", prompt=""))
        db.add(Assignment(user_id=b.id, title="Bob private essay", prompt=""))
        db.commit()
        a_id, b_id = a.id, b.id
    finally:
        db.close()
    return {
        "alice": {"id": a_id, "auth": {"Authorization": f"Bearer {create_jwt_token(a_id)}"}},
        "bob": {"id": b_id, "auth": {"Authorization": f"Bearer {create_jwt_token(b_id)}"}},
    }


def test_unauthenticated_delete_returns_401(client, seeded):
    res = client.delete("/assignments/1")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


def test_owner_can_delete_own_assignment(client, seeded):
    res = client.delete("/assignments/2", headers=seeded["bob"]["auth"])
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "success"
    assert res.json()["deleted_id"] == 2


def test_foreign_assignment_delete_blocked_404(client, seeded):
    """Bob must not delete Alice's assignment even with a valid token."""
    res = client.delete("/assignments/1", headers=seeded["bob"]["auth"])
    assert res.status_code == 404, f"Expected 404, got {res.status_code}"
    assert "not found" in res.json()["detail"].lower() or "unauthorized" in res.json()["detail"].lower()


def test_foreign_assignment_read_blocked_404(client, seeded):
    res = client.get("/assignments/1", headers=seeded["bob"]["auth"])
    assert res.status_code == 404, f"Expected 404, got {res.status_code}"


def test_delete_missing_assignment_404(client, seeded):
    res = client.delete("/assignments/999999", headers=seeded["alice"]["auth"])
    assert res.status_code == 404


def test_owner_can_read_own_assignment(client, seeded):
    res = client.get("/assignments/1", headers=seeded["alice"]["auth"])
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "Alice private essay"


def test_foreign_assignment_survives_owner_delete(client, seeded):
    """After Alice deletes her own assignment, Bob still cannot touch it."""
    res = client.delete("/assignments/1", headers=seeded["alice"]["auth"])
    assert res.status_code == 200, res.text
    res = client.delete("/assignments/1", headers=seeded["bob"]["auth"])
    assert res.status_code == 404
