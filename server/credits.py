from __future__ import annotations
import logging
from typing import Any, Callable, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, update, text
from server.database import CreditTransaction, DataSubmission, User

logger = logging.getLogger('helpotron.credits')

TASK_COSTS: Dict[str, int] = {
    'flashcards': 1,
    'study_guide': 2,
    'practice_quiz': 2,
    'summary_2min': 1,
    'summary': 1,
    'agent_session': 1,
    'lecture_transcribe': 5,
    'humanizer_draft': 3,
    'subagent_browser': 10,
    'assignment_solve': 5,
    'code_analysis': 3,
}

BASE_TASK_COSTS = TASK_COSTS

import math

# Owner (2026-09-17): "have the 10/mo be 30k tokens, 20/mo be 100k tokens, and
# 40/mo be 270k tokens". These are the SAME plan economics as before, scaled by
# the 100x unit change — $10 -> 30k tokens = $3.00 of service at 10k tokens/$1
# (3.33x markup, 70% margin), $20 -> 100k = $10.00 (2.0x, 50%), $40 -> 270k =
# $27.00 (1.48x, 32.5%). The old 300/1000/2700 were those exact values at the
# coarse rate; nothing about pricing changed, only the resolution.
# THE canonical monthly allowance table. payments.TIER_TOKENS re-exports this
# name, so there is exactly one place these numbers live.
#
# It used to exist twice — once here and once as a literal in payments.py — and
# the two drifted the moment a tier was added to only one of them (measured
# 2026-09-18: the new 'testing' tier displayed 30,000 tokens because the lookup
# missed this dict and fell through to the caller's default). The table lives
# here because payments.py already imports this module, so this is the one
# direction that creates no import cycle; the reverse does not resolve.
TIER_MONTHLY_TASK_TOKENS: Dict[str, int] = {
    # Owner 2026-09-19: trial = one-time, 15,000 tokens, 14 days (was 7).
    'trial': 15000,
    # Owner 2026-09-19: Testing = a flat 10,000-token allocation that NEVER
    # EXPIRES. It is a grant, not a subscription — nothing renews it and nothing
    # claws it back, so the number is deliberately not on the monthly ladder.
    'testing': 10000,
    'basic': 30000,
    'pro': 100000,
    'elite': 270000,
    'free': 15000,
}
TIER_MONTHLY_CREDITS: Dict[str, int] = TIER_MONTHLY_TASK_TOKENS


TOKENS_PER_USD = 10_000       # 100 tokens = 1 cent, so 10,000 tokens = $1.00
TOKENS_PER_CENT = 100         # the owner's unit: 1 token = 1/100 of a cent


def calculate_task_token_cost(cost_usd: float) -> int:
    """Convert a measured dollar cost into task tokens.

    Owner (2026-09-17): "change it to 1 token equals 1/100 of a cent ... reason
    for this is cuz a lot of tasks are under a cent, we need to do that for more
    accurate calculation".

    So the rate is 100 tokens per cent (10,000 per dollar). At the coarse rate a
    half-cent task and a hundredth-of-a-cent task both rounded to 1 token; now
    they are 50 and 1. The plan economics are unchanged — the allowances were
    scaled by the same factor — but sub-cent work can finally be priced honestly.

    The `max(1, ...)` is the rounding floor, not a flat price: every process the
    owner asked to be metered costs at least one token (1/100 cent) even when it
    runs locally and its measured upstream cost is zero.
    """
    if cost_usd <= 0:
        return 1
    return max(1, int(math.ceil(cost_usd * TOKENS_PER_USD)))


def task_tokens_to_usd(tokens: int | float, ndigits: int = 6) -> float:
    """Convert a task token count into USD, keeping sub-cent precision (default 6dp).

    Inverse of calculate_task_token_cost: 1 token = 1/100 cent = $0.0001 (10,000 tokens / $1).
    """
    return round(float(tokens) / TOKENS_PER_USD, ndigits)


# ── Usage metering: charge for what a task ACTUALLY cost (owner 2026-09-17) ──
# `calculate_task_token_cost` is the owner's rule — 1 token per cent of service —
# and for a long time it had ZERO call sites: charging used the flat TASK_COSTS
# table instead, so the price of a task never depended on what it cost to serve.
# Measured at the time: 236 logged calls averaged ~0.47 cents each, while an
# agent_session was charged a flat 1 token no matter how many calls it made.
#
# The helpers below close that loop by reading the real cost ledger. A task is
# metered by taking a WATERMARK before it runs and summing the ledger rows
# recorded after it — that is what makes "any process that fulfils a request is
# calculated in cents" literally true, with no per-callsite bookkeeping.


def ledger_watermark(db: Session, user_id: int) -> int:
    """Marker for 'start measuring here': the newest ApiUsageLog id for a user.

    Take this BEFORE the work starts, then pass it to charge_actual_usage().
    """
    from server.database import ApiUsageLog
    try:
        row = (db.query(func.max(ApiUsageLog.id))
                 .filter(ApiUsageLog.user_id == user_id).scalar())
        return int(row) if row else 0
    except Exception as e:
        logger.warning("ledger_watermark failed for user %s: %s", user_id, e)
        return 0


def usage_cents_since(db: Session, user_id: int, since_id: int) -> float:
    """Real cost, in CENTS, of everything this user consumed since a watermark.

    Sums `base_cost_usd` (the true upstream cost) rather than
    `charged_cost_usd`, so a per-user analytics multiplier cannot inflate what
    they are billed for. Returns 0.0 on any failure — a metering outage must
    never invent a charge.
    """
    from server.database import ApiUsageLog
    try:
        total = (db.query(func.coalesce(func.sum(ApiUsageLog.base_cost_usd), 0.0))
                   .filter(ApiUsageLog.user_id == user_id,
                           ApiUsageLog.id > int(since_id))
                   .scalar())
        return float(total or 0.0) * 100.0
    except Exception as e:
        logger.warning("usage_cents_since failed for user %s: %s", user_id, e)
        return 0.0


def _latest_ledger_id(db: Session, user_id: int) -> int:
    """Newest real ApiUsageLog id for a user right now — the UPPER bound of a settlement."""
    from server.database import ApiUsageLog
    try:
        row = db.query(func.max(ApiUsageLog.id)).filter(ApiUsageLog.user_id == user_id).scalar()
        return int(row) if row else 0
    except Exception:
        return 0


_HIGH_WATER_KEY = "usage_high_water_id"


def _usage_high_water(user: Any) -> int:
    """The newest ledger id this account has ALREADY been billed for."""
    settings = getattr(user, "settings", None) or {}
    try:
        return int(settings.get(_HIGH_WATER_KEY) or 0)
    except (TypeError, ValueError):
        return 0


def _set_usage_high_water(row: Any, value: int) -> None:
    """Advance the mark. Only ever moves FORWARD — a lower value would re-bill."""
    settings = dict(getattr(row, "settings", None) or {})
    if int(value) > int(settings.get(_HIGH_WATER_KEY) or 0):
        settings[_HIGH_WATER_KEY] = int(value)
        row.settings = settings


def usage_cents_between(db: Session, user_id: int, after_id: int, upto_id: int) -> float:
    """Real cost of only the entries in the id range (after_id, upto_id].

    ★ WHY THE RANGE MATTERS. `usage_cents_since` sums everything after a watermark, and the
    watermark is taken PER USER while a task's idempotency key is PER TASK. Two tasks running
    concurrently on one account therefore take the SAME baseline and each bill the ENTIRE
    window — so the second settlement charges the first task's spend a second time.

    Measured on a scratch DB: two tasks, $0.02 and $0.03 of real cost, billed 5.00 + 5.00 =
    10.00 cents against 5.00 actual. Over-charging a paying account, silently, whenever a
    user runs two things at once. The caller advances a per-user high-water mark to the end
    of what it settled, so each id is billed exactly once. `upto_id` is what makes that
    possible — without an upper bound there is no way to name "the part I just paid for".
    """
    from server.database import ApiUsageLog
    try:
        total = (db.query(func.coalesce(func.sum(ApiUsageLog.base_cost_usd), 0.0))
                   .filter(ApiUsageLog.user_id == user_id,
                           ApiUsageLog.id > int(after_id),
                           ApiUsageLog.id <= int(upto_id))
                   .scalar())
        return float(total or 0.0) * 100.0
    except Exception as e:
        logger.warning("usage_cents_between failed for user %s: %s", user_id, e)
        return 0.0


def daily_cost_exceeded(db: Session, user: Any, cap_usd: Optional[float] = None) -> bool:
    """Has an UNMETERED account already spent past its daily cap?

    `is_unmetered` means admin, and `charge_actual_usage` returns 0 for an
    unmetered account — so the operator has no cost ceiling at all. A rate limit
    bounds the COUNT of requests, not their cost, and one action can be a 40-round
    agent task or a two-hour transcription.

    The spend is already recorded for every user including the operator
    (`ApiUsageLog.base_cost_usd`, written by cost_tracking), so this is one SUM.

    The cap is deliberately generous — Elite is ~$27/month ≈ $0.90/day, so $10/day
    is ~11x headroom for legitimate use while still bounding a runaway. A real
    prior incident was $19.43 in a single day.

    Fail OPEN on any error: a metering outage must not brick the operator's own
    account. This is a runaway brake, not a security boundary.
    """
    from server.database import ApiUsageLog
    if cap_usd is None:
        try:
            from server.config import config
            cap_usd = float(getattr(config, "admin_daily_cost_cap_usd", 10.0) or 10.0)
        except Exception:
            cap_usd = 10.0
    if cap_usd <= 0:
        return False  # cap disabled
    try:
        from datetime import datetime, timedelta, timezone
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
        spent = (db.query(func.coalesce(func.sum(ApiUsageLog.base_cost_usd), 0.0))
                   .filter(ApiUsageLog.user_id == user.id,
                           ApiUsageLog.created_at >= since)
                   .scalar())
        if float(spent or 0.0) >= cap_usd:
            logger.warning("operator daily cost cap hit for %s: $%.4f >= $%.2f in 24h",
                           getattr(user, "public_id", "?"), float(spent or 0.0), cap_usd)
            return True
        return False
    except Exception as e:
        logger.warning("daily_cost_exceeded failed open for %s: %s",
                       getattr(user, "public_id", "?"), e)
        return False


def has_usage_balance(user: Any, db: Optional[Session] = None) -> bool:
    """Eligibility check for starting metered work — no deduction.

    Owner (2026-09-17): "just charge the token costs after its calculated, dont
    guess before". So the gate no longer holds an estimate; it only refuses to
    START work for an account that has nothing left. The real cost is charged
    afterwards by charge_actual_usage().

    An UNMETERED account (admin) has no token balance to check, so the daily cost
    cap is the only brake it has. `db` is optional because most callers are
    metered and do not need the spend query; when it is omitted for an unmetered
    account the cap is simply not consulted, which preserves the old behaviour.
    """
    try:
        if is_unmetered(user):
            if db is not None and daily_cost_exceeded(db, user):
                return False
            return True
        return get_token_balance(user) > 0
    except Exception:
        return True


def charge_actual_usage(user: Any, task_name: str, db: Session, since_id: int,
                        pre_charged: int = 0, reason: str = "",
                        allow_overdraft: bool = True,
                        idempotency_key: Optional[str] = None) -> int:
    """Charge a finished task for what it ACTUALLY cost.

    Converts the measured cost to tokens at the owner's rate (100 tokens = 1
    cent). Returns the number of tokens charged (signed: negative if it adjusted
    down).

    The owner's model, verbatim: *"just charge the token costs after its
    calculated, dont guess before"*. So there is no up-front estimate — the work
    runs, the cost ledger records what it consumed, and this charges that. The
    gate only checks eligibility (has_usage_balance), it does not deduct.

    `pre_charged` exists for callers that still hold an up-front charge (the flat
    TASK_COSTS sites that have not been converted); it is subtracted so only the
    difference bills. Pass 0 for the pure charge-after path.

    idempotency_key: REQUIRED when the caller might settle the same window twice —
    a watermark is not a lock, so without it a re-entered completion path bills
    the whole window again (measured: 9 tokens per duplicate settlement). Pass
    something unique per run (e.g. the session id).

    allow_overdraft=True (default): if the work cost more than the balance, the
    balance goes NEGATIVE rather than the platform silently eating the difference.
    The work was already performed, so the cost is real; a negative balance is
    honest accounting and it self-blocks the account until they top up. Written
    directly rather than via set_token_balance(), which clamps at 0 by design for
    every other caller.
    """
    user_id = user.id if hasattr(user, 'id') else user
    row = db.query(User).filter(User.id == user_id).with_for_update().first()
    if row is None:
        return 0
    if is_unmetered(row):
        return 0

    entry_reason = idempotency_key or reason or f"usage:{task_name}"
    if idempotency_key:
        already = db.query(CreditTransaction).filter(
            CreditTransaction.user_id == user_id,
            CreditTransaction.reason == entry_reason,
        ).first()
        if already is not None:
            logger.info("usage settlement for %s already recorded — skipping", entry_reason)
            return 0

    # ★ Bill the RANGE this task owns, never "everything after a per-user watermark".
    # The watermark is taken per USER while the idempotency key is per TASK, so two tasks
    # running concurrently on one account take the SAME baseline and each used to bill the
    # entire window — the second settlement re-charged the first task's spend. Measured on a
    # scratch DB: $0.02 + $0.03 of real cost billed 10.00 cents instead of 5.00.
    # The floor is the further of the caller's watermark and this account's high-water mark,
    # and the ceiling is the newest ledger id at settlement, so every id bills exactly once.
    upto_id = _latest_ledger_id(db, user_id)
    floor_id = max(int(since_id or 0), _usage_high_water(row))
    cents = usage_cents_between(db, user_id, floor_id, upto_id) if upto_id > floor_id else 0.0
    # Always at least one token. The owner wants EVERY process metered, including
    # ones that spend nothing upstream (HIP humanizing runs locally), so a task
    # that ran and recorded no cost still bills the 1-token minimum rather than
    # being free.
    actual = calculate_task_token_cost(cents / 100.0)
    delta = actual - max(0, int(pre_charged or 0))
    if delta == 0:
        # ★ A zero-delta settlement still CONSUMED the ledger range, so the mark must move
        # even though nothing is charged. Leaving it behind means the next settlement on
        # this account floors at the old mark and re-bills the ids THIS task already
        # accounted for — the same double-bill class as the concurrent-tasks fix above.
        # The idempotency row goes in the same transaction so a re-entered completion
        # path is recognisable here too, not only on the charged path.
        if upto_id > _usage_high_water(row):
            _set_usage_high_water(row, upto_id)
        if idempotency_key:
            db.add(CreditTransaction(
                user_id=user_id,
                delta=0,
                reason=entry_reason,
            ))
        db.commit()
        return 0

    balance = get_token_balance(row)
    new_balance = balance - delta
    if new_balance < 0 and not allow_overdraft:
        logger.warning(
            "usage settlement short by %s tokens for user %s on %s "
            "(real cost %.4f cents, charged %s, balance %s) — flooring at 0",
            -new_balance, user_id, task_name, cents, actual, balance,
        )
        new_balance = 0.0

    if new_balance < 0:
        # Overdraft is deliberate (owner: charge what it cost, after). Write the
        # settings blob directly — set_token_balance() clamps at 0 for every other
        # caller and that invariant must not change underneath them.
        warn = dict(getattr(row, "settings", None) or {})
        warn["token_balance"] = float(new_balance)
        row.settings = warn
        logger.warning(
            "usage overdraft: user %s now at %.2f tokens after %s (real cost %.4f cents) "
            "— the account is blocked from new work until it tops up",
            user_id, new_balance, task_name, cents,
        )
    else:
        set_token_balance(row, new_balance)

    db.add(CreditTransaction(
        user_id=user_id,
        delta=-delta,
        reason=entry_reason,
    ))
    # Advance the mark in the SAME transaction as the charge: a mark written without the
    # charge would lose revenue, and a charge written without the mark would bill twice.
    _set_usage_high_water(row, upto_id)
    db.commit()
    logger.info("Charged %s tokens for %s (real cost %.4f cents, pre-charged %s)",
                delta, task_name, cents, pre_charged)
    return delta


def get_token_balance(user: User) -> float:
    """The user's spendable TASK TOKEN balance — the usage currency.

    Tokens are what tasks are paid for and what a plan grants monthly. They live
    in `settings.token_balance` (not in the `users.credits` column, which is the
    earn-only DISCOUNT currency — see the module docstring).
    """
    settings = getattr(user, "settings", None) or {}
    try:
        return float(settings.get("token_balance", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def set_token_balance(user: User, value: float) -> None:
    """Write the token balance back into the settings blob.

    The settings column is JSON, so the containing dict must be REPLACED (a
    mutated-in-place dict is the same object and SQLAlchemy skips the flush —
    the same trap documented in user_settings_service).

    ⚠️ This sets an ABSOLUTE value, so it is only safe when the caller is the sole
    writer. A read-then-set sequence across two concurrent requests loses one debit:
    both read 1000, both write 600, and 800 of spend is applied as 400. For anything
    that debits an existing balance use `debit_tokens_atomic`, which applies the
    change in the database in one statement.
    """
    settings = dict(getattr(user, "settings", None) or {})
    settings["token_balance"] = max(0.0, float(value))
    user.settings = settings
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(user, "settings")


def debit_tokens_atomic(db: Session, user_id: int, amount: float, allow_negative: bool = True) -> float:
    """Apply a token delta as ONE statement, and return the new balance.

    `settings` is a JSON blob, so there is no way to make a separate read-then-write
    atomic — and `with_for_update()` does not help here, because it is a NO-OP on
    SQLite (verified: compiling it emits no `FOR UPDATE`, SQLite has no row locks).
    A read-modify-write therefore needs the change expressed INSIDE the statement, which
    is what `json_set` with `json_extract` does: the read and the write happen together
    in the database, so two concurrent debits both land.

    Measured before this existed: two concurrent 400-token debits against a 1000-token
    balance left 600, not 200 — one debit was silently swallowed and both callers were
    told they had succeeded.

    `allow_negative` mirrors the documented post-hoc settlement rule: work that has
    already run cost what it cost, so the balance is allowed to go below zero and the
    account self-blocks until a top-up. Clamping to zero would move the shortfall onto
    the platform. Pass False for the pre-flight paths, where a debit is a purchase.
    """
    amount = float(amount)
    if amount <= 0:
        return 0.0
    expr = (
        "json_set(settings, '$.token_balance', "
        "CAST(COALESCE(json_extract(settings, '$.token_balance'), 0) AS REAL) - :amt)"
    )
    if not allow_negative:
        expr = f"CASE WHEN COALESCE(json_extract(settings, '$.token_balance'), 0) - :amt < 0 "\
               f"THEN settings ELSE {expr} END"
    # Security audit HT-009: NOT exploitable. The interpolated f-string (expr / CASE WHEN)
    # is assembled strictly from static SQL fragments; all dynamic/variable inputs (:amt, :uid)
    # are securely bound parameters. Recorded so this static pattern is not re-flagged.
    result = db.execute(
        text(f"UPDATE users SET settings = {expr} WHERE id = :uid"),
        {"amt": amount, "uid": user_id},
    )
    db.commit()
    row = db.query(User).filter(User.id == user_id).first()
    return get_token_balance(row) if row is not None else 0.0


def credit_tokens_atomic(db: Session, user_id: int, amount: float) -> float:
    """Add `amount` tokens in ONE statement, and return the new balance.

    The mirror of debit_tokens_atomic, and it exists for the same reason: `settings` is
    a JSON blob, so a read-then-write is not atomic and two concurrent refunds can
    swallow each other. debit_tokens_atomic refuses a non-positive amount by design, so
    a refund cannot be expressed as a negative debit — it needs this.
    """
    amount = float(amount)
    if amount <= 0:
        return 0.0
    db.execute(
        text("UPDATE users SET settings = json_set(settings, '$.token_balance', "
             "CAST(COALESCE(json_extract(settings, '$.token_balance'), 0) AS REAL) + :amt) "
             "WHERE id = :uid"),
        {"amt": amount, "uid": user_id},
    )
    db.commit()
    row = db.query(User).filter(User.id == user_id).first()
    return get_token_balance(row) if row is not None else 0.0


def is_unmetered(user: User) -> bool:
    """True when usage should not be metered.

    Admins/operators only. A paid plan — INCLUDING Elite — is metered: every plan
    is a monthly token allowance, so Elite buys 270,000 tokens/month, not unlimited
    spend. Before this, `plan == "elite"` short-circuited every charge, so a $40
    subscription could consume unbounded upstream model spend.
    """
    try:
        from .security import is_admin_user
        return bool(is_admin_user(user))
    except Exception:
        return False


# Kept as the legacy public name; it now means "the operator account", not "elite".
is_usage_unlimited = is_unmetered


# ── Legacy display helper ────────────────────────────────────────────────────
# Kept so existing callers do not break, but see spend_credits()/earn_credits()
# below for what credits now mean.
def get_balance(user: User) -> float:
    """Earned DISCOUNT credits (percent). Usage balance is get_token_balance()."""
    return float(getattr(user, "discount_balance", 0.0) or 0.0)


def effective_credits_balance(db: Session, user: User) -> float:
    """Reconciled discount-credit balance for display, never below either source.

    Credits are earned (data-lake entries, referral codes) and spent as a percent
    discount, so both sources are discount-denominated:
      - `user.discount_balance` + `user.discount_spillover` — the live fields;
      - the `credit_transactions` ledger — the audit trail.
    Historic `users.credits` rows predate the split and are read only as a
    fallback so a legacy account does not render as 0.
    """
    ledger = float(
        db.query(func.coalesce(func.sum(CreditTransaction.delta), 0.0))
        .filter(CreditTransaction.user_id == user.id)
        .scalar() or 0.0
    )
    column = float(getattr(user, "credits", 0.0) or 0.0)
    live = float(getattr(user, "discount_balance", 0.0) or 0.0) + float(
        getattr(user, "discount_spillover", 0.0) or 0.0
    )
    return max(ledger, column, live)


def earn_credits(db: Session, user: User, amount: float, reason: str) -> float:
    """Grant EARNED discount credits. The only way credits are created.

    Not purchasable and never granted by a plan subscription — that is the whole
    point of the currency: it rewards contributing (data-lake entries, referral
    codes) and only ever reduces a bill.
    """
    if not user or amount <= 0:
        return 0.0
    user.discount_balance = float(getattr(user, "discount_balance", 0.0) or 0.0) + amount
    db.add(CreditTransaction(user_id=user.id, delta=amount, reason=reason))
    db.commit()
    logger.info("Earned credits: user=%s +%s (%s)", user.id, amount, reason)
    return amount


class InsufficientCreditsError(Exception):
    pass

def charge(user: Any, task_name: str, db: Session, cost_override: Optional[int] = None, reason: str = "", idempotency_key: Optional[str] = None) -> bool:
    """Deduct TASK TOKENS for a task. Returns False when the balance is short.

    Tokens are read from `settings.token_balance`; this used to decrement the
    `users.credits` column, which is the earn-only discount currency, so a plan
    purchase funded one field while the agent gate read the other.
    """
    user_id = user.id if hasattr(user, 'id') else user
    cost = cost_override if cost_override is not None else TASK_COSTS.get(task_name, 1)
    if cost <= 0:
        return True

    # FOR UPDATE, not a plain read: tokens live in a JSON blob that cannot be
    # decremented by a single atomic `UPDATE ... WHERE balance >= cost` the way
    # the old credits column could, so the read-modify-write is serialised on the
    # row instead. Without it two concurrent tasks both read the same balance and
    # both succeed, overdrawing the account.
    row = db.query(User).filter(User.id == user_id).with_for_update().first()
    if row is None:
        return False
    if is_unmetered(row):
        return True

    balance = get_token_balance(row)
    if balance < cost:
        # Release the lock taken above (see charge_with_rollback).
        db.rollback()
        return False

    set_token_balance(row, balance - cost)
    db.add(CreditTransaction(
        user_id=user_id,
        delta=-cost,
        reason=reason or f"charge:{task_name}",
    ))
    db.commit()
    logger.info("Charged %s %s tokens for %s.", user_id, cost, task_name)
    return True

charge_user = charge

def refund(user: Any, task_name: str, db: Session) -> None:
    """Refund tokens if an upstream workflow fails after deduction."""
    user_id = user.id if hasattr(user, 'id') else user
    cost = TASK_COSTS.get(task_name, 1)
    row = db.query(User).filter(User.id == user_id).first()
    if row:
        set_token_balance(row, get_token_balance(row) + cost)
        db.commit()
        logger.info("Refunded %s %s tokens for failed %s", user_id, cost, task_name)

MAX_DISCOUNT_PCT = 20.0

def compute_applicable_discount(user: User, cost_cents: Optional[int] = None) -> float:
    if not user:
        return 0.0
    balance = getattr(user, "discount_balance", 0.0) or 0.0
    spillover = getattr(user, "discount_spillover", 0.0) or 0.0
    return min(balance + spillover, MAX_DISCOUNT_PCT)

def apply_discount(user: User, db_or_cents: Any) -> Any:
    if isinstance(db_or_cents, Session):
        db = db_or_cents
        applied = compute_applicable_discount(user)
        if applied == 0.0:
            return 0.0
        balance = user.discount_balance or 0.0
        spillover = user.discount_spillover or 0.0
        remaining = applied
        if balance >= remaining:
            user.discount_balance = balance - remaining
            remaining = 0.0
        else:
            user.discount_balance = 0.0
            remaining -= balance
        if remaining > 0 and spillover >= remaining:
            user.discount_spillover = spillover - remaining
            remaining = 0.0
        elif remaining > 0:
            user.discount_spillover = 0.0
        db.commit()
        return applied
    else:
        cost_cents = int(db_or_cents)
        discount = compute_applicable_discount(user)
        return max(0, int(cost_cents - (cost_cents * (discount / 100.0))))

def safe_deduct_with_rollback(
    db: Session,
    user: User,
    amount: float,
    operation_desc: str = "operation"
) -> Tuple[bool, Optional[Callable[[], None]]]:
    """Deduct TASK TOKENS with a rollback handle. Used by the agent session."""
    if is_unmetered(user):
        return True, None
    # A read-then-write cannot be atomic on a JSON blob, and with_for_update() is a
    # NO-OP on SQLite (see debit_tokens_atomic). This function used the read-modify-write
    # pattern that debit_tokens_atomic exists to replace, so two concurrent agent
    # sessions could each read the same balance and the second write swallowed the
    # first — measured elsewhere in this file at "two concurrent 400-token debits
    # against 1000 left 600, not 200, and both callers were told they succeeded".
    # The balance check and the debit now happen inside one statement.
    before = get_token_balance(db.query(User).filter(User.id == user.id).first() or user)
    if before < amount:
        return False, None
    new_balance = debit_tokens_atomic(db, user.id, amount, allow_negative=False)
    if new_balance == before:
        # The CASE guard in debit_tokens_atomic refused it: a concurrent debit took the
        # balance below `amount` between our check and the statement.
        return False, None
    db.add(CreditTransaction(user_id=user.id, delta=-amount, reason=f"safe_deduct:{operation_desc}"))
    db.commit()

    def rollback():
        db.add(CreditTransaction(user_id=user.id, delta=amount, reason=f"refund:{operation_desc}"))
        db.commit()
        credit_tokens_atomic(db, user.id, amount)
        logger.info("Rolled back %s tokens for user %s (%s)", amount, user.id, operation_desc)

    return True, rollback

def add_tokens(db: Session, user: User, amount: float, reason: str = "grant") -> float:
    """Grant TASK TOKENS. Used by plan purchases/renewals and refunds."""
    if user is None or amount == 0:
        return 0.0
    fresh = db.query(User).filter(User.id == user.id).first() or user
    new_balance = get_token_balance(fresh) + float(amount)
    set_token_balance(fresh, new_balance)
    db.add(CreditTransaction(user_id=user.id, delta=float(amount), reason=reason))
    db.commit()
    logger.info("Granted tokens: user=%s %+s (%s) -> %s", user.id, amount, reason, new_balance)
    return new_balance


def top_up(db_or_user_id: Any, user_or_amount: Any, amount_or_reason: Any = "topup", reason: str = "topup") -> None:
    """Grant tokens or refund them. Historically credited the discount column;
    usage is token-denominated, so this now writes tokens (see add_tokens)."""
    if isinstance(db_or_user_id, Session):
        db = db_or_user_id
        user = user_or_amount
        amount = float(amount_or_reason)
    else:
        user_id = db_or_user_id
        amount = float(user_or_amount)
        reason = str(amount_or_reason)
        from server.database import SessionLocal
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()

    if user:
        add_tokens(db, user, amount, reason=reason)

def record_data_submission(db: Session, user: User, payload: dict) -> dict:
    from datetime import datetime, timedelta, timezone
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    recent = db.query(DataSubmission).filter(
        DataSubmission.user_id == user.id,
        DataSubmission.created_at >= since
    ).first()
    if recent:
        bal = float(user.discount_balance or 0.0)
        return {"discount_balance": bal, "next_purchase_discount": bal, "status": "deduplicated", "message": "Data submission already recorded for this period."}

    submission = DataSubmission(user_id=user.id, payload=payload, discount_earned=1.0)
    db.add(submission)
    user.discount_balance = 1.0
    db.commit()
    logger.info('Recorded data submission for user %s (discount 1.0%%)', user.id)
    return {"discount_balance": 1.0, "next_purchase_discount": 1.0}
