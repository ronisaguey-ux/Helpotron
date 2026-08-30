"""Test fixtures — temp SQLite DB, env pinned BEFORE server imports."""
import os
import tempfile
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_helpotron.db"
os.environ["OMNIROUTE_API_BASE"] = "http://localhost:9"  # never reachable in tests

_SESSION_TEST_LAKE = Path(tempfile.mkdtemp(prefix="helpotron_test_lake_"))
os.environ["DATA_LAKE_DIR"] = str(_SESSION_TEST_LAKE)

import server.datalake as dl_module
dl_module.DATALAKE_DIR = _SESSION_TEST_LAKE
dl_module.TELEMETRY_DIR = _SESSION_TEST_LAKE / "telemetry"
dl_module.FEEDBACK_DIR = _SESSION_TEST_LAKE / "feedback"
dl_module.INSIGHTS_DIR = _SESSION_TEST_LAKE / "insights"
dl_module.CORPUS_DIR = _SESSION_TEST_LAKE / "training_corpus"
dl_module.datalake_manager.rebind(_SESSION_TEST_LAKE)

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
    from server.security import auth_limiter

    ratelimit.limiter._hits.clear()
    auth_limiter._failures.clear()  # per-account AND per-IP login throttle
    client.cookies.clear()
    yield
    ratelimit.limiter._hits.clear()
    auth_limiter._failures.clear()
    client.cookies.clear()


@pytest.fixture(autouse=True)
def isolate_datalake(tmp_path, monkeypatch):
    """Isolate DataLakeManager files to a per-test temp directory so tests never
    pollute the production data_lake/ directory."""
    import server.datalake as dl_module
    from server.datalake import datalake_manager

    fake_lake = tmp_path / "data_lake"
    fake_telemetry = fake_lake / "telemetry"
    fake_feedback = fake_lake / "feedback"
    fake_insights = fake_lake / "insights"
    fake_corpus = fake_lake / "training_corpus"

    monkeypatch.setattr(dl_module, "DATALAKE_DIR", fake_lake)
    monkeypatch.setattr(dl_module, "TELEMETRY_DIR", fake_telemetry)
    monkeypatch.setattr(dl_module, "FEEDBACK_DIR", fake_feedback)
    monkeypatch.setattr(dl_module, "INSIGHTS_DIR", fake_insights)
    monkeypatch.setattr(dl_module, "CORPUS_DIR", fake_corpus)

    orig_base = getattr(datalake_manager, "base_dir", dl_module.DATALAKE_DIR)
    datalake_manager.rebind(fake_lake)

    yield

    datalake_manager.rebind(orig_base)


@pytest.fixture()
def unique_user():
    import uuid

    return f"test-{uuid.uuid4().hex[:8]}"


def _get_auth_headers_for_user(public_id: str, plan: str = "none") -> dict:
    """Create or lookup a user and generate a JWT Bearer authorization header."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(public_id=public_id, plan=plan, credits=100.0 if plan in ("basic", "pro", "elite") else 0.0)
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
