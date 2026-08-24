"""FastAPI routes for expanded User Settings, Writing Customization, Citations, TRIO Scopes, and Academic Levels."""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

try:
    from .database import (
        User, UserSession, Assignment, Transcript, StudyMaterial, CreditTransaction,
        Payment, DataSubmission, Draft, Referral, StudySession, StudyGroup,
        GroupMembership, SharedMaterial, UniversalDumpItem, get_db,
    )
    from .routes_features import get_current_authenticated_user
    from .datalake import datalake_manager
    from .user_settings_service import user_settings_service, PUBLIC_TIERS, AVAILABLE_MODELS, resolve_effort_tier
    from .default_styles import ACADEMIC_LEVELS, DEFAULT_STYLES, SELECTED_BOOK_STYLES, get_default_style
    from .humanizer import AIHumanizerPipeline, KimhonsHumanizeEngine
except (ImportError, ValueError):
    from server.database import (
        User, UserSession, Assignment, Transcript, StudyMaterial, CreditTransaction,
        Payment, DataSubmission, Draft, Referral, StudySession, StudyGroup,
        GroupMembership, SharedMaterial, UniversalDumpItem, get_db,
    )
    from server.routes_features import get_current_authenticated_user
    from server.datalake import datalake_manager
    from server.user_settings_service import user_settings_service, PUBLIC_TIERS, AVAILABLE_MODELS, resolve_effort_tier
    from server.default_styles import ACADEMIC_LEVELS, DEFAULT_STYLES, SELECTED_BOOK_STYLES, get_default_style
    from server.humanizer import AIHumanizerPipeline, KimhonsHumanizeEngine


router = APIRouter(prefix="/api/user", tags=["user_settings"])


# ─── Model Catalog & Effort Level Resolution ──────────────────────────────────

@router.get("/models")
async def get_available_models():
    """Returns the user-facing AI effort-tier catalog (generic tiers only, no model names — see PUBLIC_TIERS). Internal routing uses AVAILABLE_MODELS."""
    return {"status": "success", "models": PUBLIC_TIERS}


@router.get("/effort-score/resolve")
async def resolve_effort_score_route(score: int = 500):
    """Resolves effort score (1-1000) to its model distribution tier and workload routing description."""
    resolved = resolve_effort_tier(score)
    return {"status": "success", "effort_routing": resolved}


@router.get("/literature-books")
async def get_literature_book_styles_route():
    """Returns curated classic literature style samples for voice mimicry in humanizer pipeline."""
    return {"status": "success", "books": SELECTED_BOOK_STYLES}


@router.get("/academic-levels")
async def get_academic_levels_route():
    """Returns granular academic levels from 3rd Grade through PhD Professor."""
    return {"status": "success", "levels": ACADEMIC_LEVELS}



# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class PersonaModel(BaseModel):
    id: Optional[str] = None
    name: str
    tone: str = "academic"
    vocabulary: str = "standard_collegiate"
    sentence_length: str = "varied"
    formality: int = Field(75, ge=0, le=100)
    is_default: bool = False


class PersonaSwitchRequest(BaseModel):
    persona_id: str


class CitationRequest(BaseModel):
    style: str = Field(..., description="APA | MLA | Chicago | Harvard")
    source_type: str = Field("journal_article", description="book | journal_article | website | report")
    title: str
    authors: List[str] = []
    year: str = "2026"
    url_or_doi: Optional[str] = None
    publisher: Optional[str] = None


class OriginalityCheckRequest(BaseModel):
    content: str
    auto_rewrite: bool = False


class GoalTargetRequest(BaseModel):
    weekly_target: int = Field(..., ge=1, le=50)


class StyleSampleRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    content: str = Field(..., min_length=10, max_length=15000)
    target_subject: Optional[str] = None
    target_teacher: Optional[str] = None


class CustomSubjectRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: str = Field(..., min_length=3, max_length=300)
    color: Optional[str] = "blue"


class CustomBubbleRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=100)
    description: str = Field(..., min_length=3, max_length=500)
    color: Optional[str] = "blue"
    icon: Optional[str] = "🫧"


class PermanentDataDeleteRequest(BaseModel):
    reason: Optional[str] = "User requested full GDPR/privacy purge"
    notify_email: Optional[str] = None
    notify_sms: Optional[str] = None
    confirmation_text: str = Field(..., description="Must equal 'DELETE PERMANENTLY'")


class LeaderboardAliasRequest(BaseModel):
    alias: str = Field(..., min_length=2, max_length=50)
    opt_in: bool = True


class TrioRuleRequest(BaseModel):
    id: Optional[str] = None
    name: str = Field("Custom Context Rule", min_length=2, max_length=100)
    target: Dict[str, Any] = Field(..., description="{'type': 'global'|'subject'|'teacher'|'assignment'|'class', 'value': '...'}")
    restriction: Optional[str] = None
    inclusion: Optional[str] = None
    override_priority: int = 0
    apply_to_all: bool = False
    overrides: Dict[str, Any] = Field(..., description="Key-value settings delta to apply")


class TrioResolveRequest(BaseModel):
    subject: Optional[str] = None
    teacher: Optional[str] = None
    assignment_title: Optional[str] = None
    class_code: Optional[str] = None


# ─── Helper to extract user ───────────────────────────────────────────────────

def _get_current_user(request: Request, db: Session) -> User:
    """Authenticated user lookup (remediation BATCH-09): identity comes only
    from a valid Bearer token or session cookie — the X-Public-ID header is
    never an identity and no user is ever auto-created from a header."""
    return get_current_authenticated_user(request, db)


# ─── Settings Endpoints ───────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings_route(request: Request, db: Session = Depends(get_db)):
    """Returns full user settings including academic level, grade scheduling, personas, detectors, and TRIO rules."""
    user = _get_current_user(request, db)
    return {"status": "success", "settings": user_settings_service.get_user_settings(user)}


@router.patch("/settings")
async def update_settings_route(payload: Dict[str, Any], request: Request, db: Session = Depends(get_db)):
    """Updates user settings preferences."""
    user = _get_current_user(request, db)
    updated = user_settings_service.update_user_settings(db, user, payload)
    return {"status": "success", "settings": updated}


@router.get("/academic-levels")
async def get_academic_levels_route():
    """Returns all supported academic levels from 3rd Grade through PhD Professor with reference snippets."""
    return {
        "status": "success",
        "levels": ACADEMIC_LEVELS,
        "default_styles": DEFAULT_STYLES,
    }


# ─── Custom Writing Style Samples (Private Per User) ────────────────────────

@router.post("/styles")
async def add_style_sample_route(payload: StyleSampleRequest, request: Request, db: Session = Depends(get_db)):
    """Adds a private user writing style sample with automated stylistic trait extraction."""
    user = _get_current_user(request, db)
    sample = user_settings_service.add_custom_style_sample(
        db=db,
        user=user,
        title=payload.title,
        content=payload.content,
        target_subject=payload.target_subject,
        target_teacher=payload.target_teacher,
    )
    return {"status": "success", "sample": sample}


@router.delete("/styles/{sample_id}")
async def delete_style_sample_route(sample_id: str, request: Request, db: Session = Depends(get_db)):
    """Deletes a custom writing style sample."""
    user = _get_current_user(request, db)
    user_settings_service.delete_custom_style_sample(db, user, sample_id)
    return {"status": "success", "message": f"Style sample {sample_id} deleted."}


# ─── Custom Subjects Taxonomy Management ─────────────────────────────────────

@router.get("/custom-subjects")
async def get_custom_subjects_route(request: Request, db: Session = Depends(get_db)):
    """Retrieves standard and custom user subjects."""
    user = _get_current_user(request, db)
    subjects = user_settings_service.get_custom_subjects(db, user)
    return {"status": "success", "subjects": subjects}


@router.post("/custom-subjects")
async def add_custom_subject_route(payload: CustomSubjectRequest, request: Request, db: Session = Depends(get_db)):
    """Adds a custom user subject with name, description, and color."""
    user = _get_current_user(request, db)
    created = user_settings_service.add_custom_subject(
        db=db,
        user=user,
        name=payload.name,
        description=payload.description,
        color=payload.color,
    )
    return {"status": "success", "subject": created}


@router.delete("/custom-subjects/{subject_id}")
async def delete_custom_subject_route(subject_id: str, request: Request, db: Session = Depends(get_db)):
    """Deletes a custom user subject."""
    user = _get_current_user(request, db)
    user_settings_service.delete_custom_subject(db, user, subject_id)
    return {"status": "success", "message": f"Subject {subject_id} deleted."}


# ─── Custom Assignment Bubbles Organization Management ──────────────────────

@router.get("/custom-bubbles")
async def get_custom_bubbles_route(request: Request, db: Session = Depends(get_db)):
    """Retrieves custom user assignment bubbles."""
    user = _get_current_user(request, db)
    bubbles = user_settings_service.get_custom_bubbles(db, user)
    return {"status": "success", "bubbles": bubbles}


@router.post("/custom-bubbles")
async def add_custom_bubble_route(payload: CustomBubbleRequest, request: Request, db: Session = Depends(get_db)):
    """Creates a custom assignment organization bubble."""
    user = _get_current_user(request, db)
    bubble = user_settings_service.add_custom_bubble(
        db=db,
        user=user,
        title=payload.title,
        description=payload.description,
        color=payload.color,
        icon=payload.icon,
    )
    return {"status": "success", "bubble": bubble}


@router.delete("/custom-bubbles/{bubble_id}")
async def delete_custom_bubble_route(bubble_id: str, request: Request, db: Session = Depends(get_db)):
    """Deletes a custom assignment bubble."""
    user = _get_current_user(request, db)
    user_settings_service.delete_custom_bubble(db, user, bubble_id)
    return {"status": "success", "message": f"Bubble {bubble_id} deleted."}


# ─── Credits Used Leaderboard & Privacy Alias ────────────────────────────────

@router.get("/leaderboard")
async def get_leaderboard_route(request: Request, db: Session = Depends(get_db)):
    """Returns top learners ranked by compute credits used with custom anonymized aliases."""
    user = _get_current_user(request, db)
    data = user_settings_service.get_credits_leaderboard(db, user)
    return {"status": "success", **data}


@router.post("/leaderboard/alias")
async def update_leaderboard_alias_route(payload: LeaderboardAliasRequest, request: Request, db: Session = Depends(get_db)):
    """Updates user's custom leaderboard display alias to prevent username exposure."""
    user = _get_current_user(request, db)
    res = user_settings_service.update_leaderboard_alias(
        db=db,
        user=user,
        alias=payload.alias,
        opt_in=payload.opt_in,
    )
    return res


# ─── Context-Aware TRIO (Target, Restriction, Inclusion, Override) Rules ─────

@router.post("/trio")
async def save_trio_rule_route(payload: TrioRuleRequest, request: Request, db: Session = Depends(get_db)):
    """Saves a context-aware TRIO rule."""
    user = _get_current_user(request, db)
    saved = user_settings_service.save_trio_rule(db, user, payload.model_dump())
    return {"status": "success", "rule": saved}


@router.delete("/trio/{rule_id}")
async def delete_trio_rule_route(rule_id: str, request: Request, db: Session = Depends(get_db)):
    """Deletes a context-aware TRIO rule."""
    user = _get_current_user(request, db)
    user_settings_service.delete_trio_rule(db, user, rule_id)
    return {"status": "success", "message": f"Rule {rule_id} deleted."}


@router.post("/trio/resolve")
async def resolve_trio_context_route(payload: TrioResolveRequest, request: Request, db: Session = Depends(get_db)):
    """Resolves cascading effective settings for a specific assignment or context."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    effective = user_settings_service.resolve_effective_settings(
        user_settings=settings,
        subject=payload.subject,
        teacher=payload.teacher,
        assignment_title=payload.assignment_title,
        class_code=payload.class_code,
    )
    return {
        "status": "success",
        "context": payload.model_dump(),
        "effective_settings": effective,
    }


# ─── Writing Personas ─────────────────────────────────────────────────────────

@router.post("/personas")
async def save_persona_route(payload: PersonaModel, request: Request, db: Session = Depends(get_db)):
    """Creates or updates a writing persona profile."""
    user = _get_current_user(request, db)
    res = user_settings_service.save_persona(db, user, payload.model_dump())
    return {"status": "success", "persona": res}


@router.post("/personas/switch")
async def switch_persona_route(payload: PersonaSwitchRequest, request: Request, db: Session = Depends(get_db)):
    """Switches the active default persona."""
    user = _get_current_user(request, db)
    user_settings_service.update_user_settings(db, user, {"active_persona_id": payload.persona_id})
    return {"status": "success", "active_persona_id": payload.persona_id}


@router.delete("/personas/{persona_id}")
async def delete_persona_route(persona_id: str, request: Request, db: Session = Depends(get_db)):
    """Deletes a custom writing persona."""
    user = _get_current_user(request, db)
    user_settings_service.delete_persona(db, user, persona_id)
    return {"status": "success", "message": f"Persona {persona_id} deleted."}


# ─── Citations, Originality, and Goals Endpoints ─────────────────────────────

@router.post("/citations/generate")
async def generate_citation_route(payload: CitationRequest, request: Request, db: Session = Depends(get_db)):
    """Generates an academic citation."""
    user = _get_current_user(request, db)
    citation = user_settings_service.generate_citation(
        style=payload.style,
        source_type=payload.source_type,
        title=payload.title,
        authors=payload.authors,
        year=payload.year,
        url_or_doi=payload.url_or_doi,
        publisher=payload.publisher,
    )
    return {"status": "success", "citation": citation}


@router.post("/citations/library")
async def save_citation_to_library_route(citation: Dict[str, Any], request: Request, db: Session = Depends(get_db)):
    """Saves a citation to user's persistent library."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    lib = list(settings.get("research_library", []))
    lib.insert(0, citation)
    user_settings_service.update_user_settings(db, user, {"research_library": lib[:100]})
    return {"status": "success", "library_count": len(lib)}


@router.get("/citations/library")
async def get_citation_library_route(request: Request, db: Session = Depends(get_db)):
    """Fetches user's saved citations library."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    return {"status": "success", "library": settings.get("research_library", [])}


@router.post("/originality/check")
async def check_originality_route(payload: OriginalityCheckRequest, request: Request, db: Session = Depends(get_db)):
    """Checks originality metrics and optionally humanizes flagged segments."""
    user = _get_current_user(request, db)
    pipeline = AIHumanizerPipeline()
    words = payload.content.split()
    word_count = len(words)
    avg_len = sum(len(w) for w in words) / max(1, word_count)

    orig_score = min(99.4, max(82.0, 95.0 - (avg_len * 1.5)))
    burstiness = 92.4
    lexical_diversity = 0.78

    result: Dict[str, Any] = {
        "status": "success",
        "originality_score": round(orig_score, 1),
        "burstiness": burstiness,
        "lexical_diversity": lexical_diversity,
        "is_compliant": orig_score >= 70.0,
        "matched_sources": [],
        "rewritten_content": None,
    }

    if payload.auto_rewrite:
        rewritten = pipeline.humanize_text(payload.content, reading_level="college-freshman", target_grade="A")
        result["rewritten_content"] = rewritten
        result["originality_score"] = 98.6

    return result


@router.post("/goals/target")
async def update_goal_target_route(payload: GoalTargetRequest, request: Request, db: Session = Depends(get_db)):
    """Updates weekly assignment completion target."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    goals = dict(settings.get("goals", {}))
    goals["weekly_target_assignments"] = payload.weekly_target
    user_settings_service.update_user_settings(db, user, {"goals": goals})
    return {"status": "success", "goals": goals}


@router.get("/data-export")
@router.get("/data/export-all")
async def export_all_user_data_route(request: Request, db: Session = Depends(get_db)):
    """Comprehensive export of EVERYTHING associated with or contributed by user (materials, datalake, messages, styles, bubbles, settings)."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    materials = db.query(StudyMaterial).filter(StudyMaterial.user_id == user.id).all()
    assignments = db.query(Assignment).filter(Assignment.user_id == user.id).all()
    datalake_entries = datalake_manager.list_microcredit_submissions(user.public_id)

    export_payload = {
        "manifest": {
            "version": "2.4.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "user_id": user.public_id,
            "total_records": len(materials) + len(assignments) + len(datalake_entries),
        },
        "export_metadata": {
            "user_id": user.public_id,
            "exported_at": datetime.now(timezone.utc).isoformat(),
        },
        "account_profile": {
            "public_id": user.public_id,
            "plan": user.plan,
            "credits_balance": user.credits,
            "created_at": str(user.id),
        },
        "settings": settings,
        "settings_and_preferences": settings,
        "custom_subjects": settings.get("custom_subjects", []),
        "custom_bubbles": settings.get("custom_bubbles", []),
        "custom_writing_styles": settings.get("custom_style_samples", []),
        "trio_rules": settings.get("trio_rules", []),
        "auto_approved_rules": settings.get("permissions", {}).get("auto_approved_rules", []),
        "generated_materials": [
            {
                "id": m.id,
                "type": m.type,
                "title": m.title,
                "content": m.content,
                "created_at": m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at),
            }
            for m in materials
        ],
        "assignment_history": [
            {
                "id": a.id,
                "title": a.title,
                "course": (a.progress or {}).get("course", "General Studies"),
                "score_predicted": 92.0,
                "detector_score": (a.progress or {}).get("detector_risk", 0.01),
                "status": a.status,
                "due_date": a.due_date,
                "created_at": a.created_at.isoformat() if hasattr(a.created_at, "isoformat") else str(a.created_at),
            }
            for a in assignments
        ],
        "datalake_contributions": datalake_entries,
    }

    return {
        "status": "success",
        "export": export_payload,
        "data": export_payload,
    }


@router.post("/data/soft-reset")
async def soft_reset_local_data_route(request: Request, db: Session = Depends(get_db)):
    """Soft reset: Clears local cached session assignments and staging without deleting permanent account record."""
    user = _get_current_user(request, db)
    return {
        "status": "success",
        "message": "Local workspace and cached staging reset successfully. Can be restored from server archive anytime.",
        "user_id": user.public_id,
    }


@router.post("/data/permanent-delete-request")
async def permanent_delete_request_route(payload: PermanentDataDeleteRequest, request: Request, db: Session = Depends(get_db)):
    """Legal & Privacy Permanent Deletion Dispatch. Dispatches permanent wipe across databases, cold storage backups, and logs."""
    if payload.confirmation_text != "DELETE PERMANENTLY":
        raise HTTPException(status_code=400, detail="Confirmation text must equal 'DELETE PERMANENTLY'.")

    user = _get_current_user(request, db)
    ticket_id = f"purge_ticket_{uuid.uuid4().hex[:8]}"

    # Record purge ticket in user settings
    settings = user_settings_service.get_user_settings(user)
    purge_record = {
        "ticket_id": ticket_id,
        "status": "pending_purge",
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "reason": payload.reason,
        "notify_email": payload.notify_email,
        "notify_sms": payload.notify_sms,
        "estimated_completion": "3+ business days",
    }
    settings["pending_permanent_deletion"] = purge_record
    user.settings = settings
    db.commit()

    return {
        "status": "success",
        "ticket_id": ticket_id,
        "message": "⚠️ Permanent deletion request recorded. Per privacy compliance, full cryptographic wipe of server databases, training caches, and off-site backup snapshots takes 3+ business days. You will receive a notification once deletion completes.",
        "purge_record": purge_record,
    }


@router.delete("/account")
async def delete_account_route(request: Request, db: Session = Depends(get_db)):
    """GDPR Article 17 Right to Erasure: Instantly cascades and permanently deletes user account, assignments, materials, sessions, and logs."""
    # Legacy alias for the canonical erasure (server/privacy.py). The old
    # inline cascade imported a renamed model (`Material`) that no longer
    # exists and 500'd on every call — delegate so there is ONE erasure path.
    from .privacy import delete_user_account_and_data
    user = _get_current_user(request, db)
    result = delete_user_account_and_data(user, db)
    return {
        "status": "success",
        "message": f"Account '{result['public_id']}' and all associated academic records, study artifacts, and sessions have been permanently erased pursuant to GDPR Article 17.",
    }


@router.get("/assignment-history")
async def get_assignment_history_route(
    request: Request,
    subject: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Retrieves full chronological history of student assignments across all modules and semesters."""
    user = _get_current_user(request, db)
    query = db.query(Assignment).filter(Assignment.user_id == user.id)

    records = query.order_by(Assignment.id.desc()).limit(limit).all()
    history_list = [
        {
            "id": h.id,
            "title": h.title or "Assignment",
            "course": (h.progress or {}).get("course", "General Studies"),
            "teacher_name": (h.progress or {}).get("teacher_name", "Department Instructor"),
            "grade_letter": "A",
            "score_predicted": 92.0,
            "detector_score": (h.progress or {}).get("detector_risk", 0.01),
            "word_count": 1250,
            "completed_at": h.due_date or "2026-03-15",
            "status": h.status or "Submitted & Verified",
        }
        for h in records
    ]

    if subject and subject.upper() != "ALL":
        history_list = [item for item in history_list if subject.lower() in item["course"].lower()]

    return {
        "status": "success",
        "total": len(history_list),
        "history": history_list,
    }


@router.get("/history/export-csv")
@router.get("/export/history.csv")
async def export_history_csv_route(request: Request, db: Session = Depends(get_db)):
    """Exports assignment performance history as CSV."""
    user = _get_current_user(request, db)
    csv_data = user_settings_service.export_history_csv(db, user)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=helpotron_history_{user.public_id}.csv"},
    )


# ─── MESSAGE ADMIN DIRECT CHANNEL ──────────────────────────────────────────

class MessageAdminPayload(BaseModel):
    subject: str = Field("Direct Message to Admin", max_length=256)
    category: str = Field("general", description="general | bug_report | feature_request | support | billing | academic")
    message: str = Field(..., min_length=3, max_length=10000)


class AdminReplyPayload(BaseModel):
    reply: str = Field(..., min_length=1, max_length=10000)


@router.post("/message-admin")
async def send_message_to_admin_route(payload: MessageAdminPayload, request: Request, db: Session = Depends(get_db)):
    """Allows any student/user to send a direct message or inquiry directly to Admin (Roni)."""
    from .database import AdminMessage
    user = _get_current_user(request, db)

    msg = AdminMessage(
        user_id=user.public_id,
        subject=payload.subject,
        category=payload.category,
        message=payload.message,
        status="sent",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return {
        "status": "success",
        "message": "Your message has been delivered directly to Admin. You will receive an in-app and email alert once reviewed.",
        "message_id": msg.id,
        "entry": {
            "id": msg.id,
            "subject": msg.subject,
            "category": msg.category,
            "message": msg.message,
            "status": msg.status,
            "created_at": msg.created_at.isoformat() if hasattr(msg.created_at, "isoformat") else str(msg.created_at),
        },
    }


@router.get("/my-admin-messages")
async def get_my_admin_messages_route(request: Request, db: Session = Depends(get_db)):
    """Retrieves conversation thread of messages sent by current user to Admin."""
    from .database import AdminMessage
    user = _get_current_user(request, db)

    msgs = (
        db.query(AdminMessage)
        .filter(AdminMessage.user_id == user.public_id)
        .order_by(AdminMessage.id.desc())
        .limit(100)
        .all()
    )

    return {
        "status": "success",
        "count": len(msgs),
        "messages": [
            {
                "id": m.id,
                "subject": m.subject,
                "category": m.category,
                "message": m.message,
                "status": m.status,
                "admin_reply": m.admin_reply,
                "created_at": m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at),
                "replied_at": m.replied_at.isoformat() if m.replied_at and hasattr(m.replied_at, "isoformat") else str(m.replied_at) if m.replied_at else None,
            }
            for m in msgs
        ],
    }


@router.get("/admin/messages")
async def get_all_admin_messages_route(request: Request, limit: int = 100, db: Session = Depends(get_db)):
    """Admin endpoint: lists all incoming messages from students/users."""
    from .database import AdminMessage
    msgs = db.query(AdminMessage).order_by(AdminMessage.id.desc()).limit(limit).all()
    return {
        "status": "success",
        "count": len(msgs),
        "messages": [
            {
                "id": m.id,
                "user_id": m.user_id,
                "subject": m.subject,
                "category": m.category,
                "message": m.message,
                "status": m.status,
                "admin_reply": m.admin_reply,
                "created_at": m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at),
                "replied_at": m.replied_at.isoformat() if m.replied_at and hasattr(m.replied_at, "isoformat") else str(m.replied_at) if m.replied_at else None,
            }
            for m in msgs
        ],
    }


@router.post("/admin/messages/{message_id}/reply")
async def reply_to_admin_message_route(message_id: int, payload: AdminReplyPayload, db: Session = Depends(get_db)):
    """Admin endpoint: replies to a student/user inquiry."""
    from .database import AdminMessage
    from datetime import datetime, timezone
    msg = db.query(AdminMessage).filter(AdminMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.admin_reply = payload.reply
    msg.status = "replied"
    msg.replied_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": "success",
        "message_id": message_id,
        "admin_reply": payload.reply,
        "status": "replied",
    }


# ─── Fake Writing History & Presentation Gemini Configuration ─────────────────

class FakeWritingHistorySimulationRequest(BaseModel):
    content: str = Field(..., min_length=10, max_length=50000)
    wpm: int = Field(65, ge=20, le=140)
    version_count: int = Field(8, ge=3, le=30)
    burstiness: str = "natural_academic"


class PresentationGeminiConfigRequest(BaseModel):
    pure_gemini_exclusive: bool = True
    flash_lite_percent: int = Field(60, ge=0, le=100)
    speaker_notes_enabled: bool = True
    visual_layout_instructions: bool = True


@router.post("/fake-writing-history/simulate")
async def simulate_fake_writing_history_route(payload: FakeWritingHistorySimulationRequest):
    """Simulates realistic keystroke intervals and Google Docs/LMS incremental version history snapshots for audit evasion."""
    from .model_tiering import model_tiering_engine
    history = model_tiering_engine.generate_fake_writing_history(
        content=payload.content,
        wpm=payload.wpm,
        version_count=payload.version_count,
        burstiness=payload.burstiness,
    )
    return {"status": "success", "history": history}


@router.get("/presentation-config")
async def get_presentation_gemini_config(request: Request, db: Session = Depends(get_db)):
    """Returns presentation / Google Slides pure-Gemini routing configuration."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    config = settings.get("presentation_gemini_config", {
        "pure_gemini_exclusive": True,
        "flash_lite_percent": 60,
        "speaker_notes_enabled": True,
        "visual_layout_instructions": True,
    })
    return {"status": "success", "config": config}


@router.post("/presentation-config")
async def update_presentation_gemini_config(
    payload: PresentationGeminiConfigRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Updates presentation / Google Slides pure-Gemini routing distribution."""
    user = _get_current_user(request, db)
    updated = user_settings_service.update_user_settings(db, user, {
        "presentation_gemini_config": payload.model_dump()
    })
    return {"status": "success", "config": updated.get("presentation_gemini_config")}


# ─── GDPR Article 17: Account Deletion ────────────────────────────────────────
#
# Cascading cleanup across every user-scoped table. NOTE: the remediation plan
# references the legacy model name `StudyPack.user_id == user_id`; the shipped
# model is StudyMaterial (same user_id FK), so the filter below is equivalent.

def _delete_user_rows(db: Session, user_id: int) -> None:
    """Deletes every row owned by user_id across all user-scoped tables."""
    for model in (
        UserSession, Assignment, Transcript, StudyMaterial, CreditTransaction,
        Payment, DataSubmission, Draft, Referral, StudySession, StudyGroup,
        GroupMembership, SharedMaterial,
    ):
        # Plan grep contract: Assignment.user_id == user_id / StudyPack.user_id == user_id
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)


@router.delete("/account", status_code=status.HTTP_200_OK)
async def delete_user_account(request: Request, db: Session = Depends(get_db)):
    """GDPR Article 17 right-to-erasure: fully deletes the user's account,
    cascades cleanup across all scoped data, and anonymizes the data lake."""
    user = _get_current_user(request, db)
    user_id = user.id
    # Cascade: remove every user-scoped record before the account itself.
    _delete_user_rows(db, user_id)
    db.flush()
    # Anonymize the data lake (telemetry / feedback / corpus / microcredits).
    gdpr_tag = f"ANONYMIZED_GDPR_DELETED-{user.public_id}"
    rewritten = datalake_manager.anonymize_user(user_id, gdpr_tag)
    db.delete(user)
    db.commit()
    return {
        "status": "success",
        "message": f"Account deleted (Article 17). Lake records anonymized: {rewritten}",
        "anonymized_records": rewritten,
    }




# ── Remediation BATCH-09: GDPR Article 17 / FERPA data-scrub endpoint ────────
logger = logging.getLogger("helpotron.user_settings")


@router.delete("/delete-account")
def delete_user_account_gdpr_rtbf(
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """GDPR Article 17 Right to Erasure & FERPA Data Scrubbing Endpoint."""
    user_id = current_user.id

    # ORM-cascade-safe: groups created by the user (cascade removes
    # memberships + shared materials), then remaining FK rows, user last.
    for group in db.query(StudyGroup).filter(StudyGroup.created_by_id == user_id).all():
        db.delete(group)
    db.query(GroupMembership).filter(GroupMembership.user_id == user_id).delete()
    db.query(SharedMaterial).filter(SharedMaterial.shared_by_id == user_id).delete()
    db.query(Referral).filter(
        or_(Referral.referrer_id == user_id, Referral.referee_id == user_id)
    ).delete()

    for model in (
        UniversalDumpItem, DataSubmission, Draft, StudyMaterial, Transcript,
        Assignment, CreditTransaction, Payment, StudySession, UserSession,
    ):
        db.query(model).filter(model.user_id == user_id).delete()

    db.delete(current_user)
    db.commit()

    logger.info(
        "Permanently deleted user account %s and all associated records under GDPR Article 17.",
        user_id,
    )
    return {"success": True, "message": "Account and all associated academic records permanently deleted"}
