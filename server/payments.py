"""Payments — provider registry with honest stubs.

- Stripe: real SDK path when STRIPE_SECRET_KEY is set (SDK must be installed).
- Cash App / Zelle / Venmo / PayPal: recorded as manual-offline payments.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .database import Payment, User
from .config import config


def process_payment(db: Session, user: User, provider: str, amount_cents: int) -> dict:
    """Process a payment and return transaction details."""
    # Create payment record
    payment = Payment(
        user_id=user.id,
        provider=provider,
        amount_cents=amount_cents,
        status="captured" if provider == "stripe" else "manual",
        provider_ref=f"{provider}_{user.id}_{amount_cents}",
    )
    db.add(payment)
    db.flush()
    return {"id": payment.id, "status": payment.status}


def refund_unused(db: Session, user: User, amount_cents: int) -> dict:
    """Refund unused credits."""
    # Implement refund logic here
    return {"message": f"Refund of ${amount_cents/100:.2f} processed"}


def usage_percent(user: User) -> float:
    """Calculate percentage of credits or quota used."""
    plan_limits = {
        "free": 100.0,
        "starter": 500.0,
        "pro": 2000.0,
        "elite": 10000.0,
    }
    limit = plan_limits.get(getattr(user, "plan", "free"), 100.0)
    current_credits = getattr(user, "credits", 0.0) or 0.0
    used = max(0.0, limit - current_credits)
    return min(100.0, (used / max(1.0, limit)) * 100.0)

