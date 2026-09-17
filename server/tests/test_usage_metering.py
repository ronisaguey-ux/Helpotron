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


def test_token_cost_is_one_hundred_tokens_per_cent():
    """Owner 2026-09-17: "change it to 1 token equals 1/100 of a cent ... cuz a
    lot of tasks are under a cent, we need to do that for more accurate
    calculation". So 100 tokens = 1 cent, 10,000 = $1."""
    assert credits.TOKENS_PER_CENT == 100
    assert credits.TOKENS_PER_USD == 10_000

    assert credits.calculate_task_token_cost(0.0001) == 1      # 1/100 cent
    assert credits.calculate_task_token_cost(0.01) == 100      # 1 cent
    assert credits.calculate_task_token_cost(0.011) == 110     # ceil
    assert credits.calculate_task_token_cost(0.05) == 500      # Pangram's minimum scan
    assert credits.calculate_task_token_cost(1.00) == 10_000

    # the whole point of the change: sub-cent work is priced honestly instead of
    # every task rounding up to a full cent
    assert credits.calculate_task_token_cost(0.002) == 20
    assert credits.calculate_task_token_cost(0.0002) == 2

    # the 1-token minimum is the rounding floor, not a flat price: a local
    # process with no measurable upstream cost still costs something
    assert credits.calculate_task_token_cost(0.0) == 1
    assert credits.calculate_task_token_cost(-1.0) == 1


def test_usage_since_watermark_measures_real_cost(db):
    u = _user(db, "meter_measure", tokens=1000)
    w = credits.ledger_watermark(db, u.id)
    for _ in range(20):
        _spend(db, u, 0.0047)   # ~0.47 cents — the observed average

    cents = credits.usage_cents_since(db, u.id, w)
    assert abs(cents - 9.4) < 0.01, cents
    assert credits.calculate_task_token_cost(cents / 100.0) == 940


def test_charge_after_uses_the_real_cost_with_no_precharge(db):
    """Owner: "just charge the token costs after its calculated, dont guess
    before". Nothing is held up front, so the full measured cost is charged."""
    u = _user(db, "meter_delta", tokens=100)
    w = credits.ledger_watermark(db, u.id)
    for _ in range(20):
        _spend(db, u, 0.0047)          # 10 tokens of real cost

    charged = credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                          pre_charged=0, idempotency_key=_key("delta"))
    db.refresh(u)
    assert charged == 940, charged            # 9.4 cents at 100 tokens/cent
    assert credits.get_token_balance(u) == 100 - 940.0


def test_pre_charged_still_subtracts_for_unconverted_callers(db):
    """Callers still holding an up-front flat fee pass it as pre_charged so only
    the difference bills — otherwise the estimate is charged twice."""
    u = _user(db, "meter_pre", tokens=100)
    w = credits.ledger_watermark(db, u.id)
    for _ in range(20):
        _spend(db, u, 0.0047)          # 10 tokens of real cost

    charged = credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                          pre_charged=100, idempotency_key=_key("pre"))
    db.refresh(u)
    assert charged == 840, charged       # 940 actual - 100 already held
    assert credits.get_token_balance(u) == 100 + 100 - 940.0


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
                                        pre_charged=0, idempotency_key=same)
    second = credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                         pre_charged=0, idempotency_key=same)
    db.refresh(u)
    assert first == 940
    assert second == 0, "the same charge must not be applied twice"
    assert credits.get_token_balance(u) == 100 - 940.0


def test_shortfall_overdrafts_and_blocks_the_account(db):
    """The work was already done, so the real cost is charged even when it exceeds
    the balance. The balance goes negative — honest accounting, and it self-blocks
    the account until a top-up — rather than the platform silently eating it."""
    u = _user(db, "meter_short", tokens=500.0)
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.90)                # 90 cents = 9,000 tokens of cost

    credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                pre_charged=0, idempotency_key=_key("short"))
    db.refresh(u)
    assert credits.get_token_balance(u) == 500 - 9000.0
    assert credits.has_usage_balance(u) is False, "an overdrawn account must not start new work"

    credits.add_tokens(db, u, 10000.0, reason="topup")
    db.refresh(u)
    assert credits.get_token_balance(u) == 1500.0
    assert credits.has_usage_balance(u) is True, "a top-up must clear the block"


def test_charge_actual_usage_can_still_floor_when_asked(db):
    """allow_overdraft=False keeps the old floor-at-zero behaviour for any caller
    that needs it."""
    u = _user(db, "meter_floor", tokens=5.0)
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.90)

    credits.charge_actual_usage(u, "agent_session", db, since_id=w, pre_charged=0,
                                allow_overdraft=False, idempotency_key=_key("floor"))
    db.refresh(u)
    assert credits.get_token_balance(u) == 0.0


def test_unmetered_user_is_never_settled(db):
    """The operator account is the only unmetered one — no charge, no ledger row."""
    u = _user(db, "meter_admin", tokens=5.0)
    u.role = "admin"
    db.commit()
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.50)

    charged = credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                          pre_charged=0, idempotency_key=_key("admin"))
    db.refresh(u)
    assert charged == 0
    assert credits.get_token_balance(u) == 5.0


def test_settlement_records_a_ledger_row(db):
    """Every settlement leaves a CreditTransaction so the spend is auditable."""
    u = _user(db, "meter_ledger", tokens=100)
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.05)                # 5 cents = 500 tokens

    ledger_key = _key("ledger")
    credits.charge_actual_usage(u, "agent_session", db, since_id=w,
                                pre_charged=0, idempotency_key=ledger_key)
    rows = (db.query(CreditTransaction)
              .filter(CreditTransaction.user_id == u.id,
                      CreditTransaction.reason == ledger_key).all())
    assert len(rows) == 1
    assert rows[0].delta == -500          # 5 cents at 100 tokens/cent


# ─── EVERY process costs tokens (owner 2026-09-17) ───────────────────────────
# "every single process, from humanizing, ai detection, EVERYTHING costs tokens".
# The foundation is the ledger: anything that records its real cost there becomes
# billable, because charging sums what the ledger accumulated during a task. The
# AI detectors cost real money and recorded NOTHING before this — nothing could
# ever bill for them.

def test_detector_cost_formulas_match_published_rates():
    from server.detectors import estimate_detector_cost, SAPLING_USD_PER_CHAR, PANGRAM_USD_PER_WORD

    # Sapling: $0.005 per 1,000 characters
    assert SAPLING_USD_PER_CHAR == 0.000005
    assert abs(estimate_detector_cost("sapling", "x" * 1000) - 0.005) < 1e-9

    # Pangram: $0.05 per 1,000 words, billed one unit per STARTED 1,000-word
    # block with a minimum of one unit — so the cheapest scan is 5 cents.
    assert PANGRAM_USD_PER_WORD == 0.00005
    assert abs(estimate_detector_cost("pangram", "word " * 1000) - 0.05) < 1e-9
    assert abs(estimate_detector_cost("pangram", "word") - 0.05) < 1e-9        # min unit
    assert abs(estimate_detector_cost("pangram", "word " * 1500) - 0.10) < 1e-9  # ceil to 2 units

    # a local/unknown detector costs nothing
    assert estimate_detector_cost("zippy", "x" * 5000) == 0.0


def test_detector_cost_reaches_the_ledger(db):
    """The regression that matters: a paid detector call must leave a ledger row
    in the ACTUAL calling user's name, so the charge path can see it."""
    from server.metering import meter_user
    from server.detectors import _record_detector_cost

    # unique per run: the test DB is a persistent file, so a fixed public_id
    # accumulates rows across runs and the exact-count assertion below fails.
    u = _user(db, f"meter_detector_{uuid.uuid4().hex[:10]}", tokens=100)
    essay = "word " * 500

    with meter_user(u.public_id):
        _record_detector_cost("pangram", essay)

    db.expire_all()
    rows = (db.query(ApiUsageLog)
              .filter(ApiUsageLog.user_id == u.id,
                      ApiUsageLog.tool_or_model == "detector:pangram").all())
    assert len(rows) == 1, "the detector call must be recorded against the paying user"
    assert rows[0].base_cost_usd == 0.05
    assert rows[0].category == "detector"


def test_detector_cost_is_unattributed_without_a_meter_context(db):
    """No paying user in context = no mis-billing. The cost is dropped, not
    charged to whoever happens to be nearby."""
    from server.detectors import _record_detector_cost
    before = db.query(ApiUsageLog).count()
    _record_detector_cost("pangram", "word " * 500)
    assert db.query(ApiUsageLog).count() == before


def test_meter_context_is_task_isolated():
    """The contextvar must not leak between concurrent requests — two users'
    costs can never cross."""
    import asyncio
    from server.metering import meter_user, current_meter_user

    async def worker(pid):
        with meter_user(pid):
            await asyncio.sleep(0.01)
            return current_meter_user()

    async def main():
        return await asyncio.gather(worker("userA"), worker("userB"))

    assert asyncio.run(main()) == ["userA", "userB"]
    assert current_meter_user() is None


def test_agent_action_charges_measured_cost_no_flat_price(db, monkeypatch):
    """Owner 2026-09-17: "Convert everything, no flat prices". An action's price
    IS its measured cost at 100 tokens/cent — the old flat table is gone. The only
    floor is the universal 1-token minimum."""
    from server import routes_overlord as ov

    u = _user(db, "meter_action", tokens=50000)
    charged = {}

    monkeypatch.setattr(ov, "_charge_tokens", lambda user, d, cost: charged.update(cost=cost))

    # cheap work is cheap: 0.1 cent -> 10 tokens, NOT the old flat 5
    w = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.001)
    ov._charge_usage(u, db, "create_assignment", since_id=w)
    assert charged["cost"] == 10.0, charged

    # expensive work costs more: 42 cents -> 4,200 tokens
    w2 = credits.ledger_watermark(db, u.id)
    _spend(db, u, 0.42)
    ov._charge_usage(u, db, "create_assignment", since_id=w2)
    assert charged["cost"] == 4200.0, charged

    # no measurable cost still bills the 1-token minimum, never zero
    w3 = credits.ledger_watermark(db, u.id)
    ov._charge_usage(u, db, "create_assignment", since_id=w3)
    assert charged["cost"] == 1.0, charged


def test_plan_allowances_match_the_owners_spec_and_keep_the_economics():
    """Owner 2026-09-17: "have the 10/mo be 30k tokens, 20/mo be 100k tokens, and
    40/mo be 270k tokens". Paired with 100 tokens = 1 cent these are the SAME
    economics as the old 300/1000/2700 at 1 token = 1 cent — this pins both the
    numbers and the margins, so a future unit change cannot silently reprice a
    plan."""
    from server.payments import TIER_TOKENS, TIER_PRICE_CENTS

    assert TIER_TOKENS["basic"] == 30000
    assert TIER_TOKENS["pro"] == 100000
    assert TIER_TOKENS["elite"] == 270000

    expected_service = {"basic": 3.00, "pro": 10.00, "elite": 27.00}
    for plan, service_usd in expected_service.items():
        price = TIER_PRICE_CENTS[plan] / 100.0
        delivered = TIER_TOKENS[plan] / credits.TOKENS_PER_USD
        assert abs(delivered - service_usd) < 0.01, (plan, delivered)
        assert delivered < price, f"{plan} would sell service at a loss"


def test_trial_grant_comes_from_the_single_source():
    """The trial grant and the catalogue must not drift — a 100x unit change once
    left the trial granting 150 while the plan table said 15,000."""
    from server.trial_service import TRIAL_CREDITS_GRANT
    from server.payments import TIER_TOKENS
    from server.credits import TIER_MONTHLY_TASK_TOKENS

    assert TRIAL_CREDITS_GRANT == float(TIER_TOKENS["trial"]) == 15000
    assert TIER_MONTHLY_TASK_TOKENS["trial"] == TIER_TOKENS["trial"]


def test_hip_energy_cost_is_measured_not_guessed():
    """Owner: "every single process, from humanizing ... EVERYTHING costs tokens".
    HIP runs locally so its upstream API cost is zero, but it burns real CPU.
    Pricing that as electricity makes humanizing a MEASURED cost that scales with
    model size and round count, instead of an arbitrary minimum."""
    from server.hip_humanizer import JOULES_PER_CPU_SECOND, USD_PER_KWH
    from server.metering import record_service_cost
    from server import metering

    # the calibration is grounded in a real measurement on this box:
    # a 252-word essay took 363.5 CPU-seconds and ~1.75 kJ
    cpu_seconds = 363.5
    joules = cpu_seconds * JOULES_PER_CPU_SECOND
    assert 1500 < joules < 2100, f"calibration drifted: {joules} J"

    usd = joules / 3_600_000.0 * USD_PER_KWH
    # electricity is trivially cheap, so this correctly bills the 1-token minimum
    assert credits.calculate_task_token_cost(usd) == 1
    # ...but it is NOT zero, which is the point
    assert usd > 0


def test_hip_records_energy_in_the_ledger(db, monkeypatch):
    """With a paying user in context the energy cost must reach the ledger."""
    from server import hip_humanizer, metering

    u = _user(db, f"meter_hip_{uuid.uuid4().hex[:8]}", tokens=1000)
    recorded = {}
    monkeypatch.setattr(metering, "record_service_cost",
                        lambda **kw: recorded.update(kw))

    with metering.meter_user(u.public_id):
        hip_humanizer._record_hip_energy(363.5)

    assert recorded.get("service") == "humanizer:hip"
    assert recorded.get("cost_usd", 0) > 0
    assert recorded["metadata"]["cpu_seconds"] == 363.5
