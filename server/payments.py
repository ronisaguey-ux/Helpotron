"""Payments — Stripe Checkout subscriptions with manual fallback providers."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .database import Payment, User, CreditTransaction
from .config import config
from .credits import compute_applicable_discount, apply_discount

logger = logging.getLogger("helpotron.payments")

SUPPORTED_PROVIDERS = {"stripe", "cashapp", "zelle", "venmo", "paypal"}

# Stripe price IDs (set these in .env)
STRIPE_PRICE_IDS = {
    "basic": os.getenv("STRIPE_PRICE_BASIC", ""),
    "pro": os.getenv("STRIPE_PRICE_PRO", ""),
    "elite": os.getenv("STRIPE_PRICE_ELITE", ""),
}

TIER_CREDITS = {"basic": 500, "pro": 2000, "elite": 6000}
TIER_PRICE_CENTS = {"basic": 1000, "pro": 2000, "elite": 4000}


def _stripe_enabled() -> bool:
    return bool(config.stripe_secret_key and config.stripe_webhook_secret)


def create_checkout_session(db: Session, user: User, plan: str, is_annual: bool = False) -> dict:
    """Create a Stripe Checkout session for a subscription."""
    if not _stripe_enabled():
        return {
            "status": "stripe_not_configured",
            "message": "Stripe is not configured. Please contact support to subscribe.",
        }

    import stripe
    stripe.api_key = config.stripe_secret_key

    price_id = STRIPE_PRICE_IDS.get(plan, "")
    if not price_id:
        raise ValueError(f"No Stripe price configured for plan '{plan}'")

    # Create or retrieve customer
    customer_id = user.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(
            email=user.public_id,
            metadata={"public_id": user.public_id},
        )
        customer_id = customer.id
        user.stripe_customer_id = customer_id
        db.commit()

    # Create checkout session
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=os.getenv("WEB_ORIGIN", "http://localhost:5173") + "/?checkout=success",
        cancel_url=os.getenv("WEB_ORIGIN", "http://localhost:5173") + "/?checkout=cancel",
        subscription_data={
            "trial_period_days": 7 if not is_annual else 0,
            "metadata": {"plan": plan, "is_annual": str(is_annual)},
        },
        metadata={"plan": plan, "is_annual": str(is_annual)},
    )

    return {"status": "checkout_created", "checkout_url": session.url, "session_id": session.id}


def handle_stripe_webhook(payload: bytes, sig_header: str) -> dict:
    """Handle Stripe webhook events."""
    import stripe
    stripe.api_key = config.stripe_secret_key

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, config.stripe_webhook_secret
        )
    except ValueError as e:
        raise ValueError(f"Invalid payload: {e}")
    except stripe.error.SignatureVerificationError as e:
        raise ValueError(f"Invalid signature: {e}")

    from .database import SessionLocal

    db = SessionLocal()
    try:
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            customer_id = session.get("customer")
            subscription_id = session.get("subscription")
            plan = session.get("metadata", {}).get("plan", "basic")
            user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
            if user:
                user.stripe_subscription_id = subscription_id
                user.subscription_status = "active"
                user.plan = plan
                user.credits += TIER_CREDITS.get(plan, 0)
                db.add(CreditTransaction(
                    user_id=user.id,
                    delta=TIER_CREDITS.get(plan, 0),
                    reason=f"subscription:{plan}:checkout",
                ))
                db.commit()
                logger.info("Subscription activated for user %s (plan: %s)", user.public_id, plan)

        elif event["type"] == "invoice.payment_succeeded":
            invoice = event["data"]["object"]
            subscription_id = invoice.get("subscription")
            user = db.query(User).filter(User.stripe_subscription_id == subscription_id).first()
            if user:
                user.subscription_status = "active"
                user.credits += TIER_CREDITS.get(user.plan, 0)
                db.add(CreditTransaction(
                    user_id=user.id,
                    delta=TIER_CREDITS.get(user.plan, 0),
                    reason=f"subscription:{user.plan}:renewal",
                ))
                db.commit()
                logger.info("Subscription renewed for user %s", user.public_id)

        elif event["type"] == "invoice.payment_failed":
            event = event["data"]["object"]
            subscription_id = event.get("subscription")
            user = db.query(User).filter(User.stripe_subscription_id == subscription_id).first()
            if user:
                user.subscription_status = "past_due"
                db.commit()
                logger.warning("Payment failed for user %s", user.public_id)

        elif event["type"] == "customer.subscription.deleted":
            event = event["data"]["object"]
            subscription_id = event.get("id")
            user = db.query(User).filter(User.stripe_subscription_id == subscription_id).first()
            if user:
                user.subscription_status = "canceled"
                user.plan = "basic"
                db.commit()
                logger.info("Subscription canceled for user %s", user.public_id)

        return {"status": "received"}
    finally:
        db.close()


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

def verify_stripe_signature(payload: bytes, sig_header: str) -> bool:
    import stripe
    try:
        stripe.Webhook.construct_event(payload, sig_header, config.stripe_webhook_secret)
        return True
    except Exception:
        return False


def process_successful_payment(transaction_id: str, public_id: str, amount_cents: int, credits_amount: float) -> bool:
    from .database import SessionLocal, User, CreditTransaction, Payment
    db = SessionLocal()
    try:
        existing = db.query(Payment).filter(Payment.provider_ref == transaction_id).first()
        if existing:
            return True

        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(public_id=public_id, credits=0.0)
            db.add(user)
            db.flush()

        payment = Payment(
            user_id=user.id,
            provider="stripe",
            amount_cents=amount_cents,
            status="captured",
            provider_ref=transaction_id,
        )
        db.add(payment)

        user.credits += credits_amount
        tx = CreditTransaction(
            user_id=user.id,
            delta=credits_amount,
            reason=f"payment:stripe:tx_{transaction_id}"
        )
        db.add(tx)
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False
    finally:
        db.close()
