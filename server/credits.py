"""Credit ledger — tier pricing, charges, top-ups, discount program, and dynamic compute-based costing.

Tiers (spec): Basic $10/15 credits ($1 overage), Pro $20/40 ($0.75),
Elite $30/unlimited. Elite is flagged unlimited; the ledger still records
spends for transparency but never blocks.

Dynamic costing: each task cost is calculated based on actual compute usage:
- LLM token usage (input + output)
- Processing time
- Number of retries
- Complexity of the task
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .database import CreditTransaction, User

TIER_PRICE_CENTS = {"basic": 1000, "pro": 2000, "elite": 3000}
TIER_MONTHLY_CREDITS = {"basic": 15, "pro": 40, "elite": float("inf")}
TIER_OVERAGE_PER_CREDIT_CENTS = {"basic": 100, "pro": 75, "elite": 0}

# Base costs per operation (in credits, can be scaled by compute)
BASE_TASK_COSTS = {
    "transcription_per_hour": 1.0,
    "study_guide": 0.5,
    "flashcards": 0.5,
    "practice_test": 0.5,
    "summary": 0.5,
    "agent_session": 1.0,
    "draft_generation": 2.0,  # More expensive due to multiple LLM calls + detectors
    "draft_retry": 1.5,
    "voice_cloning": 3.0,  # Requires multiple samples analysis
    "grade_trajectory": 1.0,
    "assignment_processing": 0.5,
}

# Compute scaling factors
LLM_TOKEN_COST = 0.000001  # per token in credits (1 credit = $0.10 roughly)
COMPUTE_TIME_COST = 0.1  # per second in credits

MAX_DISCOUNT_PCT = 20.0
DISCOUNT_PER_SUBMISSION_PCT = 1.0


def calculate_actual_cost(
    task_type: str,
    tokens_used: int = 0,
    compute_time_seconds: float = 0,
    retries: int = 0,
    complexity: float = 1.0
) -> float:
    """Calculate the actual credit cost for a task based on compute usage.

    Args:
        task_type: The type of task being performed
        tokens_used: Number of LLM tokens consumed
        compute_time_seconds: CPU time spent processing
        retries: Number of retry attempts
        complexity: Complexity multiplier (1.0 = normal)

    Returns:
        The credit cost (float)
    """
    base_cost = BASE_TASK_COSTS.get(task_type, 0.5)

    # Token cost: 1 credit per 1M tokens
    token_cost = tokens_used * LLM_TOKEN_COST

    # Compute time cost
    time_cost = compute_time_seconds * COMPUTE_TIME_COST

    # Retry penalty
    retry_penalty = 1.0 + (retries * 0.1)

    # Calculate total
    total = (base_cost + token_cost + time_cost) * complexity * retry_penalty

    # Minimum cost floor
    return max(total, 0.1)


def _is_unlimited(user: User) -> bool:
    return user.plan == "elite"


def charge_user(
    db: Session,
    user: User,
    task_type: str,
    tokens_used: int = 0,
    compute_time_seconds: float = 0,
    retries: int = 0,
    complexity: float = 1.0
) -> tuple[bool, float]:
    """Charge a user for a task using dynamic costing.

    Returns:
        (success, cost) — cost is 0 if elite/unlimited
    """
    if _is_unlimited(user):
        # Still record for transparency but don't charge
        cost = calculate_actual_cost(task_type, tokens_used, compute_time_seconds, retries, complexity)
        tx = CreditTransaction(
            user_id=user.id,
            delta=-cost,
            reason=f"{task_type} (unlimited)"
        )
        db.add(tx)
        db.commit()
        return True, cost

    cost = calculate_actual_cost(task_type, tokens_used, compute_time_seconds, retries, complexity)

    if user.credits < cost:
        return False, cost

    user.credits -= cost
    tx = CreditTransaction(
        user_id=user.id,
        delta=-cost,
        reason=task_type
    )
    db.add(tx)
    db.commit()
    return True, cost


def add_discount(user: User, db: Session) -> None:
    """Add 1% discount to user's balance."""
    if user.discount_balance is None:
        user.discount_balance = 0.0
    user.discount_balance += DISCOUNT_PER_SUBMISSION_PCT
    db.commit()


def compute_applicable_discount(user: User) -> float:
    """Compute the discount percentage that can be applied to the next purchase."""
    balance = user.discount_balance or 0.0
    spillover = user.discount_spillover or 0.0
    total_available = balance + spillover
    return min(total_available, MAX_DISCOUNT_PCT)


def apply_discount(user: User, db: Session) -> float:
    """Apply the max possible discount to this purchase and update the ledger."""
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
    """Return a human-readable summary of the user's credit status."""
    return {
        "credits": user.credits,
        "plan": user.plan,
        "is_unlimited": _is_unlimited(user),
        "discount_balance": user.discount_balance or 0.0,
        "discount_spillover": user.discount_spillover or 0.0,
        "tier_credits": TIER_MONTHLY_CREDITS.get(user.plan, 0),
        "tier_price_cents": TIER_PRICE_CENTS.get(user.plan, 0),
    }
