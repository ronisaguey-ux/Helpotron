"""Payments — Stripe Checkout subscriptions with manual fallback providers."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from fastapi import HTTPException

from .database import Payment, User, CreditTransaction
from .config import config
from .credits import compute_applicable_discount, apply_discount, TIER_MONTHLY_TASK_TOKENS

logger = logging.getLogger("helpotron.payments")

SUPPORTED_PROVIDERS = {"stripe", "cashapp", "zelle", "venmo", "paypal"}

STRIPE_PRICE_IDS = {
    "basic": os.getenv("STRIPE_PRICE_BASIC", ""),
    "pro": os.getenv("STRIPE_PRICE_PRO", ""),
    "elite": os.getenv("STRIPE_PRICE_ELITE", ""),
}

# Monthly TASK TOKEN allowances. Tokens are the usage currency; the legacy
# name is kept as an alias so existing importers keep working.
#
# Owner 2026-09-17: "have the 10/mo be 30k tokens, 20/mo be 100k tokens, and
# 40/mo be 270k tokens ... cuz a lot of tasks are under a cent". Paired with the
# rate change to 100 tokens = 1 cent, these are the SAME plan economics as the
# old 300/1000/2700 at 1 token = 1 cent, just expressed in the finer unit:
#   $10 -> 30,000 tokens = $3.00 of service (3.33x markup, 70% margin)
#   $20 -> 100,000       = $10.00                 (2.0x,  50%)
#   $40 -> 270,000       = $27.00                 (1.48x, 32.5%)
#
# This is a RE-EXPORT of credits.TIER_MONTHLY_TASK_TOKENS, not a second copy.
# It was a literal here too until 2026-09-18, when adding the 'testing' tier to
# only this file made the catalogue report that tier's allowance as the caller's
# default instead of 15,000 — the exact drift plans.py was written to end. The
# table lives in credits because payments already imports that module, so this
# direction introduces no import cycle; the reverse fails to resolve.
TIER_TOKENS = TIER_MONTHLY_TASK_TOKENS
TIER_CREDITS = TIER_TOKENS  # legacy alias — these values were never credits
# Owner 09-06: Basic $10 · Pro $20 · Elite $40 (the original 08-29 audit values)
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

    customer_id = user.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(
            email=user.public_id,
            metadata={"public_id": user.public_id},
        )
        customer_id = customer.id
        user.stripe_customer_id = customer_id
        db.commit()

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


def create_trial_verification(db: Session, user: User) -> dict:
    """Owner 09-06: the Free Trial requires a 1-cent payment verification.

    Stripe online via a 1-cent Checkout Session when keys are configured;
    otherwise a manual pending record the operator confirms with
    /api/admin/user/{public_id}/verify-trial-payment. Returns the mode so the
    client can render the right step. Never grants credits (the verification
    cent is a gateway check, not a top-up)."""
    from .database import Payment
    if not _stripe_enabled():
        payment = Payment(
            user_id=user.id,
            provider="cashapp",
            amount_cents=1,
            status="pending",
            provider_ref=f"trial_verification_{user.id}",  # unique marker for the admin approval lane
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
        return {
            "mode": "manual",
            "payment_id": payment.id,
            "payment_status": payment.status,
            "verify_cents": 1,
        }
    import stripe
    stripe.api_key = config.stripe_secret_key
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": 1,
                "product_data": {"name": "Helpotron Free Trial verification"},
            },
            "quantity": 1,
        }],
        metadata={"public_id": user.public_id, "type": "trial_verification"},
        success_url=os.getenv("WEB_ORIGIN", "http://localhost:5173") + "/?trial=verification:success",
        cancel_url=os.getenv("WEB_ORIGIN", "http://localhost:5173") + "/?trial=verification:cancel",
    )
    return {
        "mode": "stripe",
        "verification_url": session.url,
        "payment_status": "pending",
        "verify_cents": 1,
    }


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

    from .database import SessionLocal, StripeEvent

    db = SessionLocal()
    try:
        # Idempotency (2026-09-18). Stripe retries a webhook until it gets a 2xx
        # and can deliver the same event more than once, but every branch below
        # granted the plan allowance unconditionally — so one retry handed out the
        # full 30k/100k/270k again. The UNIQUE constraint on `event_id` makes this
        # insert the guard: whoever wins the insert processes the event, and a
        # duplicate raises IntegrityError and is acknowledged without re-granting.
        event_id = event.get("id") or ""
        if event_id:
            try:
                db.add(StripeEvent(event_id=event_id, event_type=event.get("type") or ""))
                db.commit()
            except Exception:  # noqa: BLE001 — already processed (or a duplicate delivery)
                db.rollback()
                logger.info("Stripe event %s already processed — ignoring retry", event_id)
                return {"status": "ok", "duplicate": True}

        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            # Owner 09-06: 1-cent trial verification checkout (mode=payment).
            if session.get("metadata", {}).get("type") == "trial_verification":
                pid = session.get("metadata", {}).get("public_id", "")
                t_user = db.query(User).filter(User.public_id == pid).first() if pid else None
                if t_user is not None:
                    t_user.payment_verified = True
                    db.commit()
                    logger.info("Trial payment verified for %s", t_user.public_id)
                return {"status": "ok", "trial_verification": bool(t_user)}
            customer_id = session.get("customer")
            subscription_id = session.get("subscription")
            plan = session.get("metadata", {}).get("plan", "basic")
            user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
            if user:
                user.stripe_subscription_id = subscription_id
                user.subscription_status = "active"
                user.plan = plan
                # A subscription buys TASK TOKENS (the usage allowance). It must
                # NOT touch credits: credits are an earn-only discount currency
                # funded by data-lake entries and referral codes, and handing
                # them out with a plan was both wrong and the reason a paying
                # subscriber could find `token_balance` still at 0.
                _grant = TIER_TOKENS.get(plan, 0)
                if _grant:
                    from .credits import add_tokens as _add_tokens
                    _add_tokens(db, user, _grant, reason=f"subscription:{plan}:checkout")
                # Operator 08-31 (Bob): the referral reward is paid when the
                # referee BUYS the plan — 2 credits (basic) / 5 (pro) /
                # 10 (elite) to the code generator, once, idempotently.
                try:
                    from .database import Referral
                    from .referral import grant_referrer_plan_reward
                    ref_row = db.query(Referral).filter(
                        Referral.referee_id == user.id, Referral.completed_at.isnot(None)
                    ).first()
                    if ref_row is not None:
                        ref_referrer = db.query(User).filter(User.id == ref_row.referrer_id).first()
                        if ref_referrer is not None:
                            grant_referrer_plan_reward(db, ref_referrer, plan, ref_row.referral_code)
                except Exception:  # noqa: BLE001 — never block a live subscription activation
                    logger.exception("Referral plan reward failed for %s", user.public_id)
                db.commit()
                logger.info("Subscription activated for user %s (plan: %s)", user.public_id, plan)

        elif event["type"] == "invoice.payment_succeeded":
            invoice = event["data"]["object"]
            subscription_id = invoice.get("subscription")
            user = db.query(User).filter(User.stripe_subscription_id == subscription_id).first()
            if user:
                user.subscription_status = "active"
                _renew = TIER_TOKENS.get(user.plan, 0)
                if _renew:
                    from .credits import add_tokens as _add_tokens
                    _add_tokens(db, user, _renew, reason=f"subscription:{user.plan}:renewal")
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
    """Process a payment, validate provider, calculate discount, and credit balance.

    Operator 08-31: a referral redemption grants a one-time order discount
    (30% new user / 15% existing user, stored in user.referral_discount_pct).
    The order CHARGE is reduced by that amount while the full credit value is
    delivered — 30% off the order, not 30% fewer credits. The entitlement is
    consumed by this order.
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Unsupported payment provider: '{provider}'. Must be one of {sorted(SUPPORTED_PROVIDERS)}")

    if amount_cents <= 0:
        raise ValueError("Payment amount must be greater than zero")

    referral_pct = float(getattr(user, "referral_discount_pct", 0.0) or 0.0)

    # Earned credits are a PERCENT DISCOUNT on an order — they are not a currency
    # you can buy and not a balance you top up. A payment buys TASK TOKENS; the
    # discount only reduces what the order costs.
    discount_pct = compute_applicable_discount(user)
    # Tokens are granted on the NOMINAL value of the order: a discount reduces
    # the CHARGE, not the value delivered ("30% off the order, not 30% fewer
    # credits" — the documented operator ruling). $1 = 1 task token.
    tokens_added = max(1, int(round(amount_cents / 100.0))) if amount_cents > 0 else 0

    # Both discounts reduce the CHARGE: the one-time referral entitlement, and
    # the earned credit balance (spent as a percent off). Tokens are still
    # granted on the nominal order value, so a discount never shrinks what the
    # user receives — it only lowers the bill.
    effective_pct = referral_pct + discount_pct
    charged_cents = (
        max(1, round(amount_cents * (1.0 - effective_pct / 100.0)))
        if effective_pct > 0 else amount_cents
    )

    # SEC-2026-001: a Payment row created here is ALWAYS pending. This
    # previously read `status = "captured" if provider == "stripe" else "pending"`,
    # so merely naming "stripe" as the provider produced an already-settled
    # payment and the block below granted tokens — with no processor involved
    # and no money moved. Combined with `amount_cents` coming from the client,
    # any authenticated user could mint tokens at will.
    #
    # Only a verified Stripe webhook (handle_stripe_webhook, driven by a signed
    # `checkout.session.completed`) may grant tokens, and it does so through its
    # own path — it never calls this function. Manual providers
    # (cashapp/zelle/venmo/paypal) stay pending until an operator confirms the
    # transfer, which is what "pending" already meant for them.
    status = "pending"
    payment = Payment(
        user_id=user.id,
        provider=provider,
        amount_cents=charged_cents,
        status=status,
        provider_ref=f"{provider}_{user.id}_{amount_cents}",
    )
    db.add(payment)
    db.flush()

    # No grant lives here any more, deliberately. If you are tempted to add one
    # back: it must be gated on evidence of settlement (a webhook signature, an
    # operator action), never on the caller's own say-so.

    # MISC-14: Referral and earned discount entitlements must only be consumed
    # when the payment actually captures/settles, never when an order is merely pending.
    if status == "captured":
        if referral_pct > 0:
            user.referral_discount_pct = 0.0
        if discount_pct > 0:
            apply_discount(user, db)

    db.commit()
    return {
        "id": payment.id,
        "status": payment.status,
        "tokens_added": tokens_added if status == "captured" else 0,
        # Legacy key kept for any existing caller; it now reports tokens.
        "credits_added": tokens_added if status == "captured" else 0,
        "amount_charged_cents": charged_cents,
        "discount_pct_applied": discount_pct,
        "referral_discount_pct": referral_pct,
    }


def refund_unused(db: Session, user: User, amount_cents: int) -> dict:
    """Refund unused credits."""
    return {"message": f"Refund of ${amount_cents/100:.2f} processed"}


def usage_percent(user: User) -> float:
    """Calculate percentage of credits or quota used."""
    plan_limits = {
        "free": 100.0,
        "basic": 2000.0,
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

        # `add_tokens` writes its own credit_transactions row and commits, so
        # there must be no second ledger write here — that would double-count
        # the grant in every audit query that sums the ledger.
        from .credits import add_tokens as _add_tokens
        _add_tokens(
            db, user, credits_amount,
            reason=f"payment:stripe:tx_{transaction_id}",
        )
        return True
    except Exception:
        db.rollback()
        return False
    finally:
        db.close()


def create_billing_portal_session(db: Session, user: User) -> dict:
    """Open Stripe's hosted billing portal so a subscriber can manage or cancel.

    "Manage Billing" previously only navigated to the in-app plans tab, which
    cannot cancel or change a subscription — the one thing the label promises.
    The portal is Stripe-hosted, so the user manages payment methods, invoices
    and cancellation without this app touching card data.

    Degrades honestly: an account with no Stripe customer (never subscribed, or
    Stripe not configured in this environment) gets a clear reason rather than
    a dead button or an exception.
    """
    if not _stripe_enabled():
        return {
            "status": "stripe_not_configured",
            "message": "Billing portal is unavailable — payments are not configured on this server.",
        }
    customer_id = getattr(user, "stripe_customer_id", None)
    if not customer_id:
        return {
            "status": "no_customer",
            "message": "No subscription is attached to this account yet.",
        }

    import stripe
    stripe.api_key = config.stripe_secret_key
    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=os.getenv("WEB_ORIGIN", "http://localhost:5173") + "/?billing=return",
        )
    except Exception as exc:  # noqa: BLE001 - surface the reason, never 500
        return {"status": "error", "message": f"Could not open the billing portal: {exc}"}
    return {"status": "portal_created", "portal_url": session.url}
