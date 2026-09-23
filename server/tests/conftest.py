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

# ── Stop the tests running the production background loops ───────────────────
# The `client` fixture below opens `TestClient(app)`, which runs FastAPI's
# LIFESPAN — and server/main.py's lifespan spawns the production background
# tasks. One of them, `_cleanup_temp_files_loop`, walks ["./uploads",
# "./exports", "/tmp/helpotron_exports"] and os.remove()s every file older than
# 24 hours. Its sleep is at the BOTTOM of the loop, so the first pass executes
# in the first event-loop iteration; CWD under pytest is the repo root, so those
# are the LIVE directories.
#
# Measured before this guard existed: 10 files in the real uploads/, every one
# exactly 16 bytes (test_api.py posts a b"not really audio" webm), mtimes inside
# the test window. Only the 24h age gate has prevented an actual purge — one day
# a test run will delete a real user's uploads.
#
# A test suite must never run a production janitor against production data, so
# the loops are replaced with sleepers for the duration of the session.
import asyncio as _asyncio


async def _sleeping_loop(*_args, **_kwargs):
    while True:
        await _asyncio.sleep(3600)


import server.main as _main
_main._cleanup_temp_files_loop = _sleeping_loop
_main._datalake_background_loop = _sleeping_loop
_main.run_monitors_loop = _sleeping_loop

# Same reasoning for the Telegram long-poller: it would reach a real bot API for
# the whole test session. Patching the source module is enough because
# server/main.py imports it inside lifespan().
from server import telegram_agent_link as _telegram_link
_telegram_link.telegram_agent_loop = _sleeping_loop

# And redirect audio uploads into the session temp dir, so a test upload cannot
# land in the production uploads/ folder at all.
from server import transcription as _transcription
_test_uploads = _SESSION_TEST_LAKE / "uploads"
_test_uploads.mkdir(parents=True, exist_ok=True)
_transcription.UPLOAD_DIR = _test_uploads


@pytest.fixture(scope="session")
def client():
    init_db()
    with TestClient(app) as c:
        yield c
    engine.dispose()


@pytest.fixture(autouse=True)
def disable_twilio_verify(monkeypatch):
    """Tests must never call the real Twilio Verify API.

    Verify is switched on by the presence of a Verify service SID. With it live,
    a test exercising SMS 2FA would spend real money, depend on the network, and
    fail on the +1555 numbers the suite uses. Clearing it routes SMS back to the
    local code store, where +1555 is mocked and the code is readable from
    code_store._store.

    Both are patched because auth_2fa reads `config.<attr>` first and then
    `os.getenv(...)`: patching only the env var does nothing (the settings object
    was already built from .env at import), and patching only the object still
    lets the env fallback through. server/llm.py's load_dotenv(override=True)
    would also stomp a plain os.environ write, which is why this is a fixture.
    """
    from server.config import config as _settings
    monkeypatch.setattr(_settings, "twilio_verify_service_sid", "", raising=False)
    monkeypatch.delenv("TWILIO_VERIFY_SERVICE_SID", raising=False)


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
    try:
        from server.metering import set_meter_user
        set_meter_user(None)
    except Exception:
        pass
    yield
    ratelimit.limiter._hits.clear()
    auth_limiter._failures.clear()
    client.cookies.clear()
    try:
        from server.metering import set_meter_user
        set_meter_user(None)
    except Exception:
        pass


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
            user = User(
                public_id=public_id,
                plan=plan,
                # Usage is TOKEN-denominated; `credits` is the earn-only discount
                # currency. A paid plan is funded with tokens, not credits.
                credits=0.0,
                settings={
                    "2fa_enabled": True,
                    "token_balance": 100.0 if plan in ("basic", "pro", "elite") else 0.0,
                },
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif not (user.settings or {}).get("2fa_enabled"):
            user.settings = {**(user.settings or {}), "2fa_enabled": True}
            db.commit()
            db.refresh(user)
        token = create_jwt_token({"sub": user.id, "public_id": user.public_id})
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


@pytest.fixture()
def top_up_tokens(client):
    """Fixture form, so tests need no import — `from conftest import ...`
    resolves to the REPO ROOT conftest, not this one."""

    def _top_up(public_id: str, amount_cents: int, auth_headers: dict) -> int:
        """Buy tokens the way the product now requires, and return the balance.

        A purchase creates a PENDING payment — process_payment never grants on
        its own authority any more (SEC-2026-001) — and an operator confirms it.
        Tests need the end state, so this drives both halves.

        It deliberately does NOT use provider="stripe": that path is reserved
        for /api/checkout plus a signed webhook, and using it here is exactly
        what several tests were doing to get free tokens.
        """
        r = client.post("/api/payments",
                        json={"public_id": public_id, "provider": "zelle",
                              "amount_cents": amount_cents},
                        headers=auth_headers)
        assert r.status_code == 200, f"payment create failed: {r.status_code} {r.text[:200]}"
        # The route returns `payment_id`; process_payment's own dict uses `id`.
        payment_id = r.json().get("payment_id") or r.json().get("id")

        # Confirm as the operator. The admin gate is exercised by its own tests;
        # here it is bypassed so the money path can be driven without tokens.
        import server.admin as _admin
        orig = _admin.require_admin
        _admin.require_admin = lambda request=None: None
        try:
            c = client.post(f"/api/admin/user/{public_id}/confirm-payment",
                            json={"payment_id": payment_id, "note": "test fixture"})
            assert c.status_code == 200, f"confirm failed: {c.status_code} {c.text[:200]}"
            return c.json()["token_balance"]
        finally:
            _admin.require_admin = orig

    return _top_up


def _ensure_user_with_session(client, public_id: str, password: str = "TestPass123") -> dict:
    """Create a user via signup, login, and return auth headers with Bearer token."""
    return _get_auth_headers_for_user(public_id)


@pytest.fixture()
def auth_headers(client, unique_user):
    """Returns Bearer authorization headers for an authenticated unique_user."""
    return _get_auth_headers_for_user(unique_user)


@pytest.fixture()
def auth_headers_factory():
    """Fixture form, so tests need no import — `from conftest import ...`
    resolves to the REPO ROOT conftest, not this one.

    Returns a callable that mints Bearer headers for an arbitrary public_id, so
    a single test can act as TWO different users. That is what an ownership
    (IDOR) test needs, and there was no way to do it before.
    """

    def _make(public_id: str, plan: str = "none") -> dict:
        return _get_auth_headers_for_user(public_id, plan)

    return _make


@pytest.fixture
def db_session():
    """Isolated in-memory SQLite database session for unit tests (TEST-05)."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from server.database import Base

    test_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=test_engine)
    Session = sessionmaker(bind=test_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        test_engine.dispose()
