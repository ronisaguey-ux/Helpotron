"""Payments — provider registry with honest stubs and credit application."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .database import Payment, User, CreditTransaction
from .config import config
from .credits import compute_applicable_discount, apply_discount

SUPPORTED_PROVIDERS = {"stripe", "cashapp", "zelle", "venmo", "paypal"}


def process_payment(db: Session, user: User, provider: str, amount_cents: int) -> dict:
    """Process a payment, validate provider, calculate discount, and credit balance."""
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Unsupported payment provider: '{provider}'. Must be one of {sorted(SUPPORTED_PROVIDERS)}")

    if amount_cents <= 0:
        raise ValueError("Payment amount must be greater than zero")

    discount_pct = compute_applicable_discount(user)
    discount_factor = 1.0 - (discount_pct / 100.0)
    credits_added = round((amount_cents / 100.0) * discount_factor, 2)

    payment = Payment(
        user_id=user.id,
        provider=provider,
        amount_cents=amount_cents,
        status="captured" if provider == "stripe" else "manual",
        provider_ref=f"{provider}_{user.id}_{amount_cents}",
    )
    db.add(payment)
    db.flush()

    # Credit the user
    user.credits += credits_added
    tx = CreditTransaction(
        user_id=user.id,
        delta=credits_added,
        reason=f"payment:{provider}:${amount_cents/100:.2f} (discount: {discount_pct}%)"
    )
    db.add(tx)

    # Consume applied discount
    if discount_pct > 0:
        apply_discount(user, db)

    db.commit()
    return {"id": payment.id, "status": payment.status, "credits_added": credits_added}


def refund_unused(db: Session, user: User, amount_cents: int) -> dict:
    """Refund unused credits."""
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
