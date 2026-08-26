"""Test fixtures — temp SQLite DB, env pinned BEFORE server imports."""
import os

os.environ["DATABASE_URL"] = "sqlite:///./test_helpotron.db"
os.environ["OMNIROUTE_API_BASE"] = "http://localhost:9"  # never reachable in tests

import pytest
from fastapi.testclient import TestClient

from server.database import engine, init_db, SessionLocal, User
from server.main import app
from server.security import create_jwt_token


@pytest.fixture(scope="session")
def client():
    init_db()
    with TestClient(app) as c:
        yield c
    engine.dispose()


@pytest.fixture(autouse=True)
def clear_ratelimiter(client):
    """The in-memory rate limiter is module-global and the IP key is
    'testclient' for every request — reset between tests so a busy suite
    can't trip the 120/min per-IP limit mid-run.
    Also clear testclient cookies so tests are isolated."""
    from server import ratelimit

    ratelimit.limiter._hits.clear()
    client.cookies.clear()
    yield
    ratelimit.limiter._hits.clear()
    client.cookies.clear()


@pytest.fixture()
def unique_user():
    import uuid

    return f"test-{uuid.uuid4().hex[:8]}"


def _get_auth_headers_for_user(public_id: str) -> dict:
    """Create or lookup a user and generate a JWT Bearer authorization header."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(public_id=public_id, plan="basic", credits=0)
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_jwt_token({"sub": user.id, "public_id": user.public_id})
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def _ensure_user_with_session(client, public_id: str, password: str = "TestPass123") -> dict:
    """Create a user via signup, login, and return auth headers with Bearer token."""
    return _get_auth_headers_for_user(public_id)


@pytest.fixture()
def auth_headers(client, unique_user):
    """Returns Bearer authorization headers for an authenticated unique_user."""
    return _get_auth_headers_for_user(unique_user)
