"""Referral system: 40-digit single-use codes, active subscription gating, and user attribution."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .config import config
from .database import CreditTransaction, Payment, Referral, User

# Operator 08-31: redeeming someone else's referral code grants a one-time
# order discount — 30% for a new user (no payment history, no live
# subscription), 15% for an existing user.
REFERRAL_DISCOUNT_NEW_USER_PCT = 30.0
REFERRAL_DISCOUNT_EXISTING_USER_PCT = 15.0

# Operator 08-31 (Bob): the code generator's reward is TIER-BASED and tied to
# the plan the referee actually BUYS with the code — 2 credits for a Basic
# subscription purchase, 5 for Pro, 10 for Elite (1 credit = $1.00 discount
# value). Paid once per purchase; grants happen on the referee's checkout
# (payments webhook) or immediately when a code is redeemed by someone who is
# already subscribed.
REFERRAL_PLAN_REWARD_CREDITS = {"basic": 2.0, "pro": 5.0, "elite": 10.0}


def generate_referral_code() -> str:
    """Generate a 40-character cryptographically secure randomized referral code."""
    return secrets.token_hex(20)  # Exactly 40 hex characters (40 digits/chars)


def check_user_subscription(user: User) -> bool:
    """Checks if the user is currently on an active paid subscription plan."""
    active_plans = {"basic", "pro", "elite"}
    admin_id = getattr(config, "admin_public_id", None)
    is_admin = getattr(user, "role", "member") == "admin" or (bool(admin_id) and getattr(user, "public_id", "") == admin_id)
    has_plan = (user.plan or "").lower() in active_plans
    not_canceled = (user.subscription_status or "").lower() not in {"canceled", "past_due"}
    return is_admin or (has_plan and not_canceled)


def create_new_referral_code(db: Session, user: User) -> Referral:
    """Generates and persists a fresh 40-digit single-use referral code for an active subscribed user."""
    if not check_user_subscription(user):
        raise HTTPException(
            status_code=403,
            detail="Active subscription required to issue referral codes. Please subscribe to Basic, Pro, or Elite plan."
        )

    code = generate_referral_code()
    # Ensure code uniqueness
    while db.query(Referral).filter(Referral.referral_code == code).first():
        code = generate_referral_code()

    ref = Referral(
        referrer_id=user.id,
        referral_code=code,
    )
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return ref


def is_new_user(db: Session, user: User) -> bool:
    """Operator 08-31: a user counts as NEW for referral-discount purposes if
    they have never placed an order (no Payment rows) and are not on a live
    paid subscription. Anyone who has ever paid (or is subscribed/trialing)
    is an existing user."""
    if db.query(Payment).filter(Payment.user_id == user.id).first() is not None:
        return False
    return not check_user_subscription(user)


def grant_referrer_plan_reward(db: Session, referrer: User, plan: str, code: str) -> float:
    """Reward a referrer for a plan purchase (operator 08-31, Bob).

    Tier payouts: basic 2 credits, pro 5, elite 10. Idempotent — a
    (referrer, plan, code) reward is granted at most once (a code is
    single-use, and the redemption path + checkout path share the same
    reason string, so they can never double-pay). Does NOT commit — the
    caller owns the transaction.
    """
    plan = (plan or "").lower()
    reward = float(REFERRAL_PLAN_REWARD_CREDITS.get(plan, 0.0) or 0.0)
    if reward <= 0:
        return 0.0
    tx_reason = f"referral:plan_reward:{plan}:{code[:8]}"
    already = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.user_id == referrer.id, CreditTransaction.reason == tx_reason)
        .first()
    )
    if already is not None:
        return 0.0
    # Referral rewards are EARNED DISCOUNT CREDITS: they only ever reduce a bill
    # and cannot be bought. They must not land in the usage currency.
    referrer.discount_balance = (referrer.discount_balance or 0.0) + reward
    db.add(CreditTransaction(user_id=referrer.id, delta=reward, reason=tx_reason))
    return reward


def grant_referral_discount(db: Session, user: User, pct: float) -> float:
    """Grant a one-time order discount entitlement, never downgrading a
    larger active one. Persists until consumed by the next payment."""
    current = float(getattr(user, "referral_discount_pct", 0.0) or 0.0)
    granted = max(current, pct)
    user.referral_discount_pct = granted
    return granted


def get_or_create_referral(db: Session, user: User) -> Referral:
    """Get active unredeemed referral code for user or generate a fresh one if subscribed."""
    if not check_user_subscription(user):
        raise HTTPException(
            status_code=403,
            detail="Active subscription required to issue referral codes. Please subscribe to Basic, Pro, or Elite plan."
        )

    # Check for existing pending/unredeemed code
    ref = (
        db.query(Referral)
        .filter(Referral.referrer_id == user.id, Referral.referee_id.is_(None))
        .order_by(Referral.id.desc())
        .first()
    )
    if not ref:
        ref = create_new_referral_code(db, user)
    return ref


def redeem_referral(db: Session, code: str, new_user: User) -> Dict[str, Any]:
    """Redeem a 40-digit single-use referral code.

    Rules:
    1. Code must exist in database.
    2. Code cannot be reused (single-use).
    3. User cannot redeem their own code.
    4. Rewards 10 credits to the redeemer.
    5. Operator 08-31: grants a one-time order discount — 30% off (new user)
       or 15% off (existing user) — applied to the next successful payment.
    6. Operator 08-31 (Bob): the code generator's reward is TIER-BASED and
       tied to the PLAN the redeemer buys — 2 credits (basic) / 5 (pro) /
       10 (elite). A redeemer who is already subscribed pays immediately
       (their current plan); a fresh redeemer is rewarded when their
       checkout completes (payments.py webhook). Never 40 flat credits.
    """
    clean_code = code.strip()
    ref = db.query(Referral).filter(Referral.referral_code == clean_code).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    if ref.referee_id is not None or ref.completed_at is not None:
        raise HTTPException(
            status_code=400,
            detail="This referral code has already been redeemed and cannot be reused. Each 40-digit code is strictly single-use."
        )

    if ref.referrer_id == new_user.id:
        raise HTTPException(status_code=400, detail="You cannot redeem your own referral code.")

    # Record completion
    ref.referee_id = new_user.id
    ref.completed_at = datetime.now(timezone.utc)

    # Referrer reward (operator 08-31, Bob): tier-based on the referee's plan.
    # Already subscribed -> pay now by current plan; fresh -> paid at checkout.
    referrer = db.query(User).filter(User.id == ref.referrer_id).first()
    if referrer and check_user_subscription(new_user):
        grant_referrer_plan_reward(db, referrer, str(new_user.plan or ""), clean_code)

    # Reward the new user with 10 earned discount credits (bill reduction only).
    new_user.discount_balance = (new_user.discount_balance or 0.0) + 10.0
    db.add(CreditTransaction(
        user_id=new_user.id,
        delta=10.0,
        reason=f"referral:welcome_bonus_from_code_{clean_code[:8]}"
    ))

    # Operator 08-31: one-time order discount — 30% off if the redeemer is a
    # new user (never paid, no live subscription), 15% off otherwise.
    user_is_new = is_new_user(db, new_user)
    discount_pct = REFERRAL_DISCOUNT_NEW_USER_PCT if user_is_new else REFERRAL_DISCOUNT_EXISTING_USER_PCT
    granted = grant_referral_discount(db, new_user, discount_pct)

    db.commit()

    return {
        "status": "success",
        "message": (
            f"Referral code redeemed successfully! +10 credits awarded to your account "
            f"and a one-time {granted:g}% off your next order has been applied."
        ),
        "bonus_credits": 10,
        "referrer_public_id": referrer.public_id if referrer else "Scholar",
        "is_new_user": user_is_new,
        "discount_pct": granted,
    }


def get_referral_stats(db: Session, user: User) -> Dict[str, Any]:
    """Get full referral history and stats for user."""
    is_subscribed = check_user_subscription(user)
    refs = db.query(Referral).filter(Referral.referrer_id == user.id).order_by(Referral.id.desc()).all()
    total = len(refs)
    completed = sum(1 for r in refs if r.referee_id is not None)
    active_ref = next((r for r in refs if r.referee_id is None), None)

    return {
        "status": "success",
        "is_subscribed": is_subscribed,
        "total_issued": total,
        "total_completed": completed,
        "active_code": active_ref.referral_code if active_ref else (refs[0].referral_code if refs else None),
        "codes": [
            {
                "id": r.id,
                "code": r.referral_code,
                "is_redeemed": r.referee_id is not None,
                "plan": (r.referee.plan if (r.referee is not None) else None),  # tier reward depends on the plan bought (08-31)
                "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                "completed_at": r.completed_at.isoformat() if r.completed_at and hasattr(r.completed_at, "isoformat") else str(r.completed_at) if r.completed_at else None,
            }
            for r in refs
        ],
    }
