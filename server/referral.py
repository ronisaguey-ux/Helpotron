"""Referral system: 40-digit single-use codes, active subscription gating, and user attribution."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .config import config
from .database import CreditTransaction, Referral, User


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
    4. Rewards 40 credits to the specific referrer and 10 credits to the new user.
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

    # Reward referrer with 40 compute credits
    referrer = db.query(User).filter(User.id == ref.referrer_id).first()
    if referrer:
        referrer.credits = (referrer.credits or 0.0) + 40.0
        db.add(CreditTransaction(
            user_id=referrer.id,
            delta=40.0,
            reason=f"referral:friend_redeemed_code_{clean_code[:8]}"
        ))

    # Reward new user with 10 compute credits
    new_user.credits = (new_user.credits or 0.0) + 10.0
    db.add(CreditTransaction(
        user_id=new_user.id,
        delta=10.0,
        reason=f"referral:welcome_bonus_from_code_{clean_code[:8]}"
    ))

    db.commit()

    return {
        "status": "success",
        "message": "Referral code redeemed successfully! +10 credits awarded to your account.",
        "bonus_credits": 10,
        "referrer_public_id": referrer.public_id if referrer else "Scholar",
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
                "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                "completed_at": r.completed_at.isoformat() if r.completed_at and hasattr(r.completed_at, "isoformat") else str(r.completed_at) if r.completed_at else None,
            }
            for r in refs
        ],
    }
