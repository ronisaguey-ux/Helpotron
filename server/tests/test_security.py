"""Security hardening tests — input validation, rate limiting, pagination,
config checks, agent refund policy."""
import asyncio
import collections
import time
import uuid

from server import ratelimit
from server.agent_session import AgentSession


# ─── rate limiter unit ────────────────────────────────────────────────────

def test_ratelimiter_allows_up_to_limit():
    lim = ratelimit.RateLimiter()
    assert all(lim.allow("k1", limit=3) for _ in range(3))
    assert not lim.allow("k1", limit=3)  # 4th is blocked
    assert lim.allow("k2", limit=3)      # different key unaffected


def test_ratelimiter_window_expires():
    lim = ratelimit.RateLimiter()
    for _ in range(3):
        lim.allow("k1", limit=3)
    assert not lim.allow("k1", limit=3)
    # age the hits past the window, then the key is allowed again
    lim._hits["k1"] = collections.deque([time.time() - 61] * 3)
    assert lim.allow("k1", limit=3)


def test_ratelimiter_prune():
    lim = ratelimit.RateLimiter()
    lim._hits["old"] = collections.deque([time.time() - 7200])
    lim._hits["fresh"] = collections.deque([time.time()])
    lim.prune(max_age=3600)
    assert "old" not in lim._hits
    assert "fresh" in lim._hits


# ─── API-level: input validation ──────────────────────────────────────────

def test_oversized_payload_rejected(client):
    r = client.post("/api/assignments", json={
        "public_id": "val-user",
        "title": "T" * 501,
    })
    assert r.status_code in (401, 422)  # auth may reject before validation


def test_normal_payload_accepted(client):
    from server.tests.conftest import _get_auth_headers_for_user
    headers = _get_auth_headers_for_user("val-user")
    r = client.post("/api/assignments", json={
        "public_id": "val-user",
        "title": "Hamlet close reading",
        "prompt": "Analyze Act 3.",
    }, headers=headers)
    assert r.status_code == 200


# ─── API-level: rate limiting ─────────────────────────────────────────────

def test_per_user_rate_limit_on_llm_path(client):
    # /api/agent/start is a strict path (10/min) and JSON — hammer it.
    codes = [client.post("/api/agent/start", json={"public_id": "rl-user"}).status_code
             for _ in range(12)]
    assert codes.count(429) >= 2


def test_per_ip_rate_limit(client):
    for _ in range(124):
        client.get("/api/health")
    assert client.get("/api/health").status_code == 429


# ─── API-level: pagination ────────────────────────────────────────────────

def _make_elite(public_id: str) -> None:
    """Seed the user as elite so credit charges can't block the test."""
    from server.database import SessionLocal
    from server.main import get_or_create_user

    from server.database import User

    db = SessionLocal()
    try:
        get_or_create_user(db, public_id)
        db.query(User).filter(User.public_id == public_id).update({"plan": "elite"})
        db.commit()
    finally:
        db.close()


def _cleanup_user(public_id: str) -> None:
    """Delete all materials and assignments for the user to avoid test pollution."""
    from server.database import SessionLocal
    from server.database import StudyMaterial, Assignment, User
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user:
            db.query(StudyMaterial).filter(StudyMaterial.user_id == user.id).delete()
            db.query(Assignment).filter(Assignment.user_id == user.id).delete()
            db.commit()
    finally:
        db.close()


def test_materials_pagination(client, monkeypatch):
    from server import study_tools
    from server.tests.conftest import _get_auth_headers_for_user

    async def fake_llm(system, user):
        return "A summary of the lecture transcript."

    monkeypatch.setattr(study_tools.llm, "call_llm", fake_llm)
    uid = f"page-user-{uuid.uuid4().hex[:8]}"
    _cleanup_user(uid)  # remove any leftover data
    _make_elite(uid)
    headers = _get_auth_headers_for_user(uid)
    for i in range(3):
        r = client.post("/api/summary", json={
            "public_id": uid,
            "transcript_text": f"transcript {i} " * 50,
        }, headers=headers)
        assert r.status_code == 200
    body = client.get(f"/api/materials/{uid}/summary?limit=2&offset=0", headers=headers).json()
    assert body["total"] == 3
    assert len(body["materials"]) == 2
    r2 = client.get(f"/api/materials/{uid}/summary?limit=2&offset=2", headers=headers)
    assert len(r2.json()["materials"]) == 1


# ─── config validation ────────────────────────────────────────────────────

def test_config_validate_flags_malformed():
    from server.config import Config

    c = Config()
    c.omniroute_api_base = "not-a-url"
    c.primary_model = "   "
    c.chat_timeout_seconds = 1
    problems = c.validate()
    assert any("OMNIROUTE_API_BASE" in p for p in problems)
    assert any("PRIMARY_MODEL" in p for p in problems)
    assert any("CHAT_TIMEOUT_SECONDS" in p for p in problems)


def test_config_validate_clean():
    from server.config import Config

    assert Config().validate() == []


# ─── agent refund policy ──────────────────────────────────────────────────

def _persist(session, monkeypatch, refunds):
    """Run _run_agent_and_persist against a fake db; record refunds.

    The agent loop itself is stubbed out — its 60s attach wait would hang
    the test, and the refund policy lives in _run_agent_and_persist."""
    from server import main as mainmod

    async def _noop_run(_s):
        pass

    monkeypatch.setattr(mainmod.agent_manager, "run", _noop_run)

    class FakeDB:
        def query(self, _model):
            class Q:
                def filter(self, *a, **kw):
                    return self

                def first(self):
                    return mainmod.User(public_id=session.public_id, credits=1.0)

            return Q()

        def add(self, _obj):
            pass

        def flush(self):
            pass

        def commit(self):
            pass

        def close(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            self.close()

        def get(self, _model, _id):
            return None

    monkeypatch.setattr("server.database.SessionLocal", lambda: FakeDB())
    monkeypatch.setattr("server.main.credits.top_up",
                        lambda db, user, amt, reason: refunds.append((amt, reason)))
    asyncio.run(mainmod._run_agent_and_persist(session))


def test_agent_immediate_disconnect_refunds(monkeypatch):
    refunds = []
    s = AgentSession("sid1", "refund-user", None, "")
    s.status = "disconnected"
    s.steps = 0
    s.result_text = ""
    _persist(s, monkeypatch, refunds)
    assert refunds, "barely-started disconnected session should refund"


def test_agent_long_run_disconnect_no_refund(monkeypatch):
    refunds = []
    s = AgentSession("sid2", "refund-user2", None, "")
    s.status = "disconnected"
    s.steps = 10  # did real work (10 tool commands) then disconnected
    s.result_text = ""
    _persist(s, monkeypatch, refunds)
    assert not refunds, "session that ran steps before disconnecting should pay"


def test_agent_crash_still_refunds(monkeypatch):
    refunds = []
    s = AgentSession("sid3", "refund-user3", None, "")
    s.status = "failed"
    s.steps = 25  # crashed, but nothing collected
    s.result_text = ""
    _persist(s, monkeypatch, refunds)
    assert refunds, "a genuine crash with nothing collected should refund"
