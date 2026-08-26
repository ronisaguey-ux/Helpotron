"""FastAPI routes for Training & Feedback Data Lake, Micro-Credits System, and Intelligence Agent."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import DataSubmission, User, get_db
from .routes_features import get_current_authenticated_user
from .datalake import datalake_manager, datalake_agent
from .user_settings_service import user_settings_service

router = APIRouter(prefix="/api", tags=["datalake"])


class FeedbackSubmission(BaseModel):
    category: str = Field(..., description="feature_request | bug_report | general | praise | academic_integrity")
    urgency: str = Field("medium", description="low | medium | high | critical")
    message: str = Field(..., min_length=3, max_length=4000)
    user_id: Optional[str] = None
    feature_tag: Optional[str] = None


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(..., description="new | reviewing | planned | resolved")


class MicroCreditSubmission(BaseModel):
    data_type: Optional[str] = None
    title: Optional[str] = None
    data_content: str = Field("", max_length=50000)
    user_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class MicroCreditRedeemRequest(BaseModel):
    amount_credits: Optional[int] = None
    amount: Optional[int] = None
    redemption_method: Optional[str] = "compute_credits"
    destination: Optional[str] = None
    user_id: Optional[str] = None


# ─── Feedback Routes ─────────────────────────────────────────────────────────

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


# ─── Micro-Credits Data Lake Submissions & Valuation Sub-Agent ───────────────

class ImplementDataLakePayload(BaseModel):
    actual_credits: Optional[int] = None


@router.post("/datalake/microcredits/submit")
async def submit_data_for_microcredits(
    payload: MicroCreditSubmission,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Submits structured empirical data to the Data Lake.

    Evaluated by the Data Quality Valuation Sub-Agent to produce an ESTIMATED score (0-25 cr).
    Actual credits are only awarded once reviewed and implemented into Helpotron.
    Identity comes from the session — client-supplied user_id is ignored (BATCH-04 IDOR fix).
    """
    user_id = current_user.public_id
    result = datalake_manager.evaluate_and_record_microcredit_submission(
        user_id=user_id,
        data_type=payload.data_type,
        title=payload.title,
        data_content=payload.data_content,
        metadata=payload.metadata,
    )

    # Balance is NOT incremented yet (only estimated pending review)
    user = db.query(User).filter(User.public_id == user_id).first()
    current_bal = 0
    if user:
        settings = user_settings_service.get_user_settings(user)
        current_bal = settings.get("micro_credits_balance", 0)
    result["current_balance"] = current_bal

    return {
        "status": "success",
        "submission": result,
    }


@router.post("/datalake/microcredits/{submission_id}/implement")
async def implement_datalake_submission(
    submission_id: str,
    payload: ImplementDataLakePayload,
    request: Request,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Reviews and implements a Data Lake entry, officially awarding actual micro-credits to the author.
    ADMIN ONLY — awarding credits is a privileged mutation (BATCH-04 IDOR fix)."""
    from .admin import require_admin
    require_admin(request)
    entry = datalake_manager.approve_and_implement_submission(submission_id, payload.actual_credits)
    if not entry:
        raise HTTPException(status_code=404, detail="Data Lake submission not found")

    author_id = entry.get("raw_user_id", current_user.public_id)
    awarded_amount = entry.get("actual_credits", 0)

    user = db.query(User).filter(User.public_id == author_id).first()
    new_bal = awarded_amount
    if user:
        settings = user_settings_service.get_user_settings(user)
        current_bal = settings.get("micro_credits_balance", 0)
        new_bal = current_bal + awarded_amount
        user_settings_service.update_user_settings(db, user, {"micro_credits_balance": new_bal})

    return {
        "status": "success",
        "message": f"Submission {submission_id} reviewed and implemented into Helpotron.",
        "actual_credits_awarded": awarded_amount,
        "new_balance": new_bal,
        "submission": entry,
    }


@router.get("/datalake/microcredits/history")
async def get_microcredits_history(
    user_id: Optional[str] = Query(None),  # legacy param; identity comes from the session (BATCH-04 IDOR fix)
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Fetches user's previous data submissions with estimated vs actual scores."""
    uid = current_user.public_id
    history = datalake_manager.list_microcredit_submissions(user_id=uid)
    user = db.query(User).filter(User.public_id == uid).first()
    balance = 0
    if user:
        settings = user_settings_service.get_user_settings(user)
        balance = settings.get("micro_credits_balance", 0)

    return {
        "status": "success",
        "count": len(history),
        "balance": balance,
        "history": history,
    }


@router.post("/datalake/microcredits/redeem")
async def redeem_microcredits(
    payload: MicroCreditRedeemRequest,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Redeems Micro-Credits strictly for Helpotron AI compute credits (Credits cannot be cashed out)."""
    user_id = current_user.public_id
    user = db.query(User).filter(User.public_id == user_id).first()

    credits_to_redeem = payload.amount_credits or payload.amount or 20
    # Strict platform compute credit policy: credits cannot be cashed out to external accounts
    method = "compute_credits"

    compute_credits_gained = credits_to_redeem * 10  # 10 compute credits per micro-credit

    if user:
        settings = user_settings_service.get_user_settings(user)
        bal = settings.get("micro_credits_balance", 0)
        if bal < credits_to_redeem:
            raise HTTPException(status_code=400, detail=f"Insufficient micro-credits balance ({bal} available)")

        new_bal = bal - credits_to_redeem
        user_settings_service.update_user_settings(db, user, {"micro_credits_balance": new_bal})

        user.credits = (user.credits or 0) + compute_credits_gained
        db.commit()

    return {
        "status": "success",
        "redeemed_microcredits": credits_to_redeem,
        "compute_credits_credited": compute_credits_gained,
        "redemption_method": "compute_credits",
        "message": f"Successfully converted {credits_to_redeem} Data Lake Micro-Credits into +{compute_credits_gained} Helpotron Compute Credits for platform use.",
    }


# ─── Data Lake Intelligence Insights ─────────────────────────────────────────

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
    microcredits = datalake_manager.list_microcredit_submissions(limit=5000)
    return {
        "status": "success",
        "total_telemetry_events": len(telemetry),
        "total_feedback_submissions": len(feedback),
        "total_microcredit_submissions": len(microcredits),
        "telemetry_breakdown": {
            "assignment_evasion": sum(1 for e in telemetry if e.get("event_type") == "assignment_evasion"),
            "gdocs_export": sum(1 for e in telemetry if e.get("event_type") == "gdocs_export"),
            "custom": sum(1 for e in telemetry if e.get("event_type") not in ("assignment_evasion", "gdocs_export")),
        },
    }


# ── Remediation BATCH-04: IDOR-guarded data-lake entry deletion ─────────────
@router.delete("/datalake/{entry_id}")
def delete_datalake_entry(
    entry_id: int,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Deletes one data-lake submission with a strict ownership check."""
    entry = db.query(DataSubmission).filter(DataSubmission.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Data lake entry not found")
    if entry.user_id != current_user.id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Cannot delete resources uploaded by another user")
    db.delete(entry)
    db.commit()
    return {"status": "success", "message": f"Data lake entry {entry_id} deleted."}
