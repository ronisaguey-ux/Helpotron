"""Referral API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db, User
from .security import SessionStore, SESSION_COOKIE_NAME
from .referral import get_or_create_referral, redeem_referral, get_referral_stats

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Not authenticated")
    session = SessionStore.get_session(token)
    if not session:
        raise HTTPException(401, "Invalid session")
    user = db.query(User).filter(User.id == session["user_id"]).first()
    if not user:
        raise HTTPException(401, "User not found")
    return user


@router.get("/code")
async def get_referral_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ref = get_or_create_referral(db, user)
    return {
        "code": ref.referral_code,
        "url": f"https://helpotron.com/invite/{ref.referral_code}",
        "reward": "40 credits for each friend who signs up"
    }


@router.post("/redeem")
async def redeem_code(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
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
    return get_referral_stats(db, user)
