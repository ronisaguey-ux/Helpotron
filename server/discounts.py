"""Discount system — 1% per data submission, 20% cap, spillover.

Phase 6 of the Helpotron spec.

Each completed data submission (grade, teacher note, feedback, assignment details,
writing sample) earns the user 1% off their next purchase. Max 20% applied to
a single purchase. Extra discount above the cap rolls over to the next purchase.

The ledger is stored in the User model (discount_balance_pct and
discount_spillover_pct) — both are floats.

"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from .database import User

MAX_DISCOUNT_PCT = 20.0
DISCOUNT_PER_SUBMISSION_PCT = 1.0


def add_submission_discount(user: User, db: Session) -> None:
    """Add 1% to the user's discount balance (total earned discount)."""
    if user.discount_balance_pct is None:
        user.discount_balance_pct = 0.0
    user.discount_balance_pct += DISCOUNT_PER_SUBMISSION_PCT
    db.commit()


def compute_applicable_discount(user: User) -> float:
    """
    Compute the discount percentage that can be applied to the next purchase.
    This is the min(user's total earned discount, MAX_DISCOUNT_PCT) plus any
    spillover from previous purchases.
    """
    balance = user.discount_balance_pct or 0.0
    spillover = user.discount_spillover_pct or 0.0
    total_available = balance + spillover
    return min(total_available, MAX_DISCOUNT_PCT)


def apply_discount(user: User, db: Session) -> float:
    """
    Apply the max possible discount to this purchase, update the ledger,
    and return the applied discount percentage.
    """
    applied = compute_applicable_discount(user)
    if applied == 0.0:
        return 0.0

    # Deduct from balance first, then spillover
    balance = user.discount_balance_pct or 0.0
    spillover = user.discount_spillover_pct or 0.0

    remaining = applied
    if balance >= remaining:
        user.discount_balance_pct = balance - remaining
        remaining = 0.0
    else:
        user.discount_balance_pct = 0.0
        remaining -= balance

    if remaining > 0 and spillover >= remaining:
        user.discount_spillover_pct = spillover - remaining
        remaining = 0.0
    elif remaining > 0:
        user.discount_spillover_pct = 0.0

    db.commit()
    return applied


def process_discount_spillover(user: User, db: Session, applied: float) -> None:
    """
    After a purchase, any discount that could not be applied (because the
    purchase amount was smaller than the discount) is rolled over as spillover
    for the next purchase.

    This is called after the purchase is finalized, with `applied` being the
    actual discount used. The difference between the max available and the
    applied amount is stored as spillover.
    """
    max_available = compute_applicable_discount(user)
    if max_available > applied:
        spillover = max_available - applied
        if user.discount_spillover_pct is None:
            user.discount_spillover_pct = 0.0
        user.discount_spillover_pct += spillover
        db.commit()


def reset_discounts(user: User, db: Session) -> None:
    """Reset the user's discount balance and spillover (for testing or admin)."""
    user.discount_balance_pct = 0.0
    user.discount_spillover_pct = 0.0
    db.commit()


def get_discount_summary(user: User) -> dict:
    """Return a human-readable summary of the user's discount status."""
    balance = user.discount_balance_pct or 0.0
    spillover = user.discount_spillover_pct or 0.0
    total_available = balance + spillover
    return {
        "balance_pct": balance,
        "spillover_pct": spillover,
        "total_available_pct": total_available,
        "max_per_purchase_pct": MAX_DISCOUNT_PCT,
        "submission_value_pct": DISCOUNT_PER_SUBMISSION_PCT,
    }
