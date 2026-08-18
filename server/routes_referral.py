"""Referral API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db, User
from .security import get_current_user
from .referral import get_or_create_referral, create_new_referral_code, redeem_referral, get_referral_stats

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


@router.get("/code")
async def get_referral_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieves or creates active 40-digit referral code (requires active subscription)."""
    ref = get_or_create_referral(db, user)
    return {
        "status": "success",
        "code": ref.referral_code,
        "url": f"https://helpotron.com/invite/{ref.referral_code}",
        "reward": "40 compute credits per friend who subscribes",
        "is_single_use": True,
        "code_length": len(ref.referral_code),
    }


@router.post("/generate")
async def generate_new_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Issues a fresh 40-digit single-use referral code for an active subscribed user."""
    ref = create_new_referral_code(db, user)
    return {
        "status": "success",
        "code": ref.referral_code,
        "url": f"https://helpotron.com/invite/{ref.referral_code}",
        "message": "Fresh 40-digit single-use referral code issued.",
    }


@router.post("/redeem")
async def redeem_code(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Redeems a 40-digit single-use referral code."""
    data = await request.json()
    code = data.get("code")
    if not code:
        raise HTTPException(400, "Referral code required")
    result = redeem_referral(db, code, user)
    return result


@router.get("/stats")
async def get_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fetches user referral metrics and list of issued 40-digit codes with redemption status."""
    return get_referral_stats(db, user)
