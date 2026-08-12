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

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import agent_session, credits, study_tools, transcription
from .agent_session import manager as agent_manager
from .config import config
from .database import Assignment, StudyMaterial, Transcript, User, get_db, init_db
from .payments import process_payment, refund_unused

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("helpotron")

ALL_MATERIAL_KINDS = ("study_guide", "flashcards", "practice_test", "summary")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Helpotron Automator", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.web_origin, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        "model_used": m.model_used,
        "created_at": m.created_at.isoformat(),
    }


async def _generate(db: Session, user: User, kind: str, transcript_text: str,
                    assignment_prompt: str, reading_level: str | None,
                    assignment_id: int | None, transcript_id: int | None) -> StudyMaterial:
    # charge on success only — pre-charge then credit back on failure
    if not credits.charge(db, user, kind):
        raise HTTPException(402, "insufficient credits — top up at /api/payments")

    try:
        gen = study_tools.GENERATORS[kind]
        kwargs = {}
        if kind == "study_guide":
            content, model = await gen(transcript_text, assignment_prompt, reading_level)
            content = content
        elif kind == "flashcards":
            items, model = await gen(transcript_text, reading_level=reading_level)
            content = json.dumps(items, ensure_ascii=False)
        elif kind == "practice_test":
            data, model = await gen(transcript_text, reading_level=reading_level)
            content = json.dumps(data, ensure_ascii=False)
        else:  # summary
            content, model = await gen(transcript_text)
    except Exception:
        credits.top_up(db, user, credits.TASK_COSTS[kind], reason=f"refund:{kind}:failed")
        raise

    material = StudyMaterial(
        user_id=user.id, assignment_id=assignment_id, transcript_id=transcript_id,
        kind=kind, content=content, model_used=model,
    )
    db.add(material)
    db.flush()

    if assignment_id is not None:
        assignment = db.get(Assignment, assignment_id)
        if assignment:
            assignment.progress = {**assignment.progress, kind: True}
            if all(assignment.progress.get(k) for k in ALL_MATERIAL_KINDS):
                assignment.status = "materials_ready"
    return material


def _require_transcript(db: Session, public_id: str, transcript_id: int | None, raw_text: str) -> tuple[str, int | None]:
    if transcript_id is not None:
        t = db.get(Transcript, transcript_id)
        if t is None or t.user.public_id != public_id:
            raise HTTPException(404, "transcript not found")
        return t.text, t.id
    if raw_text.strip():
        return raw_text.strip(), None
    raise HTTPException(400, "transcript_id or transcript_text required")


# ─── models ────────────────────────────────────────────────────────────────

class AssignmentIn(BaseModel):
    public_id: str
    canvas_id: str | None = None
    title: str
    due_date: str | None = None
    prompt: str = ""
    file_urls: list[str] = Field(default_factory=list)


class GenerateIn(BaseModel):
    public_id: str
    transcript_id: int | None = None
    transcript_text: str = ""
    assignment_id: int | None = None
    assignment_prompt: str = ""
    reading_level: str | None = None


class UserIn(BaseModel):
    public_id: str
    telegram_id: str | None = None


class SettingsIn(BaseModel):
    public_id: str
    settings: dict


class PaymentIn(BaseModel):
    public_id: str
    provider: str
    amount_cents: int


class DiscountIn(BaseModel):
    public_id: str
    payload: dict


# ─── health ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ─── users ─────────────────────────────────────────────────────────────────

@app.post("/api/users")
def create_user(body: UserIn, db: Session = Depends(get_db)):
    user = get_or_create_user(db, body.public_id)
    if body.telegram_id:
        user.telegram_id = body.telegram_id
    db.commit()
    return {"public_id": user.public_id, "plan": user.plan, "credits": user.credits}


@app.patch("/api/users/{public_id}")
def update_settings(public_id: str, body: SettingsIn, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    user.settings = {**user.settings, **body.settings}
    db.commit()
    return {"settings": user.settings}


# ─── assignments (from extension) ──────────────────────────────────────────

@app.post("/api/assignments")
def upsert_assignment(body: AssignmentIn, db: Session = Depends(get_db)):
    user = get_or_create_user(db, body.public_id)
    assignment = None
    if body.canvas_id:
        assignment = db.query(Assignment).filter_by(user_id=user.id, canvas_id=body.canvas_id).first()
    if assignment is None:
        assignment = Assignment(user_id=user.id)
        db.add(assignment)
    assignment.canvas_id = body.canvas_id
    assignment.title = body.title
    assignment.due_date = body.due_date
    assignment.prompt = body.prompt
    assignment.file_urls = body.file_urls
    db.commit()
    return {"assignment_id": assignment.id, "status": assignment.status}


@app.get("/api/status/{public_id}")
def status(public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    db.commit()  # persist freshly created user
    out = []
    for a in db.query(Assignment).filter_by(user_id=user.id).order_by(Assignment.id.desc()).limit(50):
        out.append({
            "id": a.id, "title": a.title, "due_date": a.due_date, "status": a.status,
            "progress": a.progress, "created_at": a.created_at.isoformat(),
        })
    return {"assignments": out}


# ─── transcription ─────────────────────────────────────────────────────────

@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...),
                     public_id: str | None = Form(default=None),
                     public_id_q: str | None = Query(default=None),
                     assignment_id: int | None = Form(default=None),
                     assignment_id_q: int | None = Query(default=None),
                     db: Session = Depends(get_db)):
    # clients (extension recorder, web) send public_id/assignment_id as form
    # fields; curl and direct callers use query params — accept both
    public_id = public_id or public_id_q or "dev-user"
    assignment_id = assignment_id if assignment_id is not None else assignment_id_q
    user = get_or_create_user(db, public_id)
    db.commit()
    content = await file.read()
    if not content:
        raise HTTPException(400, "empty upload")
    path = transcription.save_upload(content, file.filename or "lecture.webm")
    try:
        text, duration = await transcription.transcribe_audio(path)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    if not text.strip():
        raise HTTPException(500, "transcription returned empty text")

    # charge: 1 credit per started hour of audio
    hours = max(1.0, math.ceil((duration or 3600.0) / 3600.0))
    if not (user.plan == "elite" or user.credits >= hours):
        raise HTTPException(402, "insufficient credits for transcription")
    if user.plan != "elite":
        user.credits -= hours
        db.add(credits.CreditTransaction(user_id=user.id, delta=-hours, reason=f"spend:transcription:{hours}h"))

    t = Transcript(user_id=user.id, assignment_id=assignment_id, source="upload",
                   text=text, duration_seconds=duration)
    db.add(t)
    db.flush()
    if assignment_id is not None:
        a = db.get(Assignment, assignment_id)
        if a and a.user_id == user.id:
            a.status = "transcribed"
            a.progress = {**a.progress, "transcribed": True}
    db.commit()
    return {"transcript_id": t.id, "chars": len(text), "duration_seconds": duration}


# ─── study materials ───────────────────────────────────────────────────────

@app.post("/api/study-guide")
async def study_guide(body: GenerateIn, db: Session = Depends(get_db)):
    return await _material_endpoint(db, body, "study_guide")


@app.post("/api/flashcards")
async def flashcards(body: GenerateIn, db: Session = Depends(get_db)):
    return await _material_endpoint(db, body, "flashcards")


@app.post("/api/practice-test")
async def practice_test(body: GenerateIn, db: Session = Depends(get_db)):
    return await _material_endpoint(db, body, "practice_test")


@app.post("/api/summary")
async def summary(body: GenerateIn, db: Session = Depends(get_db)):
    return await _material_endpoint(db, body, "summary")


async def _material_endpoint(db: Session, body: GenerateIn, kind: str) -> dict:
    user = get_or_create_user(db, body.public_id)
    db.commit()
    transcript_text, transcript_id = _require_transcript(db, body.public_id, body.transcript_id, body.transcript_text)
    try:
        material = await _generate(db, user, kind, transcript_text, body.assignment_prompt,
                                   body.reading_level, body.assignment_id, transcript_id)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))
    db.commit()
    return _material_payload(material)


@app.get("/api/materials/{public_id}/{kind}")
def materials(public_id: str, kind: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    if kind not in ALL_MATERIAL_KINDS:
        raise HTTPException(400, f"kind must be one of {ALL_MATERIAL_KINDS}")
    rows = (db.query(StudyMaterial).filter_by(user_id=user.id, kind=kind)
            .order_by(StudyMaterial.id.desc()).limit(20).all())
    return {"materials": [_material_payload(m) for m in rows]}


# ─── dashboard / credits ───────────────────────────────────────────────────

@app.get("/api/dashboard/{public_id}")
def dashboard(public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    db.commit()
    assignments = db.query(Assignment).filter_by(user_id=user.id).order_by(Assignment.id.desc()).limit(50).all()
    materials = db.query(StudyMaterial).filter_by(user_id=user.id).order_by(StudyMaterial.id.desc()).limit(50).all()
    transactions = db.query(credits.CreditTransaction).filter_by(user_id=user.id).order_by(
        credits.CreditTransaction.id.desc()).limit(20).all()
    monthly = credits.TIER_MONTHLY_CREDITS[user.plan]
    return {
        "public_id": user.public_id,
        "plan": user.plan,
        "credits": credits.get_balance(user),
        "monthly_credits": None if monthly == float("inf") else monthly,
        "settings": user.settings,
        "discount_balance": user.discount_balance,
        "assignments": [
            {"id": a.id, "title": a.title, "due_date": a.due_date, "status": a.status, "progress": a.progress}
            for a in assignments
        ],
        "materials": [_material_payload(m) for m in materials],
        "recent_transactions": [
            {"delta": t.delta, "reason": t.reason, "created_at": t.created_at.isoformat()}
            for t in transactions
        ],
    }


@app.get("/api/credits/{public_id}")
def credits_balance(public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    return {"plan": user.plan, "credits": credits.get_balance(user)}


# ─── payments / discounts ──────────────────────────────────────────────────

@app.post("/api/payments")
async def pay(body: PaymentIn, db: Session = Depends(get_db)):
    user = get_or_create_user(db, body.public_id)
    try:
        payment = await process_payment(db, user, body.provider, body.amount_cents)
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return {"payment_id": payment.id, "status": payment.status, "credits": credits.get_balance(user)}


@app.post("/api/refund")
def refund(public_id: str, payment_id: int, unused_fraction: float = 1.0, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    payment = db.get(credits.Payment, payment_id)
    if payment is None or payment.user_id != user.id:
        raise HTTPException(404, "payment not found")
    refunded = refund_unused(db, payment, unused_fraction)
    db.commit()
    return {"refunded_credits": refunded}


@app.post("/api/discount")
def discount(body: DiscountIn, db: Session = Depends(get_db)):
    user = get_or_create_user(db, body.public_id)
    result = credits.record_data_submission(db, user, body.payload)
    db.commit()
    return result


# ─── browser agent (extension "Activate") ─────────────────────────────────

class AgentStartIn(BaseModel):
    public_id: str
    assignment_id: int | None = None
    instruction: str = ""


@app.post("/api/agent/start")
async def agent_start(body: AgentStartIn, db: Session = Depends(get_db)):
    user = get_or_create_user(db, body.public_id)
    db.commit()
    if not credits.charge(db, user, "agent_session"):
        raise HTTPException(402, "insufficient credits — agent sessions cost 1 credit")
    db.commit()
    session = agent_manager.create(user.public_id, body.assignment_id, body.instruction)
    asyncio.create_task(_run_agent_and_persist(session))
    return {"session_id": session.session_id, "max_seconds": agent_session.MAX_SESSION_SECONDS}


async def _run_agent_and_persist(session: agent_session.AgentSession) -> None:
    """Run the agent; on success persist collected pages as a transcript, on
    failure with nothing collected refund the session credit."""
    await agent_manager.run(session)
    from .database import SessionLocal

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == session.public_id).first()
        if session.status == "done" and session.result_text and user:
            t = Transcript(user_id=user.id, assignment_id=session.assignment_id,
                           source="agent", text=session.result_text)
            db.add(t)
            db.flush()
            if session.assignment_id is not None:
                a = db.get(Assignment, session.assignment_id)
                if a is not None:
                    a.progress = {**a.progress, "collected": True}
                    a.status = "transcribed"
            db.commit()
            logger.info("agent %s collected %d chars -> transcript %d",
                        session.session_id, len(session.result_text), t.id)
        elif session.status in ("failed", "disconnected") and not session.result_text and user:
            credits.top_up(db, user, credits.TASK_COSTS["agent_session"],
                           reason="refund:agent:failed")
            db.commit()
            logger.info("agent %s failed with nothing collected; credit refunded", session.session_id)
    finally:
        db.close()


@app.get("/api/agent/{session_id}")
def agent_status(session_id: str, db: Session = Depends(get_db)):
    session = agent_manager.get(session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return session.snapshot()


@app.websocket("/ws/agent/{session_id}")
async def agent_ws(websocket: WebSocket, session_id: str):
    await agent_manager.attach(session_id, websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            await agent_manager.handle_result(session_id, msg)
    except Exception:
        pass
    finally:
        agent_manager.detach(session_id)
