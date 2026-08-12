"""Credit ledger — tier pricing, charges, top-ups, discount program.

Tiers (spec): Basic $10/15 credits ($1 overage), Pro $20/40 ($0.75),
Elite $30/unlimited. Elite is flagged unlimited; the ledger still records
spends for transparency but never blocks.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .database import CreditTransaction, User

TIER_PRICE_CENTS = {"basic": 1000, "pro": 2000, "elite": 3000}
TIER_MONTHLY_CREDITS = {"basic": 15, "pro": 40, "elite": float("inf")}
TIER_OVERAGE_PER_CREDIT_CENTS = {"basic": 100, "pro": 75, "elite": 0}

# task -> credits (spec Phase 6, minus ghostwriting/voice/grade modules)
TASK_COSTS = {
    "transcription_per_hour": 1.0,
    "study_guide": 0.5,
    "flashcards": 0.5,
    "practice_test": 0.5,
    "summary": 0.5,
}

MAX_DISCOUNT_PCT = 20.0
DISCOUNT_PER_SUBMISSION_PCT = 1.0


def _is_unlimited(user: User) -> bool:
    return user.plan == "elite"


def get_balance(user: User) -> float:
    return float("inf") if _is_unlimited(user) else user.credits


def charge(db: Session, user: User, task: str) -> bool:
    """Deduct one task's credit cost. Returns False (and does not deduct)
    when the balance is insufficient and the user isn't elite."""
    cost = TASK_COSTS.get(task)
    if cost is None:
        raise ValueError(f"unknown task: {task}")
    if _is_unlimited(user):
        _record(db, user, -cost, f"spend:{task}")  # transparency only
        return True
    if user.credits < cost:
        return False
    user.credits -= cost
    _record(db, user, -cost, f"spend:{task}")
    return True


def top_up(db: Session, user: User, amount: float, reason: str = "topup") -> None:
    user.credits += amount
    _record(db, user, amount, reason)


def _record(db: Session, user: User, delta: float, reason: str) -> None:
    db.add(CreditTransaction(user_id=user.id, delta=delta, reason=reason))


def apply_data_discount(db: Session, user: User) -> float:
    """Data discount program: 1% per submission, capped 20% per purchase,
    remainder carries over. Returns the discount % to apply to the next
    purchase."""
    applied = min(user.discount_balance, MAX_DISCOUNT_PCT)
    user.discount_balance -= applied
    return applied


def record_data_submission(db: Session, user: User, payload: dict) -> dict:
    from .database import DataSubmission  # avoid circular import at module load

    earned = min(DISCOUNT_PER_SUBMISSION_PCT, MAX_DISCOUNT_PCT - user.discount_balance)
    user.discount_balance += earned
    db.add(DataSubmission(user_id=user.id, payload=payload, discount_earned=earned))
    db.flush()
    return {
        "discount_earned": earned,
        "discount_balance": round(user.discount_balance, 2),
        "next_purchase_discount": min(user.discount_balance, MAX_DISCOUNT_PCT),
    }
