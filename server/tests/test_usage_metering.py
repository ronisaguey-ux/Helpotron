"""Usage metering — 1 task token per cent of service (owner 2026-09-17).

The owner's rule: "any process that's used to fulfil a user's request is
calculated in cents, and converted into tokens", at 1 token = 1 cent. The
converter (`calculate_task_token_cost`) implemented exactly that and had zero
call sites for a long time — charging used a flat TASK_COSTS table, so a task's
price never depended on what serving it actually cost.

These tests pin the settlement path that closes that loop:
`ledger_watermark` -> run the work (ledger rows accumulate) -> `charge_actual_usage`.
"""
import uuid

import pytest

from server.database import init_db, SessionLocal, User, ApiUsageLog, CreditTransaction
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
    """Unique per run — the test DB persists, so a fixed key would collide
    with the row a previous run left and the idempotency guard would
    (correctly) refuse to settle again."""
    return f"test:{name}:{uuid.uuid4().hex[:12]}"


def _spend(db, user, usd: float):
    """Record real upstream spend the way the cost engine does."""
    db.add(ApiUsageLog(user_id=user.id, public_id=user.public_id,
                       tool_or_model="test/model", category="llm",
                       base_cost_usd=usd))
    db.commit()


def test_token_cost_is_one_token_per_cent():
    assert credits.calculate_task_token_cost(0.0) == 0
    assert credits.calculate_task_token_cost(-1.0) == 0
    assert credits.calculate_task_token_cost(0.01) == 1
    assert credits.calculate_task_token_cost(0.011) == 2   # ceil
    assert credits.calculate_task_token_cost(0.10) == 10
    assert credits.calculate_task_token_cost(1.00) == 100
    # sub-cent work still bills one token: a task is never free
    assert credits.calculate_task_token_cost(0.0001) == 1


def test_usage_since_watermark_measures_real_cost(db):
    u = _user(db, "meter_measure", tokens=1000)
    w = credits.ledger_watermark(db, u.id)
    for _ in range(20):
        _spend(db, u, 0.0047)   # ~0.47 cents — the observed average

    cents = credits.usage_cents_since(db, u.id, w)
    assert abs(cents - 9.4) < 0.01, cents
    assert credits.calculate_task_token_cost(cents / 100.0) == 10


def test_settlement_charges_the_difference_not_the_whole_window(db):
    """The gate pre-charges an estimate; completion settles only the delta."""
    u = _user(db, "meter_delta", tokens=100)
    w = credits.ledger_watermark(db, u.id)
    for _ in range(20):
        _spend(db, u, 0.0047)          # 10 tokens of real cost

    delta = credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                        pre_charged=1, idempotency_key=_key("delta"))
    db.refresh(u)
    assert delta == 9, delta           # 10 actual - 1 already held
    assert credits.get_token_balance(u) == 91.0


def test_settlement_is_idempotent(db):
    """A re-entered completion path must not bill the same window twice.

    Without this the watermark is not a lock and a retry charges the full window
    again — measured at 9 tokens per duplicate settlement.
    """
    u = _user(db, "meter_idem", tokens=100)
    w = credits.ledger_watermark(db, u.id)
    for _ in range(20):
        _spend(db, u, 0.0047)

    same = _key("idem")
    first = credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                        pre_charged=1, idempotency_key=same)
    second = credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                         pre_charged=1, idempotency_key=same)
    db.refresh(u)
    assert first == 9
    assert second == 0, "the same settlement must not be charged twice"
    assert credits.get_token_balance(u) == 91.0


def test_shortfall_floors_at_zero_and_does_not_go_negative(db):
    """Insufficient balance: the balance floors at 0 rather than going negative,
    and the shortfall is logged rather than silently absorbed."""
    u = _user(db, "meter_short", tokens=5.0)
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.90)                # 90 tokens of cost

    credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                pre_charged=0, idempotency_key=_key("short"))
    db.refresh(u)
    assert credits.get_token_balance(u) == 0.0
    assert credits.get_token_balance(u) >= 0.0, "balance must never go negative by default"


def test_unmetered_user_is_never_settled(db):
    """The operator account is the only unmetered one — no charge, no ledger row."""
    u = _user(db, "meter_admin", tokens=5.0)
    u.role = "admin"
    db.commit()
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.50)

    delta = credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                        pre_charged=1, idempotency_key=_key("admin"))
    db.refresh(u)
    assert delta == 0
    assert credits.get_token_balance(u) == 5.0


def test_settlement_records_a_ledger_row(db):
    """Every settlement leaves a CreditTransaction so the spend is auditable."""
    u = _user(db, "meter_ledger", tokens=100)
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.05)                # 5 tokens

    ledger_key = _key("ledger")
    credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                pre_charged=0, idempotency_key=ledger_key)
    rows = (db.query(CreditTransaction)
              .filter(CreditTransaction.user_id == u.id,
                      CreditTransaction.reason == ledger_key).all())
    assert len(rows) == 1
    assert rows[0].delta == -5
