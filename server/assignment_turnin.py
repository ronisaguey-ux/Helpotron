"""Assignment turn-in routes (feature 08-27: "mark as turned in").

A turned-in assignment leaves the active list and enters the assignment
history. Ownership is verified the same way as every other assignment route
(404 for foreign resources — see ``server.assignments``); only the OWNER can
turn an assignment in or undo the turn-in. No grade is created by turning in:
the status/progress dict is untouched, only the ``turned_in`` flag and the
real ``turned_in_at`` timestamp are recorded.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .assignments import _assignment_out, _get_owned_assignment
from .database import Assignment, User, get_db, utcnow
from .security import get_current_user

router = APIRouter(tags=["assignments-turn-in"])


class TurnInPayload(BaseModel):
    """Optional body for the turn-in PATCH.

    - ``{"turned_in": true}`` / empty body  → mark as turned in
    - ``{"turned_in": false}``              → undo (back to active)
    """

    turned_in: Optional[bool] = None


@router.patch("/api/assignments/{assignment_id}/turn-in")
@router.patch("/assignments/{assignment_id}/turn-in")
async def turn_in_assignment(
    assignment_id: int,
    payload: Optional[TurnInPayload] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Turn an assignment in — or undo the turn-in (``{"turned_in": false}``).

    IDOR-safe: only the owner can act; a foreign assignment is indistinguishable
    from a missing one (404).
    """
    assignment = _get_owned_assignment(assignment_id, current_user.id, db)
    turn_in = payload.turned_in if payload is not None else True
    if turn_in is None:
        turn_in = True  # PATCH with no body / "{}" means turn in

    was_turned_in = bool(assignment.turned_in)
    assignment.turned_in = bool(turn_in)
    if turn_in:
        # Preserve the FIRST real turn-in timestamp; only re-stamp if the
        # assignment was previously never turned in.
        if not was_turned_in:
            assignment.turned_in_at = utcnow()
    else:
        assignment.turned_in_at = None

    db.commit()
    db.refresh(assignment)
    return {
        "status": "success",
        "turned_in": bool(assignment.turned_in),
        "turned_in_at": assignment.turned_in_at.isoformat() if assignment.turned_in_at else None,
        "assignment": _assignment_out(assignment),
    }


@router.get("/api/assignments/turned-in")
@router.get("/assignments/turned-in")
async def list_turned_in_assignments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """History: the caller's turned-in assignments, newest first."""
    rows = (
        db.query(Assignment)
        .filter(Assignment.user_id == current_user.id, Assignment.turned_in == True)  # noqa: E712
        .order_by(Assignment.turned_in_at.desc(), Assignment.id.desc())
        .limit(500)
        .all()
    )
    return {"history": [_assignment_out(a) for a in rows], "total": len(rows)}


@router.get("/api/assignments/turned-in-count")
@router.get("/assignments/turned-in-count")
async def turned_in_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Small convenience head-count for badges/empty states."""
    count = (
        db.query(Assignment)
        .filter(Assignment.user_id == current_user.id, Assignment.turned_in == True)  # noqa: E712
        .count()
    )
    return {"count": count}
