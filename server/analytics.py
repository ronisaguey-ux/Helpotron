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
    material_kinds = {m.id: m.kind for m in materials}
    missing_material_ids = {s.material_id for s in sessions if s.material_id and s.material_id not in material_kinds}
    if missing_material_ids:
        for m_id, m_kind in db.query(StudyMaterial.id, StudyMaterial.kind).filter(StudyMaterial.id.in_(missing_material_ids)).all():
            material_kinds[m_id] = m_kind

    kind_study_time = {}
    for s in sessions:
        kind = material_kinds.get(s.material_id)
        if kind:
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


def compute_next_best_action(db: Optional[Session], user_id: Optional[int]) -> Optional[Dict[str, Any]]:
    """The user's most urgent unfinished assignment, or None.

    Audit 08-29: the three call sites of this payload each returned a different
    invented recommendation ("Review Due Flashcards / 75% / spaced repetition
    scheduler identified cards due for review") with no scheduler behind it and
    no query run. Returning None when there is nothing due is the honest answer
    and lets callers render an empty state instead of a fabricated one.
    """
    if db is None or user_id is None:
        return None

    now = datetime.now(timezone.utc)
    # turned_in is its own boolean column, separate from status.
    pending = (
        db.query(Assignment)
        .filter(Assignment.user_id == user_id)
        .filter(Assignment.turned_in.isnot(True))
        .filter(Assignment.status.notin_(["completed", "archived"]))
        .all()
    )
    if not pending:
        return None

    def _due(a):
        """due_date is VARCHAR and is stored as '' when unset, not NULL."""
        raw = getattr(a, "due_date", None)
        raw = str(raw).strip() if raw is not None else ""
        return raw or None

    dated = [a for a in pending if _due(a)]
    target = min(dated, key=_due) if dated else pending[0]
    due = _due(target)

    rationale = f"Oldest of your {len(pending)} open assignments (no due date set)"
    if due:
        try:
            due_dt = datetime.fromisoformat(due)
            if due_dt.tzinfo is None:
                due_dt = due_dt.replace(tzinfo=timezone.utc)
            hours_left = (due_dt - now).total_seconds() / 3600
            rationale = (
                f"Overdue by {abs(round(hours_left))}h" if hours_left < 0
                else f"Due in {round(hours_left)}h"
            )
        except ValueError:
            # Free-text due date ("next Friday") — report it without inventing a delta.
            rationale = f"Earliest due date on record ({due})"

    return {
        "assignment_id": target.id,
        "title": (getattr(target, "title", None) or "").strip() or "Untitled assignment",
        "due_date": due,
        "rationale": rationale,
    }


def get_study_activity_summary(db: Optional[Session] = None, user_id: Optional[int] = None, days: int = 30) -> Dict[str, Any]:
    """Study-activity metrics over the trailing ``days`` window.

    Previously returned a fixed 180 minutes and an invented recommendation for
    every caller. Now queries real StudySession rows; with no db/user_id bound
    it reports an empty window rather than inventing one.
    """
    window_start = datetime.now(timezone.utc) - timedelta(days=days)
    by_day: Dict[str, int] = {}
    total_minutes = 0

    if db is not None and user_id is not None:
        sessions = (
            db.query(StudySession)
            .filter(StudySession.user_id == user_id)
            .filter(StudySession.created_at >= window_start)
            .all()
        )
        for s in sessions:
            minutes = s.time_spent_minutes or 0
            total_minutes += minutes
            day = s.created_at.strftime("%Y-%m-%d")
            by_day[day] = by_day.get(day, 0) + minutes

    return {
        "period_days": days,
        "total_active_minutes": total_minutes,
        "study_activity_minutes_by_day": by_day,
        "next_best_action": compute_next_best_action(db, user_id),
    }
