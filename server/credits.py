"""Credit ledger with token-based pricing: 1 credit = 10,000 tokens.

Plans:
- Basic: $10/mo, 300 credits (3M tokens, ~300 assignments)
- Pro: $20/mo, 600 credits (6M tokens, ~600 assignments) - Best Value
- Elite: $40/mo, 1500 credits (15M tokens, ~1500 assignments) - Power User

Cost model: 1 credit = 10,000 tokens.
Profit margin: ~70% on Basic, ~75% on Pro, ~65% on Elite.
"""
from __future__ import annotations

from sqlalchemy.orm import Session
from .database import CreditTransaction, User

TIER_PRICE_CENTS = {"basic": 1000, "pro": 2000, "elite": 4000}
TIER_MONTHLY_CREDITS = {"basic": 300, "pro": 600, "elite": 1500}
TIER_OVERAGE_PER_CREDIT_CENTS = {"basic": 10, "pro": 8, "elite": 5}

TOKENS_PER_CREDIT = 10000

BASE_TASK_COSTS = {
    "transcription_per_hour": 1.0,
    "study_guide": 0.8,
    "flashcards": 0.6,
    "practice_test": 0.8,
    "summary": 0.4,
    "agent_session": 2.0,
    "draft_generation": 3.0,
    "draft_retry": 2.0,
    "voice_cloning": 5.0,
    "grade_trajectory": 1.5,
    "assignment_processing": 0.5,
    "humanization": 2.0,
    "detection_bypass": 1.5,
}

MAX_DISCOUNT_PCT = 20.0
DISCOUNT_PER_SUBMISSION_PCT = 1.0


def calculate_actual_cost(
    task_type: str,
    tokens_used: int = 0,
    compute_time_seconds: float = 0,
    retries: int = 0,
    complexity: float = 1.0
) -> float:
    token_cost = tokens_used / TOKENS_PER_CREDIT
    base_cost = BASE_TASK_COSTS.get(task_type, 0.5)
    time_cost = compute_time_seconds * 0.01
    retry_penalty = 1.0 + (retries * 0.15)
    total = (base_cost + token_cost + time_cost) * complexity * retry_penalty
    return max(total, 0.05)


def charge_user(
    db: Session,
    user: User,
    task_type: str,
    tokens_used: int = 0,
    compute_time_seconds: float = 0,
    retries: int = 0,
    complexity: float = 1.0
) -> tuple[bool, float]:
    cost = calculate_actual_cost(task_type, tokens_used, compute_time_seconds, retries, complexity)
    if user.credits < cost:
        return False, cost
    user.credits -= cost
    tx = CreditTransaction(
        user_id=user.id,
        delta=-cost,
        reason=f"{task_type} ({tokens_used} tokens, {cost:.2f} credits)"
    )
    db.add(tx)
    db.commit()
    return True, cost


def top_up(db: Session, user: User, amount: float, reason: str = "topup") -> None:
    """Credit a user's balance (refunds, purchases, admin grants)."""
    user.credits += amount
    tx = CreditTransaction(user_id=user.id, delta=amount, reason=reason)
    db.add(tx)
    db.commit()


def add_discount(user: User, db: Session) -> None:
    if user.discount_balance is None:
        user.discount_balance = 0.0
    user.discount_balance += DISCOUNT_PER_SUBMISSION_PCT
    db.commit()


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


def get_credit_summary(user: User) -> dict:
    return {
        "credits": user.credits,
        "plan": user.plan,
        "is_unlimited": False,
        "discount_balance": user.discount_balance or 0.0,
        "discount_spillover": user.discount_spillover or 0.0,
        "tier_credits": TIER_MONTHLY_CREDITS.get(user.plan, 0),
        "tier_price_cents": TIER_PRICE_CENTS.get(user.plan, 0),
        "tokens_per_credit": TOKENS_PER_CREDIT,
    }


def get_balance(user: User) -> dict:
    return get_credit_summary(user)
