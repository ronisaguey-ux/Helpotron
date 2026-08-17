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
    public_id = request.headers.get("X-Public-ID") or request.query_params.get("public_id")
    if not public_id:
        user = db.query(User).first()
        if user:
            return user
        raise HTTPException(400, "Missing X-Public-ID header")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return user


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
    """Toggles simulator ON or OFF."""
    new_state = mock_simulator.toggle(payload.enabled)
    user = _get_current_user(request, db)
    # Auto-seed when toggled ON if empty
    if new_state:
        count = db.query(Assignment).filter(Assignment.user_id == user.id).count()
        if count < 3:
            mock_simulator.seed_user_data(db, user)
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
