"""Health endpoints must not report "ok" on a dead database (audit V5-A5-06).

`/api/admin/health` returned the literal `"status": "ok"` while its own
`database` field said `"error: ..."`. The operator dashboard keys off `status`,
so a broken database showed a green light — and the only surface telling the
truth was `/api/health?deep=true`, which the dashboard never calls.

Both endpoints now derive `status` from the probe and answer 503 when degraded.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_admin_health.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters!")

import pytest
from fastapi.testclient import TestClient

from server.database import Base, SessionLocal, User, engine
from server.security import create_jwt_token


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    from server.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_auth(client):
    db = SessionLocal()
    try:
        u = User(public_id="health-admin", plan="elite", credits=100, role="admin")
        db.add(u)
        db.commit()
        uid = u.id
    finally:
        db.close()
    return {"Authorization": f"Bearer {create_jwt_token(uid)}"}


def test_admin_health_ok_when_database_answers(client, admin_auth):
    res = client.get("/api/admin/health", headers=admin_auth)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_admin_health_reports_degraded_when_the_probe_fails(monkeypatch):
    """A failing DB probe must not leave `status` green.

    Drives the handler coroutine directly: patching `SessionLocal` through the
    HTTP stack would also break the auth dependency, so the 503 assertion would
    never be reached.
    """
    import asyncio

    import server.main as main_mod
    import server.database as db_mod

    class _BrokenSession:
        def __enter__(self):
            raise RuntimeError("database is locked")

        def __exit__(self, *args):
            return False

        def close(self):
            pass

    handler = next(
        r.endpoint for r in main_mod.app.routes
        if getattr(r, "path", None) == "/api/admin/health"
    )
    real = db_mod.SessionLocal
    monkeypatch.setattr(db_mod, "SessionLocal", lambda: _BrokenSession())

    resp = asyncio.run(handler(current_user=User(public_id="health-admin", role="admin")))

    assert resp.status_code == 503, resp.body
    import json
    body = json.loads(resp.body)
    assert body["status"] == "degraded", body
    assert body["database"].startswith("error:"), body

    monkeypatch.setattr(db_mod, "SessionLocal", real)


def test_public_health_stays_lean_and_deep_probe_is_honest(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}

    res = client.get("/api/health?deep=true")
    assert res.status_code == 200
    assert res.json()["database"] == "ok"
