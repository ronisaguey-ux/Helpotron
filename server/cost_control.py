"""Per-user token budget controller (remediation BATCH-06).

Plan section: `check_user_daily_budget` — enforces a user's daily API
spend ceiling against the ApiUsageLog ledger so one session cannot burn
through the monthly budget in a day.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .database import ApiUsageLog, User

logger = logging.getLogger("helpotron.cost_control")

# Default daily cap when the user has no monthly budget configured.
DEFAULT_MONTHLY_BUDGET_USD = 50.0
DAYS_PER_MONTH = 30.0
# Hard ceiling regardless of budget config (protects the platform).
ABSOLUTE_DAILY_CAP_USD = 25.0


def daily_limit_usd(user: User) -> float:
    """Derive a user's daily spend ceiling from their monthly budget."""
    monthly = float(getattr(user, "monthly_budget_usd", None) or DEFAULT_MONTHLY_BUDGET_USD)
    daily = min(monthly / DAYS_PER_MONTH, ABSOLUTE_DAILY_CAP_USD)
    return round(daily, 4)


def todays_spend(user: User, db: Session) -> float:
    """Sum charged API costs for this user since UTC midnight."""
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    # ApiUsageLog.created_at is stored naive-UTC (utcnow default).
    start_naive = start.replace(tzinfo=None)
    total = (
        db.query(func.coalesce(func.sum(ApiUsageLog.charged_cost_usd), 0.0))
        .filter(ApiUsageLog.user_id == user.id, ApiUsageLog.created_at >= start_naive)
        .scalar()
    )
    return round(float(total), 8)


def check_user_daily_budget(
    user: User,
    db: Session,
    projected_cost_usd: float = 0.0,
) -> Dict[str, Any]:
    """Check whether this user is within their daily spend budget.

    Args:
        user: the authenticated User row.
        db: open DB session.
        projected_cost_usd: cost of the request about to be made; the check
            fails if spend + projected would exceed the daily ceiling.

    Returns:
        {
            "allowed": bool,
            "spend_today_usd": float,
            "daily_limit_usd": float,
            "remaining_usd": float,
            "detail": str,   # human-readable reason
        }
    """
    spend = todays_spend(user, db)
    limit = daily_limit_usd(user)
    remaining = round(limit - spend - max(projected_cost_usd, 0.0), 8)
    allowed = remaining >= 0
    detail = (
        f"Daily budget ok ({spend:.4f}/{limit:.4f} USD used)"
        if allowed
        else f"Daily budget exhausted ({spend:.4f}/{limit:.4f} USD used; projected {projected_cost_usd:.4f} would exceed)"
    )
    if not allowed:
        logger.warning(
            "user=%s daily budget exhausted: spend=%s limit=%s projected=%s",
            user.id, spend, limit, projected_cost_usd,
        )
    return {
        "allowed": allowed,
        "spend_today_usd": spend,
        "daily_limit_usd": limit,
        "remaining_usd": remaining,
        "detail": detail,
    }


def enforce_user_daily_budget(
    user: User,
    db: Session,
    projected_cost_usd: float = 0.0,
) -> Dict[str, Any]:
    """Like check_user_daily_budget but raises when over budget.

    Raises:
        BudgetExceededError: if spend + projected exceeds the daily ceiling.
    """
    result = check_user_daily_budget(user, db, projected_cost_usd=projected_cost_usd)
    if not result["allowed"]:
        raise BudgetExceededError(result["detail"])
    return result


class BudgetExceededError(Exception):
    """Raised when a user's daily API budget would be exceeded."""
