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

TIER_MONTHLY_TASK_TOKENS: Dict[str, int] = {
    'trial': 150,  # owner 09-06
    'basic': 300,
    'pro': 1000,
    'elite': 2700,
    'free': 150,
}
TIER_MONTHLY_CREDITS: Dict[str, int] = TIER_MONTHLY_TASK_TOKENS


def calculate_task_token_cost(cost_usd: float) -> int:
    """Calculate task tokens from dollar cost of tools/APIs.
    1 Task Token = 1 cent ($0.01) of tool/API expenditure.
    """
    if cost_usd <= 0:
        return 0
    return max(1, int(math.ceil(cost_usd * 100.0)))


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
    """
    settings = dict(getattr(user, "settings", None) or {})
    settings["token_balance"] = max(0.0, float(value))
    user.settings = settings


def is_unmetered(user: User) -> bool:
    """True when usage should not be metered.

    Admins/operators only. A paid plan — INCLUDING Elite — is metered: every plan
    is a monthly token allowance, so Elite buys 2,700 tokens/month, not unlimited
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


def charge_with_rollback(
    user: User,
    task_name: str,
    db: Session,
    description: str = "",
) -> tuple[bool, Optional[Callable[[], None]]]:
    cost = TASK_COSTS.get(task_name, 1)
    if is_unmetered(user):
        return True, None
    ledger_user = db.query(User).filter(User.id == user.id).with_for_update().first() or user
    balance = get_token_balance(ledger_user)
    if balance < cost:
        logger.warning(
            "Insufficient tokens (%.2f) for %s (cost %s)", balance, task_name, cost
        )
        # Release the FOR UPDATE lock the select above took on this row; without
        # it the lock is held until the request's session closes, and a second
        # concurrent task on the same account blocks behind it.
        db.rollback()
        return False, None

    set_token_balance(ledger_user, balance - cost)
    db.add(CreditTransaction(
        user_id=user.id,
        delta=-cost,
        reason=description or f"charge:{task_name}",
    ))
    db.commit()
    logger.info("Charged %s tokens for %s. New balance: %s", cost, task_name, balance - cost)

    def rollback() -> None:
        fresh = db.query(User).filter(User.id == user.id).first() or user
        set_token_balance(fresh, get_token_balance(fresh) + cost)
        db.add(CreditTransaction(user_id=user.id, delta=cost, reason=f"refund:{task_name}"))
        db.commit()
        logger.info("Refunded %s tokens for failed %s", cost, task_name)

    return True, rollback

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
    row = db.query(User).filter(User.id == user.id).first() or user
    balance = get_token_balance(row)
    if balance < amount:
        return False, None
    set_token_balance(row, balance - amount)
    db.add(CreditTransaction(user_id=user.id, delta=-amount, reason=f"safe_deduct:{operation_desc}"))
    db.commit()

    def rollback():
        fresh = db.query(User).filter(User.id == user.id).first() or user
        set_token_balance(fresh, get_token_balance(fresh) + amount)
        db.add(CreditTransaction(user_id=user.id, delta=amount, reason=f"refund:{operation_desc}"))
        db.commit()
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
    submission = DataSubmission(user_id=user.id, payload=payload, discount_earned=1.0)
    db.add(submission)
    user.discount_balance = 1.0
    db.commit()
    logger.info('Recorded data submission for user %s (discount 1.0%%)', user.id)
    return {"discount_balance": 1.0, "next_purchase_discount": 1.0}

def deduct_credits_atomic(user_id: str, amount: int, description: str, db: Session, idempotency_key: str = None) -> bool:
    return charge(user_id, "assignment_solve", db, cost_override=amount, reason=description, idempotency_key=idempotency_key)

def get_user_credits(db: Session, user_id: str) -> float:
    """Earned discount credits (display). Token balance: get_token_balance()."""
    user = db.query(User).filter(User.id == user_id).first()
    return effective_credits_balance(db, user) if user else 0.0

def add_credits_to_user(db: Session, user_id: str, amount: float, description: str = "Credit addition") -> bool:
    """Grant EARNED discount credits (referral/datalake/admin). Never usage."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    earn_credits(db, user, float(amount), description)
    return True
