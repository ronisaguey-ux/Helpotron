"""FastAPI routes for Training & Feedback Data Lake and Intelligence Agent."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import get_db
from .datalake import datalake_manager, datalake_agent

router = APIRouter(prefix="/api", tags=["datalake"])


class FeedbackSubmission(BaseModel):
    category: str = Field(..., description="feature_request | bug_report | general | praise | academic_integrity")
    urgency: str = Field("medium", description="low | medium | high | critical")
    message: str = Field(..., min_length=3, max_length=4000)
    user_id: Optional[str] = None
    feature_tag: Optional[str] = None


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(..., description="new | reviewing | planned | resolved")


@router.post("/feedback/submit")
async def submit_user_feedback(payload: FeedbackSubmission):
    """Submits user feedback into the Data Lake with categorization and urgency tagging."""
    entry = datalake_manager.record_feedback(
        category=payload.category,
        urgency=payload.urgency,
        message=payload.message,
        user_id=payload.user_id,
        feature_tag=payload.feature_tag,
    )
    return {"status": "success", "feedback": entry}


@router.get("/feedback/list")
async def list_user_feedback(
    category: Optional[str] = None,
    urgency: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Retrieves filtered feedback entries."""
    items = datalake_manager.list_feedback(
        category=category,
        urgency=urgency,
        status=status,
        limit=limit,
    )
    return {"status": "success", "count": len(items), "feedback": items}


@router.patch("/feedback/{feedback_id}")
async def update_feedback_status_route(feedback_id: str, payload: FeedbackStatusUpdate):
    """Updates feedback resolution status."""
    ok = datalake_manager.update_feedback_status(feedback_id, payload.status)
    if not ok:
        raise HTTPException(status_code=404, detail="Feedback entry not found")
    return {"status": "success", "feedback_id": feedback_id, "new_status": payload.status}


@router.get("/datalake/insights")
async def get_datalake_insights():
    """Fetches synthesized insights, pattern discovery, and performance metrics from the Data Lake."""
    insights = await datalake_agent.analyze_lake()
    return {"status": "success", "insights": insights}


@router.post("/datalake/analyze")
async def trigger_datalake_analysis():
    """Manually triggers the intelligence processing cycle across the Data Lake."""
    insights = await datalake_agent.analyze_lake()
    return {"status": "analysis_completed", "insights": insights}


@router.get("/datalake/stats")
async def get_datalake_stats():
    """Returns high-level event counts and telemetry health."""
    telemetry = datalake_manager.get_raw_telemetry(limit=5000)
    feedback = datalake_manager.list_feedback(limit=5000)
    return {
        "status": "success",
        "total_telemetry_events": len(telemetry),
        "total_feedback_submissions": len(feedback),
        "telemetry_breakdown": {
            "assignment_evasion": sum(1 for e in telemetry if e.get("event_type") == "assignment_evasion"),
            "gdocs_export": sum(1 for e in telemetry if e.get("event_type") == "gdocs_export"),
            "custom": sum(1 for e in telemetry if e.get("event_type") not in ("assignment_evasion", "gdocs_export")),
        },
    }
