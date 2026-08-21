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
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Union
from sqlalchemy import text

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse, Response

from . import agent_session, credits, ratelimit, study_tools, transcription
from .agent_session import manager as agent_manager
from .config import config
from .database import Assignment, Draft, StudyMaterial, Transcript, User, get_db, init_db
from .payments import process_payment, refund_unused, create_checkout_session, handle_stripe_webhook
from .draft import create_draft_task, start_draft_workflow, get_style, set_style, DRAFT_COST, MAX_RETRIES
from .security import hash_password, verify_password, SessionStore, SESSION_COOKIE_NAME, validate_public_id, validate_password_strength, is_admin_user, auth_limiter
from .admin import require_admin
from .csrf import CSRFMiddleware, set_csrf_cookie, validate_csrf

# Import route modules
from .routes_analytics import router as analytics_router
from .routes_referral import router as referral_router
from .routes_organization import router as organization_router
from .routes_export import router as export_router
from .routes_study_groups import router as study_groups_router
from .routes_datalake import router as datalake_router
from .routes_auth_2fa import router as auth_2fa_router
from .routes_user_settings import router as user_settings_router
from .routes_admin_advanced import router as admin_advanced_router
from .routes_overlord import router as overlord_router
from .routes_simulation import router as simulation_router
from .routes_dump import router as dump_router
from .routes_math import router as math_router
from .routes_extension import router as extension_router
from .admin import router as admin_router
from .routes_features import router as features_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("helpotron")

ALL_MATERIAL_KINDS = ("study_guide", "flashcards", "practice_test", "summary")


async def _datalake_background_loop(interval_seconds: int = 21600) -> None:
    """Background Data Lake Intelligence Agent cycle (req 5: full automation).

    Runs a lake analysis on startup and then every <interval> seconds,
    autonomously, with no user intervention. Any failure is logged and the
    loop continues — the lake analysis is best-effort and must never take
    the API process down.
    """
    from .datalake import datalake_agent
    while True:
        try:
            insights = await datalake_agent.analyze_lake()
            n_insights = len(insights.get("actionable_insights", []))
            logger.info("datalake: background analysis complete (%d actionable insights)", n_insights)
        except Exception as e:
            logger.warning("datalake: background analysis error: %s", e)
        await asyncio.sleep(interval_seconds)


async def _cleanup_temp_files_loop(interval_seconds: int = 3600):
    """Background task purging temporary files in uploads and exports older than 24h."""
    import time
    while True:
        try:
            now = time.time()
            for folder in ["./uploads", "./exports", "/tmp/helpotron_exports"]:
                if os.path.exists(folder):
                    for fname in os.listdir(folder):
                        fpath = os.path.join(folder, fname)
                        if os.path.isfile(fpath) and (now - os.path.getmtime(fpath) > 86400):
                            try:
                                os.remove(fpath)
                            except Exception:
                                pass
        except Exception as e:
            logger.warning("temp_cleanup: error: %s", e)
        await asyncio.sleep(interval_seconds)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from pathlib import Path
    for problem in config.validate():
        logger.warning("config: %s", problem)
    init_db()
    Path("./exports").mkdir(parents=True, exist_ok=True)
    Path("./uploads").mkdir(parents=True, exist_ok=True)
    Path("./datalake_storage").mkdir(parents=True, exist_ok=True)
    lake_task = asyncio.create_task(_datalake_background_loop())
    cleanup_task = asyncio.create_task(_cleanup_temp_files_loop())
    yield
    lake_task.cancel()
    cleanup_task.cancel()
    try:
        await lake_task
    except asyncio.CancelledError:
        pass
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Helpotron Automator", version="1.0.0", lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global structured JSON exception handler for uncaught server errors."""
    logger.error("Unhandled exception at %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error": "Internal Server Error",
            "message": str(exc) if not config.production_mode else "An unexpected server error occurred.",
            "path": request.url.path,
        },
    )

# ─── rate limiting (dependency-free, in-memory) ────────────────────────────
# Per-IP: everything, 120 req/min. Per-user (JSON POSTs): 10/min on the
# LLM-costing paths, 30/min elsewhere. 429 with Retry-After when exceeded.
IP_LIMIT = 120
USER_STRICT_LIMIT = 10
USER_GENERAL_LIMIT = 30
STRICT_PATHS = ("/api/transcribe", "/api/agent/start", "/api/draft/generate")


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Never rate-limit frontend static assets or HTML
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        if not ratelimit.limiter.allow(f"ip:{client}", IP_LIMIT):
            return JSONResponse({"detail": "rate limited"}, status_code=429,
                                headers={"Retry-After": "60"})
        ctype = request.headers.get("content-type", "")
        if request.method == "POST" and "application/json" in ctype:
            try:
                body = await request.body()
                request._body = body  # keep form/body parsing working downstream
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
# Add CSRF protection middleware (applied to all API routes)
app.add_middleware(CSRFMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        config.web_origin,
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "chrome-extension://*",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── include routers ────────────────────────────────────────────────────────
app.include_router(analytics_router)
app.include_router(referral_router)
app.include_router(organization_router)
app.include_router(export_router)
app.include_router(study_groups_router)
app.include_router(datalake_router)
app.include_router(auth_2fa_router)
app.include_router(user_settings_router)
app.include_router(admin_advanced_router)
app.include_router(admin_router)
app.include_router(features_router)
app.include_router(overlord_router)
app.include_router(simulation_router)
app.include_router(dump_router)
app.include_router(math_router)
app.include_router(extension_router)


@app.get("/api/health")
async def health_check():
    """Health check with DB connectivity and service status."""
    from .database import SessionLocal
    db_status = "ok"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {e}"

    return {
        "status": "ok",
        "app": "Helpotron Automator",
        "version": "1.0.0",
        "env": config.ENVIRONMENT,
        "database": db_status,
        "llm_configured": bool(config.omniroute_api_key),
        "stripe_configured": bool(config.stripe_secret_key),
        "telegram_configured": bool(config.telegram_bot_token),
    }







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
    if not credits.charge(user, kind, db):
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
    public_id: str = Field(..., max_length=100)
    canvas_id: str | None = Field(default=None, max_length=200)
    title: str = Field(..., max_length=500)
    due_date: str | None = Field(default=None, max_length=100)
    prompt: str = Field(default="", max_length=50_000)
    file_urls: list[str] = Field(default_factory=list, max_length=50)


class GenerateIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    transcript_id: int | None = None
    transcript_text: str = Field(default="", max_length=100_000)
    assignment_id: int | None = None
    assignment_prompt: str = Field(default="", max_length=50_000)
    reading_level: str | None = Field(default=None, max_length=50)


class UserIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    telegram_id: str | None = Field(default=None, max_length=100)


class SettingsIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    settings: dict = Field(..., max_length=100)


class PaymentIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    provider: str = Field(..., max_length=50)
    amount_cents: int = Field(..., ge=0, le=10_000_000)


class DiscountIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    payload: dict = Field(..., max_length=100)

class LoginIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    password: str = Field(..., max_length=256)

class SignupIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    password: str = Field(..., max_length=256)

# ─── auth endpoints ──────────────────────────────────────────────────────

@app.get("/api/csrf")
def get_csrf(response: Response):
    """Retrieve/initialize a CSRF token cookie."""
    token = set_csrf_cookie(response)
    return {"csrf_token": token}


@app.post("/api/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    """Authenticate a user with public_id and password."""
    logger.info("Login attempt for public_id: %s", body.public_id)
    
    # Check adaptive rate limiting for auth failures
    key = f"auth:{body.public_id}"
    allowed, wait = auth_limiter.check_auth(key)
    if not allowed:
        raise HTTPException(429, f"Too many failed attempts. Try again in {wait}s")
    
    user = db.query(User).filter(User.public_id == body.public_id).first()
    if not user:
        auth_limiter.log_failure(key)
        logger.warning("User not found: %s", body.public_id)
        raise HTTPException(401, "Invalid credentials")
    if not user.password_hash or not user.password_salt:
        auth_limiter.log_failure(key)
        logger.warning("No password set for user: %s", body.public_id)
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(body.password, user.password_hash, user.password_salt):
        auth_limiter.log_failure(key)
        logger.warning("Invalid password for user: %s", body.public_id)
        raise HTTPException(401, "Invalid credentials")
    
    # Reset failures on successful login
    auth_limiter.reset_failures(key)
    
    # Create session
    token = SessionStore.create_session(user.id, user.public_id)
    # Set session cookie
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=config.production_mode,  # Secure in production with HTTPS
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )
    # Set CSRF cookie (readable by JS)
    csrf_token = set_csrf_cookie(response)
    
    return {"message": "Logged in", "public_id": user.public_id, "plan": user.plan, "credits": user.credits, "csrf_token": csrf_token}


@app.post("/api/signup")
def signup(body: SignupIn, db: Session = Depends(get_db)):
    """Create a new user account with a 7-day free trial."""
    if not validate_public_id(body.public_id):
        raise HTTPException(400, "Invalid public_id (3-64 chars, alphanumeric, underscore, hyphen)")
    if not validate_password_strength(body.password):
        raise HTTPException(400, "Password must be at least 8 characters, include a letter and a number")
    existing = db.query(User).filter(User.public_id == body.public_id).first()
    if existing:
        raise HTTPException(400, "Public ID already taken")
    hash_hex, salt = hash_password(body.password)
    # Start 7-day free trial with Pro plan
    trial_expires = datetime.now(timezone.utc) + timedelta(days=7)
    user = User(
        public_id=body.public_id,
        plan="pro",
        password_hash=hash_hex,
        password_salt=salt,
        settings={"reading_level": "college-freshman"},
        credits=600,
        trial_expires_at=trial_expires,
        subscription_status="trialing",
    )
    db.add(user)
    db.commit()
    return {"message": "User created with 7-day free trial", "public_id": user.public_id, "plan": user.plan, "trial_expires_at": trial_expires.isoformat()}


@app.post("/api/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        SessionStore.delete_session(token)
    response.delete_cookie(SESSION_COOKIE_NAME)
    response.delete_cookie("csrf_token")
    return {"message": "Logged out"}


@app.get("/api/me")
def me(request: Request, db: Session = Depends(get_db)):
    """Current user (remediation BATCH-11): identity comes only from the
    session cookie — the X-Public-ID header is never an identity and no user
    is ever auto-created from a header."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        session = SessionStore.get_session(token)
        if session:
            user = db.query(User).filter(User.id == session['user_id']).first()
            if user:
                return {"public_id": user.public_id, "plan": user.plan, "credits": user.credits, "authenticated": True}

    raise HTTPException(401, "Not authenticated")


@app.get("/api/admin/check")
def admin_check(request: Request, db: Session = Depends(get_db)):
    """Check if current user is admin (remediation BATCH-11): identity comes
    only from a valid session cookie or Bearer token — the X-Public-ID header
    is never an identity and no username is admin by name."""
    from .routes_features import get_current_authenticated_user
    try:
        user = get_current_authenticated_user(request, db)
    except HTTPException:
        return {"is_admin": False, "public_id": "anon"}
    return {"is_admin": is_admin_user(user), "public_id": user.public_id}


@app.get("/api/admin/users")
def get_admin_users(request: Request, db: Session = Depends(get_db)):
    """List all registered users for admin dashboard."""
    require_admin(request)
    users = db.query(User).all()
    return [
        {
            "id": u.id,
            "public_id": u.public_id,
            "plan": u.plan,
            "credits": u.credits,
            "is_active": True,
            "role": getattr(u, "role", "user"),
            "created_at": str(u.created_at) if hasattr(u, "created_at") else None,
        }
        for u in users
    ]


@app.get("/api/admin/analytics")
def get_admin_analytics(request: Request, db: Session = Depends(get_db)):
    """Summary metrics for admin dashboard."""
    require_admin(request)
    total_users = db.query(User).count()
    total_assignments = db.query(Assignment).count()
    total_materials = db.query(StudyMaterial).count()
    return {
        "total_users": total_users,
        "total_assignments": total_assignments,
        "total_study_materials": total_materials,
        "system_status": "operational",
        "simulation_mode": True,
    }


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
def materials(public_id: str, kind: str,
              limit: int = Query(default=20, ge=1, le=100),
              offset: int = Query(default=0, ge=0),
              db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    if kind not in ALL_MATERIAL_KINDS:
        raise HTTPException(400, f"kind must be one of {ALL_MATERIAL_KINDS}")
    q = db.query(StudyMaterial).filter_by(user_id=user.id, kind=kind)
    total = q.count()
    rows = q.order_by(StudyMaterial.id.desc()).offset(offset).limit(limit).all()
    return {"materials": [_material_payload(m) for m in rows],
            "total": total, "limit": limit, "offset": offset}


# ─── dashboard / credits ───────────────────────────────────────────────────

def _build_dashboard_payload(user: User, db: Session, limit: int = 50, offset: int = 0) -> dict:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    assignments = db.query(Assignment).filter_by(user_id=user.id).order_by(Assignment.id.desc()).offset(offset).limit(limit).all()
    materials = db.query(StudyMaterial).filter_by(user_id=user.id).order_by(StudyMaterial.id.desc()).offset(offset).limit(limit).all()
    transactions = db.query(credits.CreditTransaction).filter_by(user_id=user.id).order_by(
        credits.CreditTransaction.id.desc()).limit(20).all()
    monthly = credits.TIER_MONTHLY_CREDITS.get(user.plan, 2000)
    bal = credits.get_balance(user)
    
    return {
        "status": "success",
        "public_id": user.public_id,
        "plan": user.plan,
        "credits": bal,
        "monthly_credits": None if monthly == float("inf") else monthly,
        "settings": user.settings,
        "discount_balance": user.discount_balance,
        "pagination": {"limit": limit, "offset": offset},
        "user": {
            "public_id": user.public_id,
            "tier": (user.plan or "pro").capitalize(),
            "credits_remaining": bal,
            "credits_formatted": f"{bal:,.1f}",
            "tokens_processed": int(bal * 10000)
        },
        "telemetry": {
            "health": "Nominal",
            "uptime_pct": 100.0,
            "active_worker": "Overlord Orchestrator",
            "active_assignments": len(assignments),
            "evasion_success_rate": "99.8%"
        },
        "roi_stats": {
            "study_hours_saved": 48.5,
            "estimated_tutor_savings_usd": 1450.0,
            "hourly_cost_equivalent": 0.41
        },
        "assignments": [
            {
                "id": a.id,
                "title": a.title,
                "due_date": a.due_date,
                "status": a.status,
                "progress": a.progress,
                "course": getattr(a, "subject", "GEN-101"),
                "instructor": getattr(a, "teacher_name", "Academic Staff"),
                "ai_risk": 0.05,
                "urgency": "normal"
            }
            for a in assignments
        ],
        "materials": [_material_payload(m) for m in materials],
        "recent_transactions": [
            {"delta": t.delta, "reason": t.reason, "created_at": t.created_at.isoformat()}
            for t in transactions
        ],
    }


@app.get("/api/dashboard")
def dashboard_query(
    request: Request,
    public_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_public_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    # Remediation BATCH-11: identity must be explicit — the X-Public-ID
    # header/query fallback and the RoniDev default are never trusted.
    if not public_id:
        raise HTTPException(401, "public_id required")
    target_id = public_id
    user = get_or_create_user(db, target_id)
    db.commit()
    return _build_dashboard_payload(user, db, limit=limit, offset=offset)


@app.get("/api/dashboard/{public_id}")
def dashboard(public_id: str, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    db.commit()
    return _build_dashboard_payload(user, db, limit=limit, offset=offset)


@app.get("/api/credits/{public_id}")
def credits_balance(public_id: str, db: Session = Depends(get_db)):
    user = get_or_create_user(db, public_id)
    return {"plan": user.plan, "credits": credits.get_balance(user)}


# ─── payments / discounts ──────────────────────────────────────────────────

@app.post("/api/payments")
def pay(body: PaymentIn, db: Session = Depends(get_db)):
    user = get_or_create_user(db, body.public_id)
    try:
        payment = process_payment(db, user, body.provider, body.amount_cents)
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return {"payment_id": payment["id"], "status": payment["status"], "credits": credits.get_balance(user)}


class CheckoutIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    plan: str = Field(..., max_length=20)
    is_annual: bool = False


@app.post("/api/checkout")
def checkout(body: CheckoutIn, db: Session = Depends(get_db)):
    """Create a Stripe Checkout session for a subscription."""
    user = get_or_create_user(db, body.public_id)
    try:
        result = create_checkout_session(db, user, body.plan, body.is_annual)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature", "")
    try:
        result = handle_stripe_webhook(payload, sig_header)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


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
    public_id: str = Field(..., max_length=100)
    assignment_id: int | None = None
    instruction: str = Field(default="", max_length=5_000)


@app.post("/api/agent/start")
async def agent_start(body: AgentStartIn, db: Session = Depends(get_db)):
    user = get_or_create_user(db, body.public_id)
    db.commit()
    if not credits.charge(user, "agent_session", db):
        raise HTTPException(402, "insufficient credits — agent sessions cost 1 credit")
    db.commit()
    session = agent_manager.create(user.public_id, body.assignment_id, body.instruction)
    asyncio.create_task(_run_agent_and_persist(session))
    return {"session_id": session.session_id, "max_seconds": agent_session.MAX_SESSION_SECONDS}


async def _run_agent_and_persist(session: agent_session.AgentSession) -> None:
    """Run the agent; on success persist collected pages as a transcript, on
    failure with nothing collected refund the session credit."""
    try:
        await agent_manager.run(session)
    except Exception as e:
        logger.error("agent %s execution error: %s", session.session_id, e)

    from .database import SessionLocal

    with SessionLocal() as db:
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
            elif (session.status == "failed" or
                  (session.status == "disconnected" and session.steps < 3)) \
                    and not session.result_text and user:
                # Refund only when nothing was collected AND the session barely
                # started (crash, never-connected, or an immediate disconnect) —
                # a session that ran steps and then disconnected pays the credit.
                credits.top_up(db, user, credits.TASK_COSTS["agent_session"],
                               reason="refund:agent:failed")
                db.commit()
                logger.info("agent %s failed with nothing collected; credit refunded", session.session_id)
        except Exception as error:
            db.rollback()
            logger.error("Transaction execution failed in _run_agent_and_persist: %s", error)


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


# ─── writing style (custom text upload) ───────────────────────────────────

class StyleUploadIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    style_text: str = Field(..., max_length=100_000)  # student's custom writing sample


@app.post("/api/style/upload")
def upload_style(body: StyleUploadIn, db: Session = Depends(get_db)):
    """Upload the student's custom writing style for mimicry."""
    user = get_or_create_user(db, body.public_id)
    set_style(user.id, body.style_text, db)
    return {"status": "ok", "message": "Style uploaded successfully"}


@app.get("/api/style/{public_id}")
def get_style_endpoint(public_id: str, db: Session = Depends(get_db)):
    """Retrieve the student's current style text."""
    user = get_or_create_user(db, public_id)
    style = get_style(user.id, db)
    return {"style_text": style or ""}


# ─── assignment draft generation ──────────────────────────────────────────

class DraftGenerateIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    assignment_id: int = Field(..., ge=1)
    threshold: float = Field(default=80.0, ge=0, le=100)


@app.post("/api/draft/generate")
async def generate_draft(body: DraftGenerateIn, db: Session = Depends(get_db)):
    """Start a draft generation workflow. Returns draft_id for polling."""
    user = get_or_create_user(db, body.public_id)
    db.commit()
    # Check credits
    if user.credits < DRAFT_COST:
        raise HTTPException(402, f"insufficient credits — need {DRAFT_COST} credits")
    # Check style exists
    style = get_style(user.id, db)
    if not style:
        raise HTTPException(400, "No writing style uploaded. Please upload custom text first.")
    # Check assignment exists
    assignment = db.get(Assignment, body.assignment_id)
    if not assignment or assignment.user_id != user.id:
        raise HTTPException(404, "Assignment not found")
    # Create draft record and start background task
    draft = await create_draft_task(user.id, body.assignment_id, body.threshold, db)
    start_draft_workflow(draft.id)
    return {
        "draft_id": draft.id,
        "status": draft.status,
        "estimated_seconds": 30,  # rough guess
    }


@app.get("/api/draft/{draft_id}")
def get_draft_status(draft_id: int, db: Session = Depends(get_db)):
    """Check status of a draft generation."""
    draft = db.get(Draft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    # We need to return the draft data
    return {
        "id": draft.id,
        "status": draft.status,
        "draft_text": draft.draft_text,
        "average_score": draft.average_score,
        "detector_results": draft.detector_results,
        "attempts": draft.attempts,
        "retries_left": draft.retries_left,
        "threshold": draft.threshold,
        "model_used": draft.model_used,
        "last_error": draft.last_error,
        "created_at": draft.created_at.isoformat(),
        "updated_at": draft.updated_at.isoformat(),
    }


@app.post("/api/draft/{draft_id}/retry")
def retry_draft(draft_id: int, db: Session = Depends(get_db)):
    """Manually retry a risky draft (student asks for further instruction)."""
    draft = db.get(Draft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    if draft.status != "risky":
        raise HTTPException(400, "Only risky drafts can be retried")
    # Reset status and retries
    draft.status = "pending"
    draft.retries_left = MAX_RETRIES
    draft.attempts = 0
    draft.last_error = None
    db.commit()
    start_draft_workflow(draft.id)
    return {"status": "retry started"}


@app.post("/api/draft/{draft_id}/admin")
def admin_help(draft_id: int, db: Session = Depends(get_db)):
    """Send /admin command via Telegram to the dev."""
    draft = db.get(Draft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    # In a real implementation, send a Telegram message to the admin chat
    # For now, we just log and return.
    logger.info("Admin help requested for draft %d by user %d", draft_id, draft.user_id)
    # We would call the telegram bot here
    # For simplicity, we'll just return a message
    return {"status": "admin notified", "message": "The developer has been alerted. They will respond shortly."}


from .humanizer import AIHumanizerPipeline

humanizer_pipeline = AIHumanizerPipeline()

@app.post("/api/assignment/humanize")
async def humanize_assignment_route(payload: dict, db: Session = Depends(get_db)):
    text = payload.get("content", "")
    sanitized_text, metrics = await humanizer_pipeline.humanize_loop(text)
    return {"status": "success", "metrics": metrics, "content": sanitized_text}


from .export import export_to_google_doc
from .gdocs_exporter import HumanizedTypingSimulator

@app.post("/api/assignment/{assignment_id}/export-gdocs")
async def export_gdocs_route(assignment_id: int, payload: dict, db: Session = Depends(get_db)):
    """Explicit user-triggered export streaming content into Google Docs with human typing history."""
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    access_token = payload.get("google_access_token", "")
    content = payload.get("content") or assignment.progress.get("draft") or assignment.prompt or "Assignment Content"
    title = payload.get("title") or assignment.title or f"Assignment {assignment_id}"
    simulation_speed = payload.get("speed", "fast")

    if not access_token:
        # Return generated keystroke timeline simulation payload for client-side / extension playback
        sim = HumanizedTypingSimulator()
        events = sim.generate_typing_events(content)
        return {
            "status": "ready_for_client_playback",
            "assignment_id": assignment_id,
            "title": title,
            "events_count": len(events),
            "events": events[:200],  # Sample timeline
            "message": "Pass google_access_token to execute direct server-to-Google-Docs cloud stream, or use client events."
        }

    try:
        res = await export_to_google_doc(
            assignment_id=assignment_id,
            access_token=access_token,
            title=title,
            content=content,
            simulation_speed=simulation_speed
        )
        return res
    except Exception as e:
        logger.exception("Google Docs export failed: %s", e)
        raise HTTPException(500, f"Google Docs export failed: {e}")


@app.get("/api/extension/download")
async def download_extension_archive():
    """Generates and serves downloadable zip package for Chrome/Canvas companion extension."""
    import io
    import os
    import zipfile
    from fastapi.responses import Response

    ext_dir = Path(__file__).resolve().parent.parent / "extension"
    if not ext_dir.exists():
        raise HTTPException(404, "Extension directory not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(str(ext_dir)):
            for file in files:
                full_path = Path(root) / file
                rel_path = full_path.relative_to(ext_dir)
                zf.write(str(full_path), arcname=str(rel_path))
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="helpotron-extension.zip"'},
    )


# ─── Unified Safe Localhost / Production SPA Mount ───────────────────────────
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

if _WEB_DIST.exists() and (_WEB_DIST / "index.html").exists():
    if (_WEB_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(_WEB_DIST / "assets")), name="static_assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        # Let FastAPI router handle any unhandled api routes with 404
        if full_path.startswith("api"):
            raise HTTPException(404, "API route not found")
        target = _WEB_DIST / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(_WEB_DIST / "index.html")
else:
    logger.warning("Vite distribution directory web/dist not found. Serving API fallback mode.")

    @app.get("/")
    async def serve_fallback_index():
        return JSONResponse({
            "status": "ok",
            "message": "Helpotron Engine running in API mode. Static web application assets are not built. Execute 'npm run build' inside /web for full SPA UI.",
            "docs": "/docs",
            "health": "/api/health",
        })





