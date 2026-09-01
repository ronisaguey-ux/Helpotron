"""Assignment routes with strict ownership checks (remediation BATCH-04).

Plan section: IDOR elimination — every assignment-scoped endpoint filters
on ``Assignment.user_id == current_user.id`` and returns 404 (not 403) for
foreign resources, so a user can never read or delete another user's
assignment even with a valid token.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import Assignment, User, get_db
from .security import get_current_user

router = APIRouter(tags=["assignments"])


class AssignmentIn(BaseModel):
    canvas_id: Optional[str] = None
    title: str
    due_date: Optional[str] = None
    prompt: str = ""
    file_urls: Optional[List[str]] = None


class AssignmentUpdate(BaseModel):
    """Partial update (My Agent edit-assignment flow, 08-22) — every field
    optional; only provided fields change. progress dicts deep-merge into the
    existing progress map so a status flip never wipes section state."""

    title: Optional[str] = None
    due_date: Optional[str] = None
    prompt: Optional[str] = None
    file_urls: Optional[List[str]] = None
    status: Optional[str] = None
    progress: Optional[Dict[str, Any]] = None


def _assignment_out(a: Assignment) -> Dict[str, Any]:
    return {
        "id": a.id,
        "canvas_id": a.canvas_id,
        "title": a.title,
        "due_date": a.due_date,
        "prompt": a.prompt,
        "file_urls": a.file_urls or [],
        "status": a.status,
        "progress": a.progress or {},
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "turned_in": bool(a.turned_in),
        "turned_in_at": a.turned_in_at.isoformat() if a.turned_in_at else None,
    }


def _get_owned_assignment(assignment_id: int, user_id: int, db: Session) -> Assignment:
    """Fetch an assignment that belongs to the caller, or 404."""
    assignment = (
        db.query(Assignment)
        .filter(Assignment.id == assignment_id, Assignment.user_id == user_id)
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found or unauthorized")
    return assignment


@router.get("/api/assignments")
@router.get("/assignments")
async def list_assignments(
    history: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's own assignments.

    ``history`` (optional): ``false`` = active only (not turned in),
    ``true`` = turned-in only (assignment history). Omitted = all
    assignments (legacy behavior, nothing filtered).
    """
    q = db.query(Assignment).filter(Assignment.user_id == current_user.id)
    if history is True:
        q = q.filter(Assignment.turned_in == True)  # noqa: E712
    elif history is False:
        q = q.filter(Assignment.turned_in == False)  # noqa: E712
    rows = q.order_by(Assignment.id.desc()).limit(200).all()
    return {"assignments": [_assignment_out(a) for a in rows]}


@router.post("/assignments")
async def create_assignment(
    body: AssignmentIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create an assignment owned by the authenticated user."""
    assignment = Assignment(user_id=current_user.id)
    if body.canvas_id:
        existing = (
            db.query(Assignment)
            .filter(Assignment.user_id == current_user.id, Assignment.canvas_id == body.canvas_id)
            .first()
        )
        if existing:
            assignment = existing
    assignment.canvas_id = body.canvas_id
    assignment.title = body.title
    assignment.due_date = body.due_date
    assignment.prompt = body.prompt
    assignment.file_urls = body.file_urls or []
    if assignment.id is None:
        # 09-01: new assignments await the user's direction (lifecycle:
        # pending_approval → in_progress → completed → archived). An explicit
        # status is never passed by this endpoint, so the new default applies;
        # re-scrapes of an existing row keep their current status.
        assignment.status = assignment.status or "pending_approval"
        db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return {"assignment_id": assignment.id, "status": assignment.status}


@router.get("/assignments/{assignment_id}")
async def get_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one of the caller's own assignments (IDOR-safe)."""
    return _assignment_out(_get_owned_assignment(assignment_id, current_user.id, db))


@router.get("/assignments/{assignment_id}/subagent-team")
@router.get("/api/assignments/{assignment_id}/subagent-team")
async def get_subagent_team_status(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Live sub-agent team snapshot for one of the caller's OWN assignments.

    Delegates to the real db-backed status in server.subagents (derived from
    Assignment.status/progress — never hardcoded). IDOR-safe: foreign
    assignments 404 like every other assignment route.
    """
    _get_owned_assignment(assignment_id, current_user.id, db)  # 404 for foreign
    from .subagents import get_assignment_subagent_team_status
    return get_assignment_subagent_team_status(assignment_id, db)


@router.patch("/api/assignments/{assignment_id}")
@router.patch("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: int,
    payload: AssignmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partially update one of the caller's own assignments (IDOR-safe, 404 for foreign).

    Used by the personal agent when it edits an assignment on the user's
    behalf ("change the due date", "mark section 2 done", ...).
    """
    assignment = _get_owned_assignment(assignment_id, current_user.id, db)
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    if "status" in fields:
        allowed = {"tracked", "not_started", "in_progress", "completed", "submitted", "graded", "paused"}
        if fields["status"] not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid status: {fields['status']}")
        assignment.status = fields["status"]
    if "progress" in fields and isinstance(fields["progress"], dict):
        merged = dict(assignment.progress or {})
        merged.update(fields["progress"])
        assignment.progress = merged
    for key in ("title", "due_date", "prompt", "file_urls"):
        if key in fields:
            setattr(assignment, key, fields[key])
    db.commit()
    db.refresh(assignment)
    return {"status": "success", "assignment": _assignment_out(assignment)}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an assignment only if it belongs to the authenticated user.

    The ownership filter runs in the same query as the fetch: a foreign
    assignment is indistinguishable from a missing one (404), so the
    response never leaks another user's resource state.
    """
    assignment = _get_owned_assignment(assignment_id, current_user.id, db)
    db.delete(assignment)
    db.commit()
    return {"status": "success", "deleted_id": assignment_id}
