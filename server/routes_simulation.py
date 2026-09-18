"""FastAPI routes for controlling the Mock Activity Simulator."""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import Assignment, User, get_db
from .mock_activity_simulator import mock_simulator

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class ToggleRequest(BaseModel):
    enabled: Optional[bool] = None


def _get_current_user(request: Request, db: Session) -> User:
    """Authenticated user lookup (remediation BATCH-11): identity comes only
    from a valid Bearer token or session cookie — the X-Public-ID header is
    never an identity and no user is auto-selected from the DB."""
    from .routes_features import get_current_authenticated_user
    return get_current_authenticated_user(request, db)
@router.get("/status")
async def get_simulation_status(request: Request, db: Session = Depends(get_db)):
    """Returns the current state of the mock activity simulator and seeded item count."""
    user = _get_current_user(request, db)
    assign_count = db.query(Assignment).filter(Assignment.user_id == user.id).count()
    return {
        "status": "success",
        "is_enabled": mock_simulator.is_enabled,
        "user_assignments_count": assign_count,
    }


@router.post("/toggle")
async def toggle_simulation(payload: ToggleRequest, request: Request, db: Session = Depends(get_db)):
    """Toggles simulator ON or OFF.

    Explicit opt-in only (operator 08-27): toggling no longer auto-seeds
    sample data into the user's real assignment tables — mock rows must be
    explicitly created via /api/simulation/seed, which is a dev/test action.
    """
    _get_current_user(request, db)
    new_state = mock_simulator.toggle(payload.enabled)
    return {
        "status": "success",
        "is_enabled": new_state,
        "message": f"Mock Activity Simulator is now {'ENABLED' if new_state else 'DISABLED'}.",
    }


@router.post("/seed")
async def seed_simulation_data(request: Request, db: Session = Depends(get_db)):
    """Explicitly seeds realistic mock assignments, analytics, and study materials."""
    user = _get_current_user(request, db)
    res = mock_simulator.seed_user_data(db, user)
    return {
        "status": "success",
        "is_enabled": mock_simulator.is_enabled,
        "result": res,
    }


@router.post("/clear")
async def clear_simulation_data(request: Request, db: Session = Depends(get_db)):
    """Removes mock assignments and resets test state."""
    user = _get_current_user(request, db)
    res = mock_simulator.clear_mock_data(db, user)
    return {
        "status": "success",
        "result": res,
    }
