"""Payments — provider registry with honest stubs.

- Stripe: real SDK path when STRIPE_SECRET_KEY is set (SDK must be installed).
- Cash App / Zelle / Venmo / PayPal: recorded as manual-offline payments
  (status="manual") — the payment record and credit grant are real, the
  settlement happens outside the system until those APIs are configured.
- Refund policy: pro-rata 50% of unused credit value (user-published policy).
  No dark patterns, no punitive re-pricing.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from .config import config
from .credits import apply_data_discount, charge, get_balance, top_up
from .database import Payment, User

logger = logging.getLogger(__name__)

MANUAL_PROVIDERS = {"cashapp", "zelle", "venmo", "paypal"}
STRIPE_CENTS_PER_CREDIT = 100  # $1/credit pay-as-you-go


def _credits_for(amount_cents: int) -> float:
    return amount_cents / STRIPE_CENTS_PER_CREDIT


async def process_payment(
    db: Session,
    user: User,
    provider: str,
    amount_cents: int,
) -> Payment:
    if amount_cents <= 0:
        raise ValueError("amount must be positive")
    if provider not in MANUAL_PROVIDERS and provider != "stripe":
        raise ValueError(f"unknown provider: {provider}")

    discount_pct = apply_data_discount(db, user)  # 1%/submission, max 20%, carries over
    net_cents = max(0, amount_cents - round(amount_cents * discount_pct / 100))
    credits = _credits_for(net_cents)

    payment = Payment(user_id=user.id, provider=provider, amount_cents=amount_cents, status="pending")

    if provider == "stripe":
        payment.status = await _stripe_capture(payment, net_cents)
    else:
        payment.status = "manual"  # offline settlement; credits granted on record

    if payment.status in ("captured", "manual"):
        top_up(db, user, credits, reason=f"purchase:{provider}")
    db.add(payment)
    db.flush()
    logger.info("payment %s (%d cents via %s) -> %s, +%.1f credits", user.public_id, amount_cents, provider, payment.status, credits)
    return payment


async def _stripe_capture(payment: Payment, net_cents: int) -> str:
    if not config.stripe_secret_key:
        logger.warning("stripe selected but STRIPE_SECRET_KEY unset; recording manual")
        return "manual"
    try:
        import stripe  # type: ignore
    except ImportError:
        logger.warning("stripe SDK not installed; recording manual")
        return "manual"
    stripe.api_key = config.stripe_secret_key
    intent = stripe.PaymentIntent.create(amount=net_cents, currency="usd")
    payment.provider_ref = intent.id
    return "pending"  # captured via webhook in production


def refund_unused(db: Session, payment: Payment, unused_fraction: float) -> float:
    """Refund policy: 50% refund for unused time. Refunds half of the credit
    value corresponding to the unused fraction."""
    if payment.status == "refunded":
        return 0.0
    unused_fraction = max(0.0, min(unused_fraction, 1.0))
    credits_to_refund = (_credits_for(payment.amount_cents) * 0.5) * unused_fraction
    if credits_to_refund > 0:
        top_up(db, payment.user, credits_to_refund, reason=f"refund:{payment.id}")
    payment.status = "refunded"
    return credits_to_refund


def usage_percent(user: User) -> float:
    """% of monthly credits used this billing period (elite -> 0)."""
    if user.plan == "elite":
        return 0.0
    from .credits import TIER_MONTHLY_CREDITS

    monthly = TIER_MONTHLY_CREDITS[user.plan]
    used = monthly - max(0.0, get_balance(user))
    return max(0.0, min(used / monthly * 100, 100.0))
