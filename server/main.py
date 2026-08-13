"""Helpotron Automator — FastAPI backend.

Study-tools product: assignment tracker (from the browser extension), lecture
transcription, study guides / flashcards / practice tests / 2-minute summaries
generated from the user's own transcripts, credits, payments, discounts.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from . import agent_session, credits, ratelimit, study_tools, transcription
from .agent_session import manager as agent_manager
from .config import config
from .database import Assignment, StudyMaterial, Transcript, User, get_db, init_db
from .payments import process_payment, refund_unused
from .draft import create_draft_task, start_draft_workflow, get_style, set_style, DRAFT_COST, MAX_RETRIES
from .routes_features import router as features_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("helpotron")

ALL_MATERIAL_KINDS = ("study_guide", "flashcards", "practice_test", "summary")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    for problem in config.validate():
        logger.warning("config: %s", problem)
    init_db()
    yield


app = FastAPI(title="Helpotron Automator", version="1.0.0", lifespan=lifespan)

# ─── rate limiting (dependency-free, in-memory) ────────────────────────────
# Per-IP: everything, 120 req/min. Per-user (JSON POSTs): 10/min on the
# LLM-costing paths, 30/min elsewhere. 429 with Retry-After when exceeded.
IP_LIMIT = 120
USER_STRICT_LIMIT = 10
USER_GENERAL_LIMIT = 30
STRICT_PATHS = ("/api/transcribe", "/api/agent/start", "/api/draft/generate")


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client = request.client.host if request.client else "unknown"
        if not ratelimit.limiter.allow(f"ip:{client}", IP_LIMIT):
            return JSONResponse({"detail": "rate limited"}, status_code=429,
                                headers={"Retry-After": "60"})
        ctype = request.headers.get("content-type", "")
        if request.method == "POST" and "application/json" in ctype:
            try:
                body = await request.body()
                request._body = body
                data = json.loads(body or b"{}")
                public_id = str(data.get("public_id") or "").strip()[:100]
            except Exception:
                public_id = ""
            if public_id and not ratelimit.limiter.allow(
                    f"user:{public_id}",
                    USER_STRICT_LIMIT if request.url.path in STRICT_PATHS else USER_GENERAL_LIMIT):
                return JSONResponse({"detail": "rate limited"}, status_code=429,
                                    headers={"Retry-After": "60"})
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.web_origin, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── include feature routes ────────────────────────────────────────────────
app.include_router(features_router)


# ─── helpers ───────────────────────────────────────────────────────────────

def get_or_create_user(db: Session, public_id: str) -> User:
    user = db.query(User).filter(User.public_id == public_id).first()
    if user is None:
        user = User(public_id=public_id, plan="basic", settings={"reading_level": "college-freshman"})
        db.add(user)
        db.flush()
    return user


def _material_payload(m: StudyMaterial) -> dict:
    content = m.content
    if m.kind in ("flashcards", "practice_test"):
        try:
            content = json.loads(content)
        except json.JSONDecodeError:
            pass
    return {
        "id": m.id,
        "kind": m.kind,
        "content": content,
        "created_at": m.created_at.isoformat(),
    }


class AssignmentsRequest(BaseModel):
    public_id: str
    assignments: list[dict]


class GenerateRequest(BaseModel):
    public_id: str
    assignment_id: int


class CreditsStatusRequest(BaseModel):
    public_id: str


class PaymentRequest(BaseModel):
    public_id: str
    provider: str
    amount_cents: int


class TranscriptUploadRequest(BaseModel):
    public_id: str
    assignment_id: int | None = None
    source: str = "upload"
    text: str
    duration_seconds: float | None = None


class SettingsRequest(BaseModel):
    public_id: str
    settings: dict


class DraftRequest(BaseModel):
    public_id: str
    assignment_id: int
    threshold: float = 80.0


class DraftRetryRequest(BaseModel):
    public_id: str
    draft_id: int


# ─── API routes ───────────────────────────────────────────────────────────

@app.get("/api/assignments")
async def list_assignments(public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    assignments = db.query(Assignment).filter(Assignment.user_id == user.id).all()
    return [{
        "id": a.id,
        "title": a.title,
        "due_date": a.due_date,
        "prompt": a.prompt[:500] + "..." if len(a.prompt) > 500 else a.prompt,
        "status": a.status,
        "progress": a.progress,
    } for a in assignments]


@app.post("/api/assignments")
async def create_assignments(req: AssignmentsRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, req.public_id)
    created = []
    for a in req.assignments:
        existing = db.query(Assignment).filter(
            Assignment.user_id == user.id,
            Assignment.title == a.get("title", ""),
            Assignment.prompt == a.get("prompt", ""),
        ).first()
        if existing:
            created.append({"id": existing.id, "status": "already exists"})
            continue
        assignment = Assignment(
            user_id=user.id,
            title=a.get("title", "Untitled"),
            due_date=a.get("due_date"),
            prompt=a.get("prompt", ""),
            file_urls=a.get("file_urls", []),
        )
        db.add(assignment)
        db.flush()
        created.append({"id": assignment.id, "status": "created"})
    db.commit()
    return {"created": created}


@app.get("/api/assignment/{assignment_id}")
async def get_assignment(assignment_id: int, public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id,
        Assignment.user_id == user.id
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    return {
        "id": assignment.id,
        "title": assignment.title,
        "due_date": assignment.due_date,
        "prompt": assignment.prompt,
        "file_urls": assignment.file_urls,
        "status": assignment.status,
        "progress": assignment.progress,
    }


@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...), public_id: str = Form(...), assignment_id: int | None = Form(None)):
    # Placeholder — real implementation would call Whisper API
    # For now, return a dummy transcript
    content = await file.read()
    return {
        "text": f"[Transcribed {len(content)} bytes of audio] This is a placeholder transcript for assignment {assignment_id or 'unknown'}.",
        "duration_seconds": 60.0,
    }


@app.post("/api/transcript")
async def save_transcript(req: TranscriptUploadRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, req.public_id)
    transcript = Transcript(
        user_id=user.id,
        assignment_id=req.assignment_id,
        source=req.source,
        text=req.text,
        duration_seconds=req.duration_seconds,
    )
    db.add(transcript)
    db.commit()
    return {"id": transcript.id}


@app.post("/api/generate")
async def generate_materials(req: GenerateRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, req.public_id)
    assignment = db.query(Assignment).filter(
        Assignment.id == req.assignment_id,
        Assignment.user_id == user.id
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    transcript = db.query(Transcript).filter(Transcript.assignment_id == assignment.id).first()
    context = assignment.prompt
    if transcript:
        context += "\n\nTranscript:\n" + transcript.text

    materials = []
    for kind in ALL_MATERIAL_KINDS:
        if kind == "study_guide":
            content = study_tools.generate_study_guide(context)
        elif kind == "flashcards":
            content = json.dumps(study_tools.generate_flashcards(context))
        elif kind == "practice_test":
            content = json.dumps(study_tools.generate_practice_test(context))
        elif kind == "summary":
            content = study_tools.generate_summary(context)
        material = StudyMaterial(
            user_id=user.id,
            assignment_id=assignment.id,
            transcript_id=transcript.id if transcript else None,
            kind=kind,
            content=content,
        )
        db.add(material)
        materials.append({"kind": kind, "content": content})
    assignment.status = "materials_ready"
    db.commit()
    return {"materials": materials}


@app.get("/api/materials")
async def list_materials(public_id: str, assignment_id: int | None = None, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    q = db.query(StudyMaterial).filter(StudyMaterial.user_id == user.id)
    if assignment_id:
        q = q.filter(StudyMaterial.assignment_id == assignment_id)
    materials = q.all()
    return [_material_payload(m) for m in materials]


@app.get("/api/credits")
async def get_credits(public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    return {
        "credits": user.credits,
        "plan": user.plan,
        "is_unlimited": user.plan == "elite",
        "discount_balance": user.discount_balance or 0.0,
        "discount_spillover": user.discount_spillover or 0.0,
    }


@app.post("/api/credits/topup")
async def topup_credits(req: PaymentRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, req.public_id)
    # Simulate payment processing
    amount_cents = req.amount_cents
    credits_added = amount_cents / 100  # $1 = 1 credit (for simplicity)
    user.credits += credits_added
    db.commit()
    return {"credits": user.credits}


@app.post("/api/settings")
async def update_settings(req: SettingsRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, req.public_id)
    user.settings = {**user.settings, **req.settings}
    db.commit()
    return {"settings": user.settings}


@app.get("/api/settings")
async def get_settings(public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    return user.settings or {}


# ─── Draft endpoints ─────────────────────────────────────────────────────

@app.post("/api/draft/generate")
async def draft_generate(req: DraftRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, req.public_id)
    assignment = db.query(Assignment).filter(
        Assignment.id == req.assignment_id,
        Assignment.user_id == user.id
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    if user.credits < DRAFT_COST:
        raise HTTPException(402, f"Insufficient credits (need {DRAFT_COST})")

    # Create draft task
    draft = create_draft_task(user.id, req.assignment_id, req.threshold)
    db.add(draft)
    user.credits -= DRAFT_COST
    db.commit()

    # Start workflow (async)
    asyncio.create_task(start_draft_workflow(draft.id))

    return {"draft_id": draft.id, "status": "pending"}


@app.get("/api/draft/{draft_id}")
async def get_draft_status(draft_id: int, public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    draft = db.query(Draft).filter(
        Draft.id == draft_id,
        Draft.user_id == user.id
    ).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    return {
        "id": draft.id,
        "status": draft.status,
        "draft_text": draft.draft_text,
        "average_score": draft.average_score,
        "detector_results": draft.detector_results,
        "attempts": draft.attempts,
        "retries_left": draft.retries_left,
        "last_error": draft.last_error,
    }


@app.post("/api/draft/retry")
async def draft_retry(req: DraftRetryRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, req.public_id)
    draft = db.query(Draft).filter(
        Draft.id == req.draft_id,
        Draft.user_id == user.id
    ).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    if draft.retries_left <= 0:
        raise HTTPException(400, "No retries left")
    if user.credits < DRAFT_COST:
        raise HTTPException(402, f"Insufficient credits (need {DRAFT_COST})")

    user.credits -= DRAFT_COST
    draft.retries_left -= 1
    draft.attempts += 1
    draft.status = "pending"
    db.commit()

    asyncio.create_task(start_draft_workflow(draft.id))
    return {"message": "Retry started"}


# ─── Style endpoints ─────────────────────────────────────────────────────

@app.post("/api/style")
async def set_user_style(public_id: str, style: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    set_style(user, style)
    db.commit()
    return {"style": style}


@app.get("/api/style")
async def get_user_style(public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    return {"style": get_style(user)}


# ─── Health check ────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}
