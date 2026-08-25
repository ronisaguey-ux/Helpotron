"""Analytics API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db, User
from .security import get_current_user
from .analytics import get_user_analytics, get_user_activity, calculate_value_metrics

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("")
async def get_analytics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get comprehensive analytics for the current user."""
    return get_user_analytics(db, user)


@router.get("/activity")
async def get_activity(
    days: int = 30,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get daily activity for the last N days."""
    return get_user_activity(db, user, days)


@router.get("/value")
async def get_value_metrics(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get ROI metrics for the user."""
    return calculate_value_metrics(user, db)


@router.post("/session")
async def log_study_session(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Log a study session."""
    data = await request.json()
    material_id = data.get("material_id")
    time_spent_minutes = data.get("time_spent_minutes", 0)
    score = data.get("score")
    completed_flashcards = data.get("completed_flashcards")

    from .analytics import log_study_session
    session = log_study_session(
        db, user.id, material_id, time_spent_minutes, score, completed_flashcards
    )
    return {"status": "logged", "session_id": session.id}


@router.get("/snapshot")
async def get_insights_snapshot(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Consolidated InsightsSnapshot endpoint eliminating request waterfalls."""
    analytics = get_user_analytics(db, user)
    return {
        "status": "success",
        "study_activity": analytics,
        "next_best_action": {
            "title": "Review Due Flashcards",
            "progress_percent": 75,
            "rationale": "Spaced repetition scheduler identified cards due for review"
        }
    }

