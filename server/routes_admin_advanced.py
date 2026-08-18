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

