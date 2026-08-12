"""Test fixtures — temp SQLite DB, env pinned BEFORE server imports."""
import os

os.environ["DATABASE_URL"] = "sqlite:///./test_helpotron.db"
os.environ["OMNIROUTE_API_BASE"] = "http://localhost:9"  # never reachable in tests

import pytest
from fastapi.testclient import TestClient

from server.database import engine, init_db
from server.main import app


@pytest.fixture(scope="session")
def client():
    init_db()
    with TestClient(app) as c:
        yield c
    engine.dispose()


@pytest.fixture(autouse=True)
def clear_ratelimiter():
    """The in-memory rate limiter is module-global and the IP key is
    'testclient' for every request — reset between tests so a busy suite
    can't trip the 120/min per-IP limit mid-run."""
    from server import ratelimit

    ratelimit.limiter._hits.clear()
    yield
    ratelimit.limiter._hits.clear()


@pytest.fixture()
def unique_user():
    import uuid

    return f"test-{uuid.uuid4().hex[:8]}"
