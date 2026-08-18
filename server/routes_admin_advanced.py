"""FastAPI routes for Advanced Admin controls: Bulk operations, Health, Moderation, and Model Metrics."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .admin import require_admin
from .admin_advanced import admin_advanced_service
from .database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin_advanced"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class BulkOperationRequest(BaseModel):
    user_ids: List[int]
    plan: Optional[str] = None  # basic | pro | elite
    delta_credits: Optional[float] = None
    ban_status: Optional[bool] = None
    tags_to_add: Optional[List[str]] = None


class ModerationActionRequest(BaseModel):
    action: str = Field(..., description="approved | rejected | deleted")
    admin_notes: str = ""


class ModelOverrideRequest(BaseModel):
    task_type: str = Field(..., description="essay | stem | code | flashcards")
    model_id: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/bulk-operations")
async def bulk_user_operations_endpoint(
    payload: BulkOperationRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Applies bulk plan upgrades, credit adjustments, bans, or tagging to selected users."""
    require_admin(request)
    result = admin_advanced_service.bulk_operate_users(
        db,
        user_ids=payload.user_ids,
        plan=payload.plan,
        delta_credits=payload.delta_credits,
        ban_status=payload.ban_status,
        tags_to_add=payload.tags_to_add,
    )
    return result


@router.get("/system-health")
async def get_system_health_endpoint(request: Request, db: Session = Depends(get_db)):
    """Returns uptime %, API latency breakdown (OpenAI, Gemini, Twilio, DeepSeek), error rate logs."""
    require_admin(request)
    return admin_advanced_service.get_system_health(db)


@router.get("/moderation")
async def get_moderation_queue_endpoint(
    status: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Fetches flagged content moderation queue."""
    require_admin(request)
    items = admin_advanced_service.get_moderation_queue(status)
    return {"status": "success", "count": len(items), "queue": items}


@router.post("/moderation/{mod_id}/action")
async def action_moderation_item_endpoint(
    mod_id: str,
    payload: ModerationActionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Approves, rejects, or deletes a flagged content moderation item."""
    require_admin(request)
    res = admin_advanced_service.action_moderation_item(
        db,
        mod_id=mod_id,
        action=payload.action,
        admin_notes=payload.admin_notes,
    )
    return res


@router.get("/model-metrics")
async def get_model_metrics_endpoint(request: Request, db: Session = Depends(get_db)):
    """Returns scorecard per model (accuracy, speed, cost) and routing overrides."""
    require_admin(request)
    return admin_advanced_service.get_model_metrics()


@router.post("/model-metrics/override")
async def set_model_override_endpoint(
    payload: ModelOverrideRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Overrides default model routing per assignment task type."""
    require_admin(request)
    res = admin_advanced_service.set_routing_override(payload.task_type, payload.model_id)
    return res


@router.get("/messages")
async def get_all_admin_messages_endpoint(request: Request, limit: int = 100, db: Session = Depends(get_db)):
    """Admin endpoint: lists all incoming messages from students/users."""
    from .database import AdminMessage
    msgs = db.query(AdminMessage).order_by(AdminMessage.id.desc()).limit(limit).all()
    return {
        "status": "success",
        "count": len(msgs),
        "messages": [
            {
                "id": m.id,
                "user_id": m.user_id,
                "subject": m.subject,
                "category": m.category,
                "message": m.message,
                "status": m.status,
                "admin_reply": m.admin_reply,
                "created_at": m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at),
                "replied_at": m.replied_at.isoformat() if m.replied_at and hasattr(m.replied_at, "isoformat") else str(m.replied_at) if m.replied_at else None,
            }
            for m in msgs
        ],
    }


class AdminReplyPayload(BaseModel):
    reply: str = Field(..., min_length=1, max_length=10000)


@router.post("/messages/{message_id}/reply")
async def reply_to_admin_message_endpoint(message_id: int, payload: AdminReplyPayload, db: Session = Depends(get_db)):
    """Admin endpoint: replies to a student/user inquiry."""
    from .database import AdminMessage
    from datetime import datetime, timezone
    msg = db.query(AdminMessage).filter(AdminMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.admin_reply = payload.reply
    msg.status = "replied"
    msg.replied_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": "success",
        "message_id": message_id,
        "admin_reply": payload.reply,
        "status": "replied",
    }


# ─── Tokens & Access Keys Management ──────────────────────────────────────────

class GenerateTokenPayload(BaseModel):
    duration_days: int = Field(30, ge=1, le=365)
    max_uses: int = Field(1, ge=1, le=1000)


_in_memory_tokens: List[Dict[str, Any]] = []


@router.post("/tokens/generate")
async def generate_admin_token(payload: GenerateTokenPayload, request: Request):
    """Admin endpoint: generates a platform access token or coupon key."""
    require_admin(request)
    import secrets
    from datetime import datetime, timezone, timedelta

    tok = {
        "token": f"hlp_{secrets.token_hex(16)}",
        "duration_days": payload.duration_days,
        "max_uses": payload.max_uses,
        "uses_count": 0,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=payload.duration_days)).isoformat(),
    }
    _in_memory_tokens.append(tok)
    return {"status": "success", "token": tok}


@router.get("/tokens")
async def list_admin_tokens(request: Request):
    """Admin endpoint: lists all platform tokens and coupon keys."""
    require_admin(request)
    return {"status": "success", "tokens": _in_memory_tokens}


@router.post("/tokens/deactivate")
async def deactivate_admin_token(request: Request, token: str = ""):
    """Admin endpoint: deactivates an active token."""
    require_admin(request)
    for t in _in_memory_tokens:
        if t["token"] == token:
            t["is_active"] = False
            return {"status": "success", "message": f"Token {token} deactivated"}
    return {"status": "error", "message": "Token not found"}


# ─── Cost Monitoring & Per-User Token Multipliers ─────────────────────────────

class SetMultiplierPayload(BaseModel):
    multiplier: float = Field(..., ge=0.1, le=10.0, description="Token cost multiplier (e.g. 0.5 for testers, 1.5 for premium)")


class UserBudgetPayload(BaseModel):
    monthly_budget_usd: float = Field(..., ge=1.0, le=5000.0)
    default_effort_level: Optional[int] = Field(5, ge=1, le=10)


class CostEstimatePayload(BaseModel):
    task_type: str = Field("draft", description="draft | transcription | ocr | humanization | grading")
    word_count: int = Field(500, ge=10, le=50000)
    effort_level: int = Field(5, ge=1, le=10)
    detectors: Optional[List[str]] = None


@router.get("/costs/summary")
async def get_admin_cost_summary(request: Request, db: Session = Depends(get_db)):
    """Admin endpoint: Returns comprehensive API cost analytics, model breakdown, top users, and profit margins."""
    require_admin(request)
    from .cost_tracking import cost_engine
    return cost_engine.get_cost_summary(db)


@router.get("/costs/users")
async def get_admin_users_costs(request: Request, db: Session = Depends(get_db)):
    """Admin endpoint: Returns list of users with their custom token multiplier and aggregated costs."""
    require_admin(request)
    from .database import User, ApiUsageLog
    from sqlalchemy import func
    users = db.query(User).all()
    res = []
    for u in users:
        call_count = db.query(func.count(ApiUsageLog.id)).filter(ApiUsageLog.public_id == u.public_id).scalar() or 0
        total_cost = db.query(func.sum(ApiUsageLog.base_cost_usd)).filter(ApiUsageLog.public_id == u.public_id).scalar() or 0.0
        total_charged = db.query(func.sum(ApiUsageLog.charged_cost_usd)).filter(ApiUsageLog.public_id == u.public_id).scalar() or 0.0
        plan_rev = 40.00 if u.plan == "elite" else (20.00 if u.plan == "pro" else 10.00)
        profit = round(plan_rev - total_cost, 2)
        margin = round((profit / plan_rev) * 100, 1) if plan_rev > 0 else 0

        res.append({
            "id": u.id,
            "public_id": u.public_id,
            "plan": u.plan,
            "token_cost_multiplier": getattr(u, "token_cost_multiplier", 1.0) or 1.0,
            "monthly_budget_usd": getattr(u, "monthly_budget_usd", 50.0) or 50.0,
            "default_effort_level": getattr(u, "default_effort_level", 5) or 5,
            "total_calls": call_count,
            "total_cost_usd": round(float(total_cost), 4),
            "total_charged_usd": round(float(total_charged), 4),
            "estimated_revenue_usd": plan_rev,
            "estimated_profit_usd": profit,
            "profit_margin_pct": margin,
        })
    return {"status": "success", "users": res}


@router.post("/costs/users/{public_id}/multiplier")
async def update_user_token_multiplier(
    public_id: str,
    payload: SetMultiplierPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    """Admin endpoint: Adjusts a user's custom token pricing multiplier."""
    require_admin(request)
    from .cost_tracking import cost_engine
    user = cost_engine.set_user_multiplier(db, public_id, payload.multiplier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {
        "status": "success",
        "public_id": public_id,
        "token_cost_multiplier": user.token_cost_multiplier,
        "message": f"Updated token pricing multiplier for {public_id} to {user.token_cost_multiplier}x.",
    }


@router.get("/costs/budget")
async def get_user_budget_endpoint(user_id: Optional[str] = None, db: Session = Depends(get_db)):
    """User endpoint: Returns monthly budget and current usage/alert state."""
    from .database import User, ApiUsageLog
    from sqlalchemy import func
    from datetime import datetime, timezone
    uid = user_id or "RoniDev"
    user = db.query(User).filter(User.public_id == uid).first()
    budget = getattr(user, "monthly_budget_usd", 50.0) if user else 50.0
    multiplier = getattr(user, "token_cost_multiplier", 1.0) if user else 1.0
    effort = getattr(user, "default_effort_level", 5) if user else 5

    # Month-to-date spent
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_spent = (
        db.query(func.sum(ApiUsageLog.charged_cost_usd))
        .filter(ApiUsageLog.public_id == uid, ApiUsageLog.created_at >= month_start)
        .scalar()
        or 0.0
    )

    percent_used = round((month_spent / budget) * 100, 1) if budget > 0 else 0
    is_approaching_limit = percent_used >= 80.0

    return {
        "status": "success",
        "public_id": uid,
        "monthly_budget_usd": budget,
        "current_month_spent_usd": round(float(month_spent), 4),
        "percent_budget_used": percent_used,
        "is_approaching_limit": is_approaching_limit,
        "token_cost_multiplier": multiplier,
        "default_effort_level": effort,
    }


@router.post("/costs/budget")
async def update_user_budget_endpoint(payload: UserBudgetPayload, user_id: Optional[str] = None, db: Session = Depends(get_db)):
    """User endpoint: Updates monthly budget and effort level."""
    from .database import User
    uid = user_id or "RoniDev"
    user = db.query(User).filter(User.public_id == uid).first()
    if user:
        user.monthly_budget_usd = payload.monthly_budget_usd
        if payload.default_effort_level is not None:
            user.default_effort_level = payload.default_effort_level
        db.commit()
    return {"status": "success", "monthly_budget_usd": payload.monthly_budget_usd, "default_effort_level": payload.default_effort_level}


@router.post("/costs/estimate")
async def estimate_cost_endpoint(payload: CostEstimatePayload, user_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Pre-flight cost calculator for tasks."""
    from .model_tiering import model_tiering_engine
    from .database import User
    uid = user_id or "RoniDev"
    user = db.query(User).filter(User.public_id == uid).first()
    mult = getattr(user, "token_cost_multiplier", 1.0) if user else 1.0

    est = model_tiering_engine.estimate_task_cost(
        task_type=payload.task_type,
        word_count=payload.word_count,
        effort_level=payload.effort_level,
        enabled_detectors=payload.detectors,
        user_multiplier=mult,
    )
    return {"status": "success", "estimate": est}



