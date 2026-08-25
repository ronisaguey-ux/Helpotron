from __future__ import annotations
import logging
from typing import Any, Callable, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import update
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

TIER_MONTHLY_CREDITS: Dict[str, int] = {
    'free': 500,
    'basic': 2000,
    'pro': 6000,
    'elite': 25000,
}

def get_balance(user: User) -> int:
    """Retrieve available credit balance for user."""
    return getattr(user, 'credits', 0)

def charge_with_rollback(
    user: User,
    task_name: str,
    db: Session,
    description: str = "",
) -> tuple[bool, Optional[Callable[[], None]]]:
    cost = TASK_COSTS.get(task_name, 1)
    locked_user = db.query(User).filter(User.id == user.id).with_for_update().first()
    if locked_user is None:
        return False, None
    if getattr(locked_user, "plan", "") == "elite":
        return True, None
    if locked_user.credits < cost:
        db.rollback()
        logger.warning(f'User {user.id} has insufficient credits ({locked_user.credits}) for {task_name} (cost {cost})')
        return False, None

    locked_user.credits -= cost
    db.add(CreditTransaction(
        user_id=user.id,
        delta=-cost,
        reason=description or f"charge:{task_name}",
    ))
    db.commit()
    db.refresh(locked_user)
    logger.info(f'Charged user {user.id} {cost} credits for {task_name}. New balance: {locked_user.credits}')

    def rollback() -> None:
        locked_user.credits += cost
        db.add(CreditTransaction(
            user_id=user.id,
            delta=cost,
            reason=f"refund:{task_name}",
        ))
        db.commit()
        logger.info(f'Refunded user {user.id} {cost} credits for failed {task_name}')

    return True, rollback

def charge(user: Any, task_name: str, db: Session, cost_override: Optional[int] = None, reason: str = "", idempotency_key: Optional[str] = None) -> bool:
    """Deduct credits atomically using database row locking."""
    user_id = user.id if hasattr(user, 'id') else user
    cost = cost_override if cost_override is not None else TASK_COSTS.get(task_name, 1)
    if cost <= 0:
        return True
    
    locked_user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if getattr(locked_user, "plan", "") == "elite":
        return True
    if not locked_user or locked_user.credits < cost:
        db.rollback()
        logger.warning(f'User {user_id} has insufficient credits ({getattr(locked_user, "credits", 0) if locked_user else 0}) for {task_name} (cost {cost})')
        return False
    
    locked_user.credits -= cost
    db.commit()
    db.refresh(locked_user)
    logger.info(f'Charged user {user_id} {cost} credits for {task_name}. New balance: {locked_user.credits}')
    return True

charge_user = charge

def refund(user: Any, task_name: str, db: Session) -> None:
    """Refund credits if an upstream workflow fails after deduction."""
    user_id = user.id if hasattr(user, 'id') else user
    cost = TASK_COSTS.get(task_name, 1)
    locked_user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if locked_user:
        locked_user.credits += cost
        db.commit()
        logger.info(f'Refunded user {user_id} {cost} credits for failed {task_name}')

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

def top_up(db_or_user_id: Any, user_or_amount: Any, amount_or_reason: Any = "topup", reason: str = "topup") -> None:
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
        locked_user = db.query(User).filter(User.id == user.id).with_for_update().first()
        if locked_user:
            locked_user.credits += amount
            db.commit()
            logger.info('Topped up user %s +%s credits (%s)', user.id, amount, reason)

def record_data_submission(db: Session, user: User, payload: dict) -> dict:
    submission = DataSubmission(user_id=user.id, payload=payload, discount_earned=1.0)
    db.add(submission)
    user.discount_balance = 1.0
    db.commit()
    logger.info('Recorded data submission for user %s (discount 1.0%%)', user.id)
    return {"discount_balance": 1.0, "next_purchase_discount": 1.0}

def deduct_credits_atomic(user_id: str, amount: int, description: str, db: Session, idempotency_key: str = None) -> bool:
    return charge(user_id, "assignment_solve", db, cost_override=amount, reason=description, idempotency_key=idempotency_key)

def get_user_credits(db: Session, user_id: str) -> int:
    user = db.query(User).filter(User.id == user_id).first()
    return user.credits if user else 0

def add_credits_to_user(db: Session, user_id: str, amount: int, description: str = "Credit addition") -> bool:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    user.credits += amount
    db.commit()
    return True
