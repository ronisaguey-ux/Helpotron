from __future__ import annotations
import logging
from typing import Any, Callable, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from server.database import CreditTransaction, DataSubmission, User

logger = logging.getLogger('helpotron.credits')

TASK_COSTS: Dict[str, int] = {
    'flashcards': 1,
    'study_guide': 2,
    'practice_quiz': 2,
    'summary_2min': 1,
    'summary': 1,  # generate-route kind key (refund path indexes directly)
    'agent_session': 1,  # agent_start charge/refund key
    'lecture_transcribe': 5,
    'humanizer_draft': 3,
    'subagent_browser': 10
}

TIER_MONTHLY_CREDITS: Dict[str, int] = {
    'free': 500,
    'basic': 2000,  # anchor: main.py falls back to 2000 for unknown plans
    'pro': 6000,
    'elite': 25000,
}

def get_balance(user: User) -> int:
    """Retrieve available credit balance for user."""
    return getattr(user, 'credits', 0)

def charge(user: User, task_name: str, db: Session) -> bool:
    """Deduct credits atomically using database row locking."""
    cost = TASK_COSTS.get(task_name, 1)
    
    # Re-query with row lock to prevent race conditions
    locked_user = db.query(User).filter(User.id == user.id).with_for_update().first()
    if getattr(locked_user, "plan", "") == "elite":
        # Elite plan: generation is included — no deduction (mirrors safe_deduct_with_rollback)
        return True
    if not locked_user or locked_user.credits < cost:
        db.rollback()
        logger.warning(f'User {user.id} has insufficient credits ({getattr(locked_user, "credits", 0)}) for {task_name} (cost {cost})')
        return False
    
    locked_user.credits -= cost
    db.commit()
    db.refresh(locked_user)
    logger.info(f'Charged user {user.id} {cost} credits for {task_name}. New balance: {locked_user.credits}')
    return True

def refund(user: User, task_name: str, db: Session) -> None:
    """Refund credits if an upstream workflow fails after deduction."""
    cost = TASK_COSTS.get(task_name, 1)
    locked_user = db.query(User).filter(User.id == user.id).with_for_update().first()
    if locked_user:
        locked_user.credits += cost
        db.commit()
        logger.info(f'Refunded user {user.id} {cost} credits for failed {task_name}')


# ── Legacy-compat API (remediation BATCH-02 cross-file fix, 2026-08-21) ────
# The plan's credits rewrite (TASK_COSTS / charge / refund) drops the old
# discount + rollback helpers, but server/payments.py and server/agent_session.py
# still import them (no batch touches those files). Kept verbatim from the
# pre-plan implementation so the whole app keeps importing.

MAX_DISCOUNT_PCT = 20.0


def compute_applicable_discount(user: User) -> float:
    balance = user.discount_balance or 0.0
    spillover = user.discount_spillover or 0.0
    return min(balance + spillover, MAX_DISCOUNT_PCT)


def apply_discount(user: User, db: Session) -> float:
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


def safe_deduct_with_rollback(
    db: Session,
    user: User,
    amount: float,
    operation_desc: str = "operation"
) -> Tuple[bool, Optional[Callable[[], None]]]:
    """Safely deducts credits with a rollback closure if subsequent actions fail."""
    if getattr(user, "plan", "") == "elite":
        return True, None
    if user.credits < amount:
        return False, None
    user.credits -= amount
    tx = CreditTransaction(
        user_id=user.id,
        delta=-amount,
        reason=f"safe_deduct:{operation_desc}"
    )
    db.add(tx)
    db.commit()

    def rollback():
        user.credits += amount
        rb_tx = CreditTransaction(
            user_id=user.id,
            delta=amount,
            reason=f"refund:{operation_desc}"
        )
        db.add(rb_tx)
        db.commit()
        logger.info("Rolled back %s credits for user %s (%s)", amount, user.id, operation_desc)

    return True, rollback


# ── Remediation BATCH-11: refund top-up + discount data-submission API ───────
def top_up(db: Session, user: User, amount: float, reason: str = "topup") -> None:
    """Credit a user back after a failed charge. The generate routes call
    top_up(db, user, cost, reason=...) on generation failure (refund path)."""
    locked_user = db.query(User).filter(User.id == user.id).with_for_update().first()
    if locked_user:
        locked_user.credits += amount
        db.commit()
        logger.info('Topped up user %s +%s credits (%s)', user.id, amount, reason)


def record_data_submission(db: Session, user: User, payload: dict) -> dict:
    """Record an anonymized data submission and grant the standard 1.0%
    discount (DataSubmission.discount_earned). /api/discount contract."""
    submission = DataSubmission(user_id=user.id, payload=payload, discount_earned=1.0)
    db.add(submission)
    user.discount_balance = 1.0
    db.commit()
    logger.info('Recorded data submission for user %s (discount 1.0%%)', user.id)
    return {"discount_balance": 1.0, "next_purchase_discount": 1.0}
