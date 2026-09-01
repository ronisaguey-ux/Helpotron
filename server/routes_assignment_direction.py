"""Assignment lifecycle / direction-picker API routes (feature 09-01).

Auth uses the same ``get_current_user`` dependency as the other assignment
routes (server.security). IDOR-safe: every ``{assignment_id}`` route filters on
Assignment.user_id == current_user.id and 404s for foreign rows.

Route map (all under /api/assignments):
  GET  /export                      → JSON attachment export (registered FIRST
                                      so /export can never be shadowed)
  GET  /{id}/direction              → direction picker state
  POST /{id}/choose-direction       → apply a direction (pending_approval →
                                       in_progress; Data Lake on un-achievable
                                       custom)
  POST /{id}/mark-done              → completed
  POST /{id}/archive                → archived (assignment history)
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .assignment_direction import (
    DIRECTIONS,
    apply_direction,
    archive,
    bucket_for,
    mark_done,
)
from .database import AgentAction, AgentChatMessage, Assignment, StudyMaterial, User, get_db
from .security import get_current_user

router = APIRouter(prefix="/api/assignments", tags=["assignments_direction"])


class DirectionChoice(BaseModel):
    direction: str
    custom_text: Optional[str] = None


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if value else None


def _get_owned_assignment(assignment_id: int, user_id: int, db: Session) -> Assignment:
    assignment = (
        db.query(Assignment)
        .filter(Assignment.id == assignment_id, Assignment.user_id == user_id)
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found or unauthorized")
    return assignment


def _assignment_out(a: Assignment) -> Dict[str, Any]:
    return {
        "id": a.id,
        "title": a.title,
        "status": a.status,
        "progress": a.progress or {},
        "due_date": a.due_date,
        "created_at": _iso(a.created_at),
    }


# ─── Export (must be declared before every /{assignment_id} route) ────────────

@router.get("/export")
async def export_assignments(
    assignment_id: Optional[int] = Query(None, description="Export exactly one assignment (must be owned)"),
    bubble: Optional[str] = Query(None, description="Subject bubble title to filter by"),
    scope: str = Query("all", description="Export scope label used in the payload and file name"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export the caller's assignments + related rows as a JSON attachment.

    ``assignment_id`` narrows to one owned assignment (404 if not found);
    ``bubble`` matches the assignment's subject subject bubble label, raw
    stored subject, or course code (default bubble labels are normalized with
    the same vocabulary the dashboard cards use).
    """
    q = db.query(Assignment).filter(Assignment.user_id == current_user.id)
    if assignment_id is not None:
        q = q.filter(Assignment.id == assignment_id)
    rows = q.order_by(Assignment.id.asc()).all()
    if assignment_id is not None and not rows:
        raise HTTPException(status_code=404, detail="Assignment not found or unauthorized")

    if bubble:
        bubble = bubble.strip()
        vocab = None
        try:
            from .routes_overlord import _bubble_vocab_subject as _vocab
            vocab = _vocab
        except Exception:  # noqa: BLE001 — vocabulary optional, exact match below
            pass
        norm_bubble = vocab(bubble) if vocab else bubble
        filtered: List[Assignment] = []
        for a in rows:
            prog = a.progress or {}
            subj = (prog.get("subject") or "").strip()
            if subj == bubble or (prog.get("course_code") or "") == bubble:
                filtered.append(a)
            elif vocab and subj and vocab(subj) == norm_bubble:
                filtered.append(a)
        rows = filtered

    ids = [a.id for a in rows]
    materials: List[Any] = []
    messages: List[Any] = []
    actions: List[Any] = []
    if ids:
        materials = (
            db.query(StudyMaterial)
            .filter(StudyMaterial.user_id == current_user.id, StudyMaterial.assignment_id.in_(ids))
            .order_by(StudyMaterial.id.asc())
            .all()
        )
        target_keys = [str(i) for i in ids]
        messages = (
            db.query(AgentChatMessage)
            .filter(
                AgentChatMessage.user_id == current_user.id,
                AgentChatMessage.target_key.in_(target_keys),
            )
            .order_by(AgentChatMessage.id.asc())
            .all()
        )
        actions = (
            db.query(AgentAction)
            .filter(AgentAction.user_id == current_user.id, AgentAction.assignment_id.in_(ids))
            .order_by(AgentAction.id.asc())
            .all()
        )

    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": current_user.id,
            "public_id": getattr(current_user, "public_id", None),
        },
        "scope": scope,
        "filter": {"assignment_id": assignment_id, "bubble": bubble},
        "assignments": [_assignment_out(a) for a in rows],
        "materials": [
            {
                "id": m.id,
                "assignment_id": m.assignment_id,
                "kind": m.kind,
                "content": m.content,
                "model_used": m.model_used,
                "created_at": _iso(m.created_at),
            }
            for m in materials
        ],
        "messages": [
            {
                "id": msg.id,
                "target_key": msg.target_key,
                "sender": msg.sender,
                "text": msg.text,
                "created_at": _iso(msg.created_at),
            }
            for msg in messages
        ],
        "agent_actions": [
            {
                "id": ac.id,
                "assignment_id": ac.assignment_id,
                "action_type": ac.action_type,
                "summary": ac.summary,
                "payload": ac.payload,
                "status": ac.status,
                "created_at": _iso(ac.created_at),
                "undone_at": _iso(ac.undone_at),
            }
            for ac in actions
        ],
    }
    slug = re.sub(r"[^a-z0-9-]+", "-", str(scope or "all").lower()).strip("-") or "all"
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="helpotron-{slug}.json"'},
    )


# ─── Direction picker ─────────────────────────────────────────────────────────

def _direction_state(a: Assignment) -> Dict[str, Any]:
    return {
        "id": a.id,
        "status": a.status,
        "bucket": bucket_for(a.status),
        "direction": (a.progress or {}).get("direction"),
        "options": DIRECTIONS,
    }


@router.get("/{assignment_id}/direction")
async def get_direction(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Direction picker state for one of the caller's OWN assignments: current
    status, lifecycle bucket, current direction (if chosen) and the options."""
    assignment = _get_owned_assignment(assignment_id, current_user.id, db)
    return _direction_state(assignment)


@router.post("/{assignment_id}/choose-direction")
async def choose_direction(
    assignment_id: int,
    body: DirectionChoice,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply the chosen direction to one of the caller's own assignments.

    Moves pending_approval → in_progress, records the direction in progress
    and (best-effort) triggers the sub-agent team. A ``custom`` direction
    whose text matches no known capability is logged to the Data Lake instead
    (datalake_requested: true in the response). 400 for an invalid direction,
    404 for an unknown/foreign assignment.
    """
    assignment = _get_owned_assignment(assignment_id, current_user.id, db)
    direction = (body.direction or "").strip().lower()
    if direction not in DIRECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid direction: {body.direction}")
    try:
        result = await apply_direction(db, current_user, assignment, direction, body.custom_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"assignment_id": assignment.id, **result}


@router.post("/{assignment_id}/mark-done")
async def mark_done_route(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark one of the caller's own assignments done (completed bucket)."""
    assignment = _get_owned_assignment(assignment_id, current_user.id, db)
    result = await mark_done(db, current_user, assignment)
    return {"assignment_id": assignment.id, **result}


@router.post("/{assignment_id}/archive")
async def archive_route(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Archive one of the caller's own assignments (assignment history bucket)."""
    assignment = _get_owned_assignment(assignment_id, current_user.id, db)
    result = await archive(db, current_user, assignment)
    return {"assignment_id": assignment.id, **result}
