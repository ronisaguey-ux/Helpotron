"""Admin control panel — user management, analytics, token system.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import config
from .database import Assignment, CreditTransaction, Payment, StudyMaterial, Transcript, User, get_db
from .security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_IDS = ["RoniDev", "admin"]


def is_admin(request: Request) -> bool:
    from .security import SESSION_COOKIE_NAME, SessionStore
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        sess = SessionStore.get_session(token)
        if sess and sess.get("public_id") in ADMIN_IDS:
            return True

    # Allow header or local fallback strictly in non-production development mode
    if not config.production_mode:
        public_id = request.headers.get("X-Public-ID") or request.query_params.get("public_id")
        if public_id and str(public_id).strip() in ADMIN_IDS:
            return True
        if request.client and request.client.host in ("127.0.0.1", "localhost", "testclient"):
            return True

    return False


def require_admin(request: Request) -> None:
    if not is_admin(request):
        raise HTTPException(403, "Admin access required")


class TokenRequest(BaseModel):
    duration_days: int
    max_uses: int = 1


class TokenRedeemRequest(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    new_password: str


class TokenManager:
    @staticmethod
    def generate_token(db: Session, duration_days: int, max_uses: int = 1) -> str:
        token = secrets.token_urlsafe(16)
        admin = db.query(User).filter(User.public_id.in_(ADMIN_IDS)).first()
        if not admin:
            raise HTTPException(404, "Admin user not found")
        settings = admin.settings or {}
        tokens = settings.get("tokens", [])
        tokens.append({
            "token": token,
            "duration_days": duration_days,
            "max_uses": max_uses,
            "uses": 0,
            "used_by": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "active": True,
        })
        settings["tokens"] = tokens
        admin.settings = settings
        db.commit()
        return token

    @staticmethod
    def redeem_token(db: Session, user: User, token: str) -> str:
        admin = db.query(User).filter(User.public_id.in_(ADMIN_IDS)).first()
        if not admin:
            return "Token system unavailable"
        settings = admin.settings or {}
        tokens = settings.get("tokens", [])
        token_data = None
        for t in tokens:
            if t["token"] == token:
                token_data = t
                break
        if not token_data:
            return "Invalid token"
        if not token_data.get("active", True):
            return "Token has been deactivated"
        if token_data["uses"] >= token_data["max_uses"]:
            return "Token has reached its usage limit"
        if user.public_id in token_data["used_by"]:
            return "You have already used this token"
        duration_days = token_data["duration_days"]
        if duration_days == 7:
            credits = 25
        elif duration_days == 30:
            credits = 75
        else:
            credits = 10
        user.credits += credits
        token_data["uses"] += 1
        token_data["used_by"].append(user.public_id)
        admin.settings = settings
        db.commit()
        return f"Token redeemed! You received {credits} credits."

    @staticmethod
    def list_tokens(db: Session) -> list[dict]:
        admin = db.query(User).filter(User.public_id.in_(ADMIN_IDS)).first()
        if not admin:
            return []
        return (admin.settings or {}).get("tokens", [])

    @staticmethod
    def deactivate_token(db: Session, token: str) -> bool:
        admin = db.query(User).filter(User.public_id.in_(ADMIN_IDS)).first()
        if not admin:
            return False
        settings = admin.settings or {}
        tokens = settings.get("tokens", [])
        for t in tokens:
            if t["token"] == token:
                t["active"] = False
                admin.settings = settings
                db.commit()
                return True
        return False


@router.get("/users")
async def list_users(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    users = db.query(User).all()
    return [{
        "id": u.id,
        "public_id": u.public_id,
        "plan": u.plan,
        "credits": u.credits,
        "telegram_id": u.telegram_id,
        "created_at": u.created_at.isoformat(),
        "assignment_count": len(u.assignments),
        "material_count": len(u.materials),
        "transcript_count": len(u.transcripts),
        "is_banned": u.settings.get("banned", False) if u.settings else False,
    } for u in users]


@router.get("/user/{public_id}")
async def get_user_detail(public_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return {
        "id": user.id,
        "public_id": user.public_id,
        "plan": user.plan,
        "credits": user.credits,
        "telegram_id": user.telegram_id,
        "settings": user.settings,
        "created_at": user.created_at.isoformat(),
        "assignments": [{"id": a.id, "title": a.title, "status": a.status} for a in user.assignments],
        "transcripts": [{"id": t.id, "source": t.source} for t in user.transcripts],
        "materials": [{"id": m.id, "kind": m.kind} for m in user.materials],
        "payments": [{"id": p.id, "amount_cents": p.amount_cents, "status": p.status} for p in user.payments],
    }


@router.post("/user/{public_id}/credits")
async def adjust_user_credits(public_id: str, amount: float, reason: str = "admin adjustment", request: Request = None, db: Session = Depends(get_db)):
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.credits += amount
    tx = CreditTransaction(user_id=user.id, delta=amount, reason=f"admin: {reason}")
    db.add(tx)
    db.commit()
    return {"new_balance": user.credits}


@router.post("/user/{public_id}/plan")
async def set_user_plan(public_id: str, plan: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    if plan not in ["basic", "pro", "elite"]:
        raise HTTPException(400, "Invalid plan")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.plan = plan
    db.commit()
    return {"plan": plan}


@router.post("/user/{public_id}/reset-password")
async def reset_user_password(public_id: str, req: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    if len(req.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    hashed, salt = hash_password(req.new_password)
    user.password_hash = hashed
    user.password_salt = salt
    db.commit()
    return {"message": "Password reset successfully"}


@router.post("/user/{public_id}/ban")
async def ban_user(public_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    settings = user.settings or {}
    settings["banned"] = True
    user.settings = settings
    db.commit()
    return {"message": "User banned"}


@router.post("/user/{public_id}/unban")
async def unban_user(public_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    settings = user.settings or {}
    settings["banned"] = False
    user.settings = settings
    db.commit()
    return {"message": "User unbanned"}


@router.get("/analytics")
async def get_analytics(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    total_users = db.query(User).count()
    total_assignments = db.query(Assignment).count()
    total_materials = db.query(StudyMaterial).count()
    total_transcripts = db.query(Transcript).count()
    total_payments = db.query(Payment).count()
    total_revenue_cents = db.query(func.sum(Payment.amount_cents)).filter(Payment.status == "captured").scalar() or 0
    total_credits_spent = db.query(func.sum(CreditTransaction.delta)).filter(CreditTransaction.delta < 0).scalar() or 0
    plan_counts = {}
    for plan, count in db.query(User.plan, func.count(User.id)).group_by(User.plan).all():
        plan_counts[plan] = count
    return {
        "users": {"total": total_users, "by_plan": plan_counts},
        "content": {"assignments": total_assignments, "study_materials": total_materials, "transcripts": total_transcripts},
        "finance": {"total_revenue_cents": total_revenue_cents, "total_revenue_usd": total_revenue_cents / 100, "total_credits_spent": total_credits_spent},
        "payments": total_payments,
    }


@router.get("/analytics/activity")
async def get_activity_log(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    return {
        "last_7_days": {
            "assignments_created": db.query(Assignment).filter(Assignment.created_at >= cutoff).count(),
            "study_materials_created": db.query(StudyMaterial).filter(StudyMaterial.created_at >= cutoff).count(),
            "transcripts_uploaded": db.query(Transcript).filter(Transcript.created_at >= cutoff).count(),
        }
    }


@router.get("/analytics/revenue")
async def get_revenue_timeline(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    payments = db.query(Payment).filter(Payment.created_at >= cutoff, Payment.status == "captured").all()
    daily = {}
    for p in payments:
        day = p.created_at.date().isoformat()
        daily[day] = daily.get(day, 0) + p.amount_cents
    return {"daily_revenue_cents": daily}


@router.post("/tokens/generate")
async def generate_token(req: TokenRequest, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    token = TokenManager.generate_token(db, req.duration_days, req.max_uses)
    return {"token": token, "duration_days": req.duration_days, "max_uses": req.max_uses}


@router.get("/tokens")
async def list_tokens(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    return {"tokens": TokenManager.list_tokens(db)}


@router.post("/tokens/deactivate")
async def deactivate_token(token: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    if not TokenManager.deactivate_token(db, token):
        raise HTTPException(404, "Token not found")
    return {"message": "Token deactivated"}


@router.post("/tokens/redeem")
async def redeem_token_endpoint(req: TokenRedeemRequest, request: Request, db: Session = Depends(get_db)):
    public_id = request.headers.get("X-Public-ID")
    if not public_id:
        raise HTTPException(400, "Missing X-Public-ID header")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    result = TokenManager.redeem_token(db, user, req.token)
    return {"message": result}


@router.get("/health")
async def admin_health(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    try:
        db.execute("SELECT 1")
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {e}"
    return {"status": "ok", "database": db_status, "timestamp": datetime.now(timezone.utc).isoformat()}
