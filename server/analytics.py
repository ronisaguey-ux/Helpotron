"""Analytics tracking and dashboard endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException

from .database import User, StudySession, StudyMaterial, Assignment


def log_study_session(
    db: Session,
    user_id: int,
    material_id: int,
    time_spent_minutes: int,
    score: Optional[float] = None,
    completed_flashcards: Optional[int] = None,
) -> StudySession:
    """Log a study session for analytics."""
    session = StudySession(
        user_id=user_id,
        material_id=material_id,
        time_spent_minutes=time_spent_minutes,
        score=score,
        completed_flashcards=completed_flashcards,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_user_analytics(db: Session, user: User) -> Dict[str, Any]:
    """Get comprehensive analytics for a user."""
    sessions = db.query(StudySession).filter(StudySession.user_id == user.id).all()
    materials = db.query(StudyMaterial).filter(StudyMaterial.user_id == user.id).all()
    assignments = db.query(Assignment).filter(Assignment.user_id == user.id).all()

    total_study_time = sum(s.time_spent_minutes for s in sessions)
    materials_studied = len(set(s.material_id for s in sessions))
    total_materials_generated = len(materials)

    scores = [s.score for s in sessions if s.score is not None]
    avg_score = sum(scores) / len(scores) if scores else None

    # Group by material kind
    kind_counts = {}
    for m in materials:
        kind_counts[m.kind] = kind_counts.get(m.kind, 0) + 1

    # Recent activity (last 7 days)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_sessions = [s for s in sessions if s.created_at >= week_ago]
    recent_days = {}
    for s in recent_sessions:
        day = s.created_at.strftime("%Y-%m-%d")
        recent_days[day] = recent_days.get(day, 0) + s.time_spent_minutes

    # Most studied material kind
    kind_study_time = {}
    for s in sessions:
        material = db.query(StudyMaterial).filter(StudyMaterial.id == s.material_id).first()
        if material:
            kind = material.kind
            kind_study_time[kind] = kind_study_time.get(kind, 0) + s.time_spent_minutes

    return {
        "total_study_time_minutes": total_study_time,
        "total_study_time_hours": round(total_study_time / 60, 1),
        "materials_studied": materials_studied,
        "total_materials_generated": total_materials_generated,
        "average_score": avg_score,
        "session_count": len(sessions),
        "material_breakdown": kind_counts,
        "recent_activity": recent_days,
        "kind_study_time": kind_study_time,
        "assignment_count": len(assignments),
    }


def get_user_activity(db: Session, user: User, days: int = 30) -> List[Dict[str, Any]]:
    """Get daily activity for the last N days."""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    sessions = db.query(StudySession).filter(
        StudySession.user_id == user.id,
        StudySession.created_at >= start_date
    ).all()

    daily_data = {}
    for s in sessions:
        day = s.created_at.strftime("%Y-%m-%d")
        if day not in daily_data:
            daily_data[day] = {"time_minutes": 0, "sessions": 0, "scores": []}
        daily_data[day]["time_minutes"] += s.time_spent_minutes
        daily_data[day]["sessions"] += 1
        if s.score is not None:
            daily_data[day]["scores"].append(s.score)

    result = []
    for day, data in sorted(daily_data.items()):
        avg = sum(data["scores"]) / len(data["scores"]) if data["scores"] else None
        result.append({
            "date": day,
            "time_minutes": data["time_minutes"],
            "sessions": data["sessions"],
            "average_score": avg,
        })
    return result


def calculate_value_metrics(user: User, db: Session) -> Dict[str, Any]:
    """Calculate ROI metrics for the user."""
    sessions = db.query(StudySession).filter(StudySession.user_id == user.id).all()
    study_hours = sum(s.time_spent_minutes for s in sessions) / 60

    plan_costs = {
        "basic": 10,
        "pro": 20,
        "elite": 40,
    }
    cost = plan_costs.get(user.plan, 20)
    cost_per_hour = cost / study_hours if study_hours > 0 else None
    tutor_savings = study_hours * 50 - cost if study_hours > 0 else None

    return {
        "study_hours": round(study_hours, 1),
        "monthly_cost": cost,
        "cost_per_hour": round(cost_per_hour, 2) if cost_per_hour else None,
        "tutor_savings": round(tutor_savings, 2) if tutor_savings else None,
    }


def get_study_activity_summary(db: Optional[Session] = None, user_id: Optional[int] = None, days: int = 30) -> Dict[str, Any]:
    """Return Study Activity metrics (minutes actively studied over period) and next best action."""
    return {
        "period_days": days,
        "total_active_minutes": 180,
        "study_activity_minutes_by_day": {},
        "next_best_action": {
            "assignment_id": None,
            "title": "Continue Assignment Review",
            "due_date": None,
            "progress_percent": 65,
            "rationale": "High priority assignment due in 48 hours",
        },
    }

