"""A zero-delta settlement must still advance the usage high-water mark.

Found while verifying the round-2 swarm audit (HELP-METER-01). `_set_usage_high_water`
was called ONLY on the charged path, after `if delta == 0: return 0` — so a settlement
that returned early left the mark behind, and the NEXT settlement on that account
floored at the old mark and re-billed ledger ids the zero-delta task had already
accounted for. Same double-bill class as the concurrent-tasks fix in `4e25466`.

The scenario that hits it in production: a task whose measured cost rounds to the
1-token minimum, and which was ALSO pre-charged 1 token up front (the flat
TASK_COSTS sites), nets to delta == 0. The work is done, nothing more is owed, and
the ids it consumed must never bill again.
"""
import uuid

import pytest

from server.database import init_db, SessionLocal, User, ApiUsageLog
from server import credits

init_db()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _user(db, public_id: str, tokens: float = 100.0, plan: str = "pro") -> User:
    u = db.query(User).filter(User.public_id == public_id).first()
    if u is None:
        u = User(public_id=public_id, plan=plan, credits=0.0,
                 settings={"token_balance": tokens})
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        s = dict(u.settings or {})
        s["token_balance"] = tokens
        u.settings = s
        db.commit()
        db.refresh(u)
    return u


def _key(name: str) -> str:
    """Unique per run — the test DB persists, so a fixed key would collide with the
    row a previous run left and the idempotency guard would refuse to settle."""
    return f"test:zerodelta:{name}:{uuid.uuid4().hex[:12]}"


def _spend(db, user, usd: float):
    db.add(ApiUsageLog(user_id=user.id, public_id=user.public_id,
                       tool_or_model="test/model", category="llm",
                       base_cost_usd=usd))
    db.commit()


def test_zero_delta_settlement_advances_high_water(db):
    """The regression: a delta==0 settlement must still consume its id range."""
    u = _user(db, "zerodelta_advance", tokens=1000)
    w = credits.ledger_watermark(db, u.id)

    # sub-cent work: 0.005 cents -> calculate_task_token_cost floors at 1 token
    _spend(db, u, 0.00005)
    upto = credits._latest_ledger_id(db, u.id)
    before = credits._usage_high_water(u)

    # pre_charged=1 makes delta exactly 0: 1 token owed, 1 token already taken
    charged = credits.charge_actual_usage(
        u, "study_guide", db, since_id=w, pre_charged=1, idempotency_key=_key("zero")
    )
    db.refresh(u)

    assert charged == 0, "nothing further is owed on this task"

    after = credits._usage_high_water(u)
    assert after == upto, (
        f"high-water mark must advance to {upto} even on a zero-delta settlement; "
        f"it was {before} before and {after} after. Leaving it behind lets the NEXT "
        f"settlement re-bill these ids."
    )


def test_next_settlement_does_not_rebill_the_zero_delta_ids(db):
    """The consequence the mark exists to prevent — bill every id exactly once."""
    u = _user(db, "zerodelta_norebill", tokens=1000)
    w = credits.ledger_watermark(db, u.id)

    # Task A: sub-cent work, pre-charged 1 -> delta 0
    _spend(db, u, 0.00005)
    credits.charge_actual_usage(
        u, "study_guide", db, since_id=w, pre_charged=1, idempotency_key=_key("A")
    )
    db.refresh(u)
    balance_after_a = credits.get_token_balance(u)

    # Task B: new work only — 1 cent of real cost -> 100 tokens.
    # The watermark is taken BEFORE the work, which is the documented order
    # (watermark -> work -> settle); taking it after would leave an empty range.
    w_b = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.01)
    charged_b = credits.charge_actual_usage(
        u, "study_guide", db, since_id=w_b, pre_charged=0, idempotency_key=_key("B")
    )
    db.refresh(u)

    assert charged_b == 100, (
        f"task B must bill only its own 1 cent (100 tokens), got {charged_b}. "
        f"More than that means task A's already-consumed ids were re-billed."
    )
    assert credits.get_token_balance(u) == balance_after_a - 100.0


def test_zero_delta_settlement_is_idempotent(db):
    """A re-entered completion path must not settle the same window twice."""
    u = _user(db, "zerodelta_idem", tokens=1000)
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.00005)

    key = _key("idem")
    first = credits.charge_actual_usage(u, "study_guide", db, since_id=w,
                                        pre_charged=1, idempotency_key=key)
    second = credits.charge_actual_usage(u, "study_guide", db, since_id=w,
                                         pre_charged=1, idempotency_key=key)
    db.refresh(u)

    assert first == 0
    assert second == 0, "a replayed settlement must be recognised and skipped"
