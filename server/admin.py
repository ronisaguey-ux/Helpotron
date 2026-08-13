"""Admin control panel — user management, analytics, token system.

Access restricted to admin users (hardcoded public_id from config).
Features: user list, activity logs, credit adjustments, token generation/management,
assignment stats, revenue tracking, and system health.

Tokens: generate 1-week/1-month free trial tokens that users can redeem.
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import config
from .database import Assignment, CreditTransaction, Payment, StudyMaterial, Transcript, User, get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])

# ─── admin auth ──────────────────────────────────────────────────────────────

def is_admin(request: Request) -> bool:
    """Check if the requesting user is the admin."""
    admin_id = config.admin_public_id
    if not admin_id:
        return False
    public_id = request.headers.get("X-Public-ID")
    return public_id == admin_id


def require_admin(request: Request) -> None:
    if not is_admin(request):
        raise HTTPException(403, "Admin access required")


# ─── token system ──────────────────────────────────────────────────────────

class TokenRequest(BaseModel):
    duration_days: int  # 7 or 30
    max_uses: int = 1


class TokenRedeemRequest(BaseModel):
    token: str


class TokenManager:
    """Manage free trial tokens — stored in admin's settings."""

    @staticmethod
    def generate_token(db: Session, duration_days: int, max_uses: int = 1) -> str:
        """Generate a unique token."""
        token = secrets.token_urlsafe(16)
        admin = db.query(User).filter(User.public_id == config.admin_public_id).first()
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
        """Redeem a token for free credits."""
        admin = db.query(User).filter(User.public_id == config.admin_public_id).first()
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

        # Apply free credits based on duration
        duration_days = token_data["duration_days"]
        # 7 days = 15 credits, 30 days = 40 credits (matching Pro tier)
        if duration_days == 7:
            credits = 15
        elif duration_days == 30:
            credits = 40
        else:
            credits = 10

        # Add credits to user
        user.credits += credits

        # Mark token as used
        token_data["uses"] += 1
        token_data["used_by"].append(user.public_id)
        admin.settings = settings
        db.commit()
        return f"Token redeemed! You received {credits} credits."

    @staticmethod
    def list_tokens(db: Session) -> List[dict]:
        admin = db.query(User).filter(User.public_id == config.admin_public_id).first()
        if not admin:
            return []
        settings = admin.settings or {}
        return settings.get("tokens", [])

    @staticmethod
    def deactivate_token(db: Session, token: str) -> bool:
        admin = db.query(User).filter(User.public_id == config.admin_public_id).first()
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


# ─── admin endpoints ──────────────────────────────────────────────────────

@router.get("/users")
async def list_users(request: Request, db: Session = Depends(get_db)):
    """List all users with basic info."""
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
    } for u in users]


@router.get("/user/{public_id}")
async def get_user_detail(public_id: str, request: Request, db: Session = Depends(get_db)):
    """Get detailed info about a specific user."""
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
        "transcripts": [{"id": t.id, "source": t.source, "created_at": t.created_at.isoformat()} for t in user.transcripts],
        "materials": [{"id": m.id, "kind": m.kind, "created_at": m.created_at.isoformat()} for m in user.materials],
        "payments": [{"id": p.id, "amount_cents": p.amount_cents, "status": p.status} for p in user.payments],
    }


@router.post("/user/{public_id}/credits")
async def adjust_user_credits(public_id: str, amount: float, reason: str, request: Request, db: Session = Depends(get_db)):
    """Manually adjust a user's credits."""
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.credits += amount
    # Log the transaction
    tx = CreditTransaction(user_id=user.id, delta=amount, reason=f"admin: {reason}")
    db.add(tx)
    db.commit()
    return {"new_balance": user.credits}


@router.post("/user/{public_id}/plan")
async def set_user_plan(public_id: str, plan: str, request: Request, db: Session = Depends(get_db)):
    """Change a user's plan."""
    require_admin(request)
    if plan not in ["basic", "pro", "elite"]:
        raise HTTPException(400, "Invalid plan")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.plan = plan
    db.commit()
    return {"plan": plan}


# ─── analytics ─────────────────────────────────────────────────────────────

@router.get("/analytics")
async def get_analytics(request: Request, db: Session = Depends(get_db)):
    """Get system-wide analytics."""
    require_admin(request)

    total_users = db.query(User).count()
    total_assignments = db.query(Assignment).count()
    total_materials = db.query(StudyMaterial).count()
    total_transcripts = db.query(Transcript).count()
    total_payments = db.query(Payment).count()

    # Revenue
    total_revenue_cents = db.query(func.sum(Payment.amount_cents)).filter(Payment.status == "captured").scalar() or 0

    # Credits spent
    total_credits_spent = db.query(func.sum(CreditTransaction.delta)).filter(CreditTransaction.delta < 0).scalar() or 0

    # User breakdown by plan
    plan_counts = {}
    for plan, count in db.query(User.plan, func.count(User.id)).group_by(User.plan).all():
        plan_counts[plan] = count

    return {
        "users": {
            "total": total_users,
            "by_plan": plan_counts,
        },
        "content": {
            "assignments": total_assignments,
            "study_materials": total_materials,
            "transcripts": total_transcripts,
        },
        "finance": {
            "total_revenue_cents": total_revenue_cents,
            "total_revenue_usd": total_revenue_cents / 100,
            "total_credits_spent": total_credits_spent,
        },
        "payments": total_payments,
    }


@router.get("/analytics/activity")
async def get_activity_log(request: Request, db: Session = Depends(get_db)):
    """Get recent user activity (last 7 days)."""
    require_admin(request)

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    assignments = db.query(Assignment).filter(Assignment.created_at >= cutoff).count()
    materials = db.query(StudyMaterial).filter(StudyMaterial.created_at >= cutoff).count()
    transcripts = db.query(Transcript).filter(Transcript.created_at >= cutoff).count()

    return {
        "last_7_days": {
            "assignments_created": assignments,
            "study_materials_created": materials,
            "transcripts_uploaded": transcripts,
        }
    }


@router.get("/analytics/revenue")
async def get_revenue_timeline(request: Request, db: Session = Depends(get_db)):
    """Get revenue timeline (daily for last 30 days)."""
    require_admin(request)

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    payments = db.query(Payment).filter(
        Payment.created_at >= cutoff,
        Payment.status == "captured"
    ).all()

    # Aggregate by day
    daily = {}
    for p in payments:
        day = p.created_at.date().isoformat()
        daily[day] = daily.get(day, 0) + p.amount_cents

    return {"daily_revenue_cents": daily}


# ─── tokens ────────────────────────────────────────────────────────────────

@router.post("/tokens/generate")
async def generate_token(req: TokenRequest, request: Request, db: Session = Depends(get_db)):
    """Generate a free trial token."""
    require_admin(request)
    token = TokenManager.generate_token(db, req.duration_days, req.max_uses)
    return {"token": token, "duration_days": req.duration_days, "max_uses": req.max_uses}


@router.get("/tokens")
async def list_tokens(request: Request, db: Session = Depends(get_db)):
    """List all generated tokens."""
    require_admin(request)
    return {"tokens": TokenManager.list_tokens(db)}


@router.post("/tokens/deactivate")
async def deactivate_token(token: str, request: Request, db: Session = Depends(get_db)):
    """Deactivate a token."""
    require_admin(request)
    result = TokenManager.deactivate_token(db, token)
    if not result:
        raise HTTPException(404, "Token not found")
    return {"message": "Token deactivated"}


@router.post("/tokens/redeem")
async def redeem_token_endpoint(req: TokenRedeemRequest, request: Request, db: Session = Depends(get_db)):
    """Redeem a token (public endpoint, requires user authentication)."""
    public_id = request.headers.get("X-Public-ID")
    if not public_id:
        raise HTTPException(400, "Missing X-Public-ID header")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    result = TokenManager.redeem_token(db, user, req.token)
    return {"message": result}


# ─── system health ─────────────────────────────────────────────────────────

@router.get("/health")
async def admin_health(request: Request, db: Session = Depends(get_db)):
    """System health check (admin only)."""
    require_admin(request)

    # Check database connectivity
    try:
        db.execute("SELECT 1")
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {e}"

    return {
        "status": "ok",
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "config": {
            "admin_configured": bool(config.admin_public_id),
            "web_origin": config.web_origin,
        }
    }
