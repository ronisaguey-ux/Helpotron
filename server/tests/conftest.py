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


@pytest.fixture()
def unique_user():
    import uuid

    return f"test-{uuid.uuid4().hex[:8]}"
