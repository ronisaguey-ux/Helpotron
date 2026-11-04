"""One billed LLM call must produce exactly one ledger row (audit V5-A5-04).

`call_llm` has two independent accounting paths: it writes through the
metering contextvar (`metering.current_meter_user`) and it also calls
`record_routing_telemetry` when the caller passes `db` + `user_id`. Real
callers do both — `routes_overlord.py` and `humanize_skill.py` pass
`db=db, user_id=...` from inside an authenticated request, where
`security._bind_metering` has already bound the account — so the same token
usage was written twice and `credits.charge_actual_usage` settled both rows.

These tests pin the invariant: one call, one row.
"""
import os
import uuid

# Bind before any `server.*` import (the engine binds at import time) — same
# guard the other files in this directory use, so we never touch data/db.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_llm_cost_ledger.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters!")

import pytest

import server.metering as metering
from server import llm
from server.database import ApiUsageLog, Base, SessionLocal, User, engine


@pytest.fixture()
def paid_user():
    Base.metadata.create_all(engine)
    public_id = f"ledger-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    db.add(User(
        public_id=public_id,
        plan="pro",
        credits=0.0,
        role="user",
        settings={"token_balance": 10000.0},
    ))
    db.commit()
    try:
        yield db, public_id
    finally:
        db.query(ApiUsageLog).filter(ApiUsageLog.public_id == public_id).delete()
        db.query(User).filter(User.public_id == public_id).delete()
        db.commit()
        db.close()


def _stub_httpx(monkeypatch):
    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "choices": [{"message": {"content": "ledger ok"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 20, "cost": 0.0024},
            }

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, *args, **kwargs):
            return _Resp()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: _Client())


@pytest.mark.asyncio
async def test_db_and_meter_user_together_write_one_row(monkeypatch, paid_user):
    """The bug: db= + user_id= + a bound meter user wrote TWO rows.

    Both call sites that hit this shape are authenticated request paths
    (routes_overlord.py:2180, humanize_skill.py:520), so the meter user was
    always bound and every one of those calls double-settled.
    """
    db, public_id = paid_user
    _stub_httpx(monkeypatch)

    with metering.meter_user(public_id):
        out = await llm.call_llm(
            user_prompt="p", system_prompt="s", db=db, user_id=public_id,
        )

    assert out == "ledger ok"
    rows = db.query(ApiUsageLog).filter(ApiUsageLog.public_id == public_id).all()
    assert len(rows) == 1, (
        f"one billed call wrote {len(rows)} ledger rows "
        f"({[(r.tool_or_model, r.base_cost_usd) for r in rows]}) — "
        "the metering path and record_routing_telemetry both recorded it"
    )
    assert rows[0].input_tokens == 100
    assert rows[0].output_tokens == 20


@pytest.mark.asyncio
async def test_recorded_cost_matches_the_provider_charge(monkeypatch, paid_user):
    """The single surviving row must carry the provider's exact charge."""
    db, public_id = paid_user
    _stub_httpx(monkeypatch)

    with metering.meter_user(public_id):
        await llm.call_llm(user_prompt="p", system_prompt="s", db=db, user_id=public_id)

    row = db.query(ApiUsageLog).filter(ApiUsageLog.public_id == public_id).one()
    assert row.base_cost_usd == pytest.approx(0.0024, abs=1e-9)
    assert (row.metadata_ or {}).get("cost_source") == "provider"
