"""Referral system: generate codes, track referrals, reward users."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from fastapi import HTTPException

from .database import User, Referral


def generate_referral_code() -> str:
    """Generate a unique referral code."""
    return secrets.token_urlsafe(8)


def get_or_create_referral(db: Session, user: User) -> Referral:
    """Get existing referral for user or create a new one."""
    ref = db.query(Referral).filter(Referral.referrer_id == user.id).first()
    if not ref:
        ref = Referral(
            referrer_id=user.id,
            referral_code=generate_referral_code()
        )
        db.add(ref)
        db.commit()
        db.refresh(ref)
    return ref


def redeem_referral(db: Session, code: str, new_user: User) -> dict:
    """Redeem a referral code for a new user.

    Returns: {"status": "success", "bonus_credits": int}
    """
    ref = db.query(Referral).filter(Referral.referral_code == code).first()
    if not ref:
        raise HTTPException(404, "Invalid referral code")

    if ref.referee_id is not None:
        raise HTTPException(400, "Referral code already used")

    # Record the referral
    ref.referee_id = new_user.id
    ref.completed_at = datetime.now(timezone.utc)

    # Reward referrer: 40 credits (1 month of Pro)
    referrer = db.query(User).filter(User.id == ref.referrer_id).first()
    if referrer:
        referrer.credits += 40
        db.add(referrer)

    # Reward new user: 10 bonus credits
    new_user.credits += 10

    db.commit()

    return {"status": "success", "bonus_credits": 10}


def get_referral_stats(db: Session, user: User) -> dict:
    """Get referral stats for a user."""
    refs = db.query(Referral).filter(Referral.referrer_id == user.id).all()
    total = len(refs)
    completed = sum(1 for r in refs if r.referee_id is not None)
    return {
        "total": total,
        "completed": completed,
        "code": refs[0].referral_code if refs else None,
    }
