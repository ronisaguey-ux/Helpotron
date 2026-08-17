"""FastAPI routes for expanded User Settings, Writing Personas, Citations, and Originality Check."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import User, get_db
from .user_settings_service import user_settings_service
from .humanizer import AIHumanizerPipeline

router = APIRouter(prefix="/api/user", tags=["user_settings"])


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


# ─── Helper to extract user ───────────────────────────────────────────────────

def _get_current_user(request: Request, db: Session) -> User:
    public_id = request.headers.get("X-Public-ID") or request.query_params.get("public_id")
    if not public_id:
        # Fallback to first user in test/dev
        user = db.query(User).first()
        if user:
            return user
        raise HTTPException(400, "Missing X-Public-ID header")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return user


# ─── Settings Endpoints ───────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings_route(request: Request, db: Session = Depends(get_db)):
    """Returns full user settings including personas, display, goals, and privacy."""
    user = _get_current_user(request, db)
    return {"status": "success", "settings": user_settings_service.get_user_settings(user)}


@router.patch("/settings")
async def update_settings_route(payload: Dict[str, Any], request: Request, db: Session = Depends(get_db)):
    """Updates user settings preferences."""
    user = _get_current_user(request, db)
    updated = user_settings_service.update_user_settings(db, user, payload)
    return {"status": "success", "settings": updated}


# ─── Writing Personas ─────────────────────────────────────────────────────────

@router.post("/personas")
async def save_persona_route(payload: PersonaModel, request: Request, db: Session = Depends(get_db)):
    """Creates or updates a writing persona profile."""
    user = _get_current_user(request, db)
    res = user_settings_service.save_persona(db, user, payload.model_dump())
    return {"status": "success", "persona": res}


@router.delete("/personas/{persona_id}")
async def delete_persona_route(persona_id: str, request: Request, db: Session = Depends(get_db)):
    """Deletes a custom writing persona."""
    user = _get_current_user(request, db)
    user_settings_service.delete_persona(db, user, persona_id)
    return {"status": "success", "message": f"Persona {persona_id} deleted."}


@router.post("/personas/switch")
async def switch_persona_route(payload: PersonaSwitchRequest, request: Request, db: Session = Depends(get_db)):
    """Switches the active writing persona."""
    user = _get_current_user(request, db)
    user_settings_service.update_user_settings(db, user, {"active_persona_id": payload.persona_id})
    return {"status": "success", "active_persona_id": payload.persona_id}


# ─── Assignment History & Export ──────────────────────────────────────────────

@router.get("/history")
async def get_history_route(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    subject: Optional[str] = None,
    status: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Queries detailed assignment history with filters."""
    user = _get_current_user(request, db)
    history = user_settings_service.query_assignment_history(db, user, date_from, date_to, subject, status)
    return {"status": "success", "count": len(history), "history": history}


@router.get("/history/export-csv")
async def export_history_csv_route(request: Request, db: Session = Depends(get_db)):
    """Exports assignment history as a CSV file."""
    user = _get_current_user(request, db)
    csv_data = user_settings_service.export_history_csv(db, user)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=assignment_history_{user.public_id}.csv"},
    )


# ─── Plagiarism & Originality Checker ─────────────────────────────────────────

@router.post("/originality/check")
async def check_originality_route(payload: OriginalityCheckRequest, request: Request, db: Session = Depends(get_db)):
    """Runs content through originality and plagiarism matcher."""
    user = _get_current_user(request, db)
    humanizer = AIHumanizerPipeline()
    metrics = await humanizer.calculate_burstiness_perplexity(payload.content)
    eval_res = await humanizer.evaluate_multi_checkers(payload.content)

    # Simulated plagiarism & originality match highlights
    words = payload.content.split()
    matched_sources = []
    if len(words) > 20:
        matched_sources.append({
            "source_title": "Academic Repository Cross-Check (arXiv/JSTOR)",
            "similarity_pct": round(max(2.0, 100.0 - eval_res["human_confidence_score"]) * 0.15, 1),
            "matched_snippet": " ".join(words[:min(12, len(words))]) + "...",
        })

    originality_score = eval_res["human_confidence_score"]
    rewritten_text = None

    if payload.auto_rewrite and originality_score < 80.0:
        rewritten_text, _ = await humanizer.humanize_loop(payload.content)

    return {
        "status": "success",
        "originality_score": originality_score,
        "burstiness": metrics["burstiness"],
        "lexical_diversity": metrics["perplexity_proxy"],
        "matched_sources": matched_sources,
        "is_compliant": originality_score >= 80.0,
        "rewritten_content": rewritten_text,
    }


# ─── Citations & Research Library ─────────────────────────────────────────────

@router.post("/citations/generate")
async def generate_citation_route(payload: CitationRequest, request: Request, db: Session = Depends(get_db)):
    """Generates formatted academic citations (APA, MLA, Chicago, Harvard)."""
    cit = user_settings_service.generate_citation(
        style=payload.style,
        source_type=payload.source_type,
        title=payload.title,
        authors=payload.authors,
        year=payload.year,
        url_or_doi=payload.url_or_doi,
        publisher=payload.publisher,
    )
    return {"status": "success", "citation": cit}


@router.get("/citations/library")
async def get_citation_library(request: Request, db: Session = Depends(get_db)):
    """Fetches user's saved research library citations."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    return {"status": "success", "library": settings.get("research_library", [])}


@router.post("/citations/library")
async def save_to_citation_library(citation: Dict[str, Any], request: Request, db: Session = Depends(get_db)):
    """Saves a citation to the user's research library."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    lib: List[Dict] = list(settings.get("research_library", []))
    lib.append(citation)
    user_settings_service.update_user_settings(db, user, {"research_library": lib})
    return {"status": "success", "library_count": len(lib)}



# ─── Goals & Streaks ──────────────────────────────────────────────────────────

@router.get("/goals")
async def get_goals_route(request: Request, db: Session = Depends(get_db)):
    """Fetches weekly goals, streak status, and earned badges."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    return {"status": "success", "goals": settings.get("goals", {})}


@router.post("/goals/target")
async def set_goal_target_route(payload: GoalTargetRequest, request: Request, db: Session = Depends(get_db)):
    """Updates weekly target assignments."""
    user = _get_current_user(request, db)
    settings = user_settings_service.get_user_settings(user)
    goals = settings.get("goals", {})
    goals["weekly_target_assignments"] = payload.weekly_target
    settings["goals"] = goals
    user.settings = settings
    db.commit()
    return {"status": "success", "goals": goals}


# ─── Privacy & GDPR Export ────────────────────────────────────────────────────

@router.get("/data-export")
async def export_data_route(request: Request, db: Session = Depends(get_db)):
    """Produces full GDPR-compliant JSON dump of all user data."""
    user = _get_current_user(request, db)
    data = user_settings_service.export_full_user_data(db, user)
    return {"status": "success", "data": data}


@router.delete("/delete-account")
async def delete_account_route(request: Request, db: Session = Depends(get_db)):
    """Permanently deletes user account and all personal assets."""
    user = _get_current_user(request, db)
    user_settings_service.delete_full_user_data(db, user)
    return {"status": "success", "message": "Account and all associated data permanently deleted."}
