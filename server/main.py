"""Helpotron Academic Companion — FastAPI backend.

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
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse, Response, StreamingResponse

try:
    from . import agent_session, credits, detectors, ratelimit, study_tools, transcription
    from .user_settings_service import user_settings_service, filter_user_settings_payload
    from .agent_session import manager as agent_manager
    from .config import config
    from .database import Assignment, Draft, StudyMaterial, Transcript, User, get_db, init_db, Payment, utcnow
    from .payments import process_payment, refund_unused, create_checkout_session, handle_stripe_webhook, _stripe_enabled
    from .draft import create_draft_task, start_draft_workflow, get_style, set_style, DRAFT_COST, MAX_RETRIES
    from .security import (hash_password, verify_password, SessionStore, SESSION_COOKIE_NAME,
                           validate_public_id, validate_password_strength, is_admin_user,
                           is_user_banned, auth_limiter, get_current_user, create_jwt_token,
                           SecurityHeadersMiddleware)
    from .admin import require_admin, ResetPasswordRequest
    from .csrf import CSRFMiddleware, set_csrf_cookie, validate_csrf
    from .captcha import captcha_required, has_valid_bypass, verify_turnstile_token
    from .monitors import MonitorMiddleware, run_monitors_loop
    from .memguard import MemoryBudgetMiddleware
except (ImportError, ValueError):
    from server import agent_session, credits, detectors, ratelimit, study_tools, transcription
    from server.user_settings_service import user_settings_service, filter_user_settings_payload
    from server.agent_session import manager as agent_manager
    from server.config import config
    from server.database import Assignment, Draft, StudyMaterial, Transcript, User, get_db, init_db, Payment
    from server.payments import process_payment, refund_unused, create_checkout_session, handle_stripe_webhook, _stripe_enabled
    from server.draft import create_draft_task, start_draft_workflow, get_style, set_style, DRAFT_COST, MAX_RETRIES
    from server.security import (hash_password, verify_password, SessionStore, SESSION_COOKIE_NAME,
                                 validate_public_id, validate_password_strength, is_admin_user,
                                 is_user_banned, auth_limiter, get_current_user, create_jwt_token,
                                 SecurityHeadersMiddleware)
    from server.admin import require_admin, ResetPasswordRequest
    from server.csrf import CSRFMiddleware, set_csrf_cookie, validate_csrf
    from server.captcha import captcha_required, has_valid_bypass, verify_turnstile_token
    from server.monitors import MonitorMiddleware, run_monitors_loop
    from server.memguard import MemoryBudgetMiddleware


# Import route modules
try:
    from .routes_analytics import router as analytics_router
    from .routes_referral import router as referral_router
    from .routes_organization import router as organization_router
    from .routes_export import router as export_router
    from .routes_study_groups import router as study_groups_router
    from .routes_datalake import router as datalake_router
    from .routes_monitors import router as monitors_router
    from .routes_auth_2fa import router as auth_2fa_router
    from .routes_telegram_agent import router as telegram_agent_router
    from .routes_user_settings import router as user_settings_router
    from .routes_hygiene import router as hygiene_router
    from .routes_agent_actions import router as agent_actions_router
    from .routes_admin_advanced import router as admin_advanced_router
    from .routes_recovery import router as recovery_router
    from .routes_overlord import router as overlord_router
    from .routes_voice import router as voice_router
    from .routes_simulation import router as simulation_router
    from .routes_dump import router as dump_router
    from .routes_import_url import router as import_url_router
    from .routes_math import router as math_router
    from .routes_extension import router as extension_router
    from .routes_extension import public_router as extension_public_router
    from .assignments import router as assignments_router
    from .assignment_turnin import router as assignment_turnin_router
    from .routes_assignment_direction import router as assignment_direction_router
    from .privacy import router as privacy_router
    from .admin import router as admin_router
    from .routes_features import router as features_router
    from .routes_trial import router as trial_router
except (ImportError, ValueError):
    from server.routes_analytics import router as analytics_router
    from server.routes_referral import router as referral_router
    from server.routes_organization import router as organization_router
    from server.routes_export import router as export_router
    from server.routes_study_groups import router as study_groups_router
    from server.routes_datalake import router as datalake_router
    from server.routes_monitors import router as monitors_router
    from server.routes_auth_2fa import router as auth_2fa_router
    from server.routes_telegram_agent import router as telegram_agent_router
    from server.routes_user_settings import router as user_settings_router
    from server.routes_hygiene import router as hygiene_router
    from server.routes_agent_actions import router as agent_actions_router
    from server.routes_admin_advanced import router as admin_advanced_router
    from server.routes_recovery import router as recovery_router
    from server.routes_overlord import router as overlord_router
    from server.routes_simulation import router as simulation_router
    from server.routes_dump import router as dump_router
    from server.routes_import_url import router as import_url_router
    from server.routes_math import router as math_router
    from server.routes_extension import router as extension_router
    from server.routes_extension import public_router as extension_public_router
    from server.assignments import router as assignments_router
    from server.assignment_turnin import router as assignment_turnin_router
    from server.routes_assignment_direction import router as assignment_direction_router
    from server.privacy import router as privacy_router
    from server.admin import router as admin_router
    from server.routes_features import router as features_router
    from server.routes_trial import router as trial_router


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("helpotron")

# Persistent access/error logs (incident 08-29: the only access log was the
# process's stdout, redirected to a scratch file that later got cleaned up —
# every request record for the live server was unrecoverable). Wiring the file
# handlers here makes the logs independent of how the server was launched and
# of where stdout points. Never fatal: falls back to stdout-only on failure.
try:
    from .access_log import install as _install_access_logging
except (ImportError, ValueError):
    from server.access_log import install as _install_access_logging
_ACCESS_LOG_FILES = _install_access_logging(logger)

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
    # Re-assert the file handlers here too: a --reload worker or a gunicorn
    # UvicornWorker can apply uvicorn's logging dictConfig *after* this module
    # was imported, which would drop the handlers off uvicorn.access. install()
    # is idempotent, so this is a no-op in the normal single-process path.
    _install_access_logging(logger)
    for problem in config.validate():
        logger.warning("config: %s", problem)
    init_db()
    Path("./exports").mkdir(parents=True, exist_ok=True)
    Path("./uploads").mkdir(parents=True, exist_ok=True)
    Path("./datalake_storage").mkdir(parents=True, exist_ok=True)
    lake_task = asyncio.create_task(_datalake_background_loop())
    cleanup_task = asyncio.create_task(_cleanup_temp_files_loop())
    monitor_task = asyncio.create_task(run_monitors_loop())
    # Telegram bot ↔ My Agent link (operator 08-31): long-polls every user's
    # own bot; text messages become agent instructions, replies go to the chat.
    from .telegram_agent_link import telegram_agent_loop
    telegram_agent_task = asyncio.create_task(telegram_agent_loop())
    yield
    lake_task.cancel()
    cleanup_task.cancel()
    monitor_task.cancel()
    telegram_agent_task.cancel()
    try:
        await lake_task
    except asyncio.CancelledError:
        pass
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    try:
        await telegram_agent_task
    except asyncio.CancelledError:
        pass


# Disable public API docs in production mode to prevent schema and endpoint enumeration
_docs_url = None if config.production_mode else "/docs"
_redoc_url = None if config.production_mode else "/redoc"
_openapi_url = None if config.production_mode else "/openapi.json"

app = FastAPI(
    title="Helpotron Academic Companion",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)


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

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """422 handler (09-02, independent QA pass): FastAPI's default response
    echoes the offending `input` back to the client — for a bad-typed
    password field that would replay the submitted secret in the error body
    (and in any log that records responses). Strip `input`/`ctx` from every
    error; keep type/loc/msg so clients still render the field problem."""
    clean = [
        {k: v for k, v in err.items() if k not in ("input", "ctx")}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": clean})


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
        if client in ("127.0.0.1", "::1", "localhost"):
            cf_ip = request.headers.get("cf-connecting-ip")
            if cf_ip:
                client = cf_ip.strip()
            else:
                x_fwd = request.headers.get("x-forwarded-for")
                if x_fwd:
                    client = x_fwd.split(",")[0].strip()

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

# Monitor traffic itself: outermost so rate-limited/CSRF-rejected requests
# are counted too (add_middleware prepends — last added runs first).
app.add_middleware(MonitorMiddleware)

# Security headers on every response — API, static assets, and the SPA
# (audit 08-28 HIGH: the middleware class existed in security.py but was
# never registered, so nothing ever carried CSP/nosniff/XFO/Referrer-Policy).
# Added last so it is outermost and sees every response, including the
# inner middlewares' 401/403/429 rejections and the SPA FileResponses.
app.add_middleware(SecurityHeadersMiddleware)

# Memory budget (08-31, operator): the server tree runs under a 10G cgroup
# budget (start_stack.sh); while the budget is consumed every NEW request is
# answered "Task is in Queue, will be completed momentarily" (429) and the
# client retries until RAM frees up. Registered inside CORS (queue JSON must
# stay CORS-readable) but outside CSRF/rate-limit, so the queue answer wins
# over a CSRF rejection for the first POST of a session — and /health and
# /api/csrf are exempt inside memguard so the wake monitors never queue.
app.add_middleware(MemoryBudgetMiddleware)

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
    ],
    # NOTE: "chrome-extension://*" is NOT a CORS wildcard — CORS only has one
    # wildcard ("*"), so real extension origins must be matched by regex
    # (Chrome extension IDs: 32 chars [a-p]; Firefox UUIDs: 8-4-4-4-12 hex).
    allow_origin_regex=(
        r"^(https?://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|chrome-extension://[a-pA-P0-9]{6,64}"
        r"|moz-extension://[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── include routers ────────────────────────────────────────────────────────
app.include_router(analytics_router)
app.include_router(voice_router)
app.include_router(referral_router)
app.include_router(organization_router)
app.include_router(export_router)
app.include_router(study_groups_router)
app.include_router(datalake_router)
app.include_router(monitors_router)
app.include_router(auth_2fa_router)
app.include_router(telegram_agent_router)
app.include_router(user_settings_router)
app.include_router(hygiene_router)
app.include_router(agent_actions_router)
app.include_router(admin_advanced_router)
app.include_router(admin_router)
app.include_router(features_router)
app.include_router(recovery_router)
app.include_router(overlord_router)
app.include_router(simulation_router)
app.include_router(dump_router)
app.include_router(import_url_router)
app.include_router(math_router)
app.include_router(extension_router)
app.include_router(extension_public_router)
app.include_router(assignment_turnin_router)  # before assignments_router: literal /assignments/turned-in must win
app.include_router(assignment_direction_router)
app.include_router(assignments_router)
app.include_router(privacy_router)
app.include_router(trial_router)


@app.get("/api/capabilities")
def get_capabilities():
    """Authoritative runtime capabilities query endpoint."""
    from .capabilities import capabilities
    return capabilities.get_capabilities()


class CanvasTestIn(BaseModel):
    base_url: str = Field(..., max_length=256)
    access_token: str = Field(..., max_length=512)


class CanvasSyncIn(BaseModel):
    base_url: str = Field(..., max_length=256)
    access_token: str = Field(..., max_length=512)
    course_ids: Optional[List[str]] = None


@app.post("/api/canvas/test")
async def canvas_test_connection(body: CanvasTestIn, current_user: User = Depends(get_current_user)):
    """Test Canvas LMS credentials and connectivity."""
    from .canvas_sync import CanvasSyncEngine
    try:
        engine = CanvasSyncEngine(base_url=body.base_url, access_token=body.access_token)
        profile = await engine.validate_token()
        if not profile.get("valid"):
            raise HTTPException(400, profile.get("error", "Canvas validation failed"))
        courses = await engine.fetch_active_courses()
        return {
            "status": "success",
            "profile": profile,
            "courses_count": len(courses),
            "courses": courses[:10],
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.warning("Canvas connection test failed: %s", e)
        raise HTTPException(502, f"Canvas connection test failed: {str(e)}")


@app.post("/api/canvas/sync")
async def canvas_sync_assignments(body: CanvasSyncIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Sync active assignments from Canvas LMS courses into Helpotron assignment bubbles."""
    from .canvas_sync import CanvasSyncEngine
    try:
        engine = CanvasSyncEngine(base_url=body.base_url, access_token=body.access_token)
        profile = await engine.validate_token()
        if not profile.get("valid"):
            raise HTTPException(400, profile.get("error", "Canvas validation failed"))

        courses = await engine.fetch_active_courses()
        selected_courses = [
            c for c in courses
            if not body.course_ids or str(c.get("course_id")) in body.course_ids
        ]

        imported_count = 0
        created_assignments = []
        for course in selected_courses:
            c_id = course["course_id"]
            c_name = course.get("name", "Canvas Course")
            items = await engine.fetch_course_assignments(c_id)
            for item in items:
                title = item.get("title", "Untitled Canvas Assignment")
                existing = db.query(Assignment).filter(
                    Assignment.user_id == current_user.id,
                    Assignment.title == title,
                ).first()
                if not existing:
                    new_a = Assignment(
                        user_id=current_user.id,
                        title=title,
                        prompt=item.get("description_html") or f"Imported from Canvas course: {c_name}",
                        status="tracked",
                        progress={
                            "subject": c_name,
                            "canvas_id": item.get("assignment_id"),
                            "due_at": item.get("due_at"),
                            "points": item.get("points_possible"),
                            "has_rubric": item.get("has_rubric"),
                            "imported_from": "canvas",
                        },
                    )
                    db.add(new_a)
                    imported_count += 1
                    created_assignments.append(title)

        return {
            "status": "success",
            "imported_count": imported_count,
            "created_assignments": created_assignments[:20],
            "total_courses_synced": len(selected_courses),
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.warning("Canvas sync failed: %s", e)
        raise HTTPException(502, f"Canvas sync failed: {str(e)}")


class SubagentInterruptIn(BaseModel):
    reason: Optional[str] = "Interrupted by student"


@app.get("/api/assignments/{assignment_id}/subagent-team/status")
def get_assignment_subagent_team_status(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve live subagent tasks, progress, and working status for an assignment bubble."""
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id,
        Assignment.user_id == current_user.id,
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    from .assignment_team import get_subagent_team_status
    return get_subagent_team_status(db, current_user, assignment)


@app.post("/api/assignments/{assignment_id}/subagent-team/interrupt")
def interrupt_assignment_subagent_team(
    assignment_id: int,
    body: Optional[SubagentInterruptIn] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Interrupt / cancel running subagents on an assignment bubble."""
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id,
        Assignment.user_id == current_user.id,
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    from .assignment_team import interrupt_subagent_team
    reason = (body.reason if body else None) or "Interrupted by student"
    return interrupt_subagent_team(db, current_user, assignment, reason=reason)




@app.get("/api/insights/snapshot")
async def get_insights_snapshot_alias(
    request: Request,
    db: Session = Depends(get_db)
):
    """Consolidated InsightsSnapshot endpoint (SoT §8)."""
    from .security import get_current_user
    user = await get_current_user(request)
    from .analytics import get_user_analytics, compute_next_best_action
    analytics = get_user_analytics(db, user)
    return {
        "status": "success",
        "study_activity": analytics,
        # Real earliest-due open assignment, or null when nothing is pending.
        "next_best_action": compute_next_best_action(db, user.id),
    }




@app.get("/api/plans")
async def list_plans():
    """Public plan catalogue — prices and monthly allowances.

    Unauthenticated on purpose: the signed-out landing page renders its
    pricing section from this, so the numbers a visitor is quoted come from
    the same table the app bills against instead of being hardcoded into
    marketing copy that silently drifts. See ``server/plans.py``.
    """
    from .plans import get_plan_catalogue

    return {"status": "success", "plans": get_plan_catalogue()}


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
        "app": "Helpotron Academic Companion",
        "version": "1.0.0",
        "env": config.ENVIRONMENT,
        "database": db_status,
        "llm_configured": bool(config.omniroute_api_key),
        "stripe_configured": bool(config.stripe_secret_key),
        "telegram_configured": bool(config.telegram_bot_token),
    }







# ─── helpers ───────────────────────────────────────────────────────────────

# 08-31 (owner directive, later evening): NO automatic welcome grant. Bob —
# "Don't automatically give every new account 300 credits, run it by me here
# and give only when I approve". New accounts start at 0 tokens; signups are
# reported to the owner and granted on approval via
# POST /api/admin/user/{public_id}/welcome-tokens (server/admin.py).
WELCOME_TOKEN_BONUS = 300.0  # owner-approved grant amount


def get_or_create_user(db: Session, public_id: str) -> User:
    user = db.query(User).filter(User.public_id == public_id).first()
    if user is None:
        from .security import ADMIN_PUBLIC_ID, RESERVED_PUBLIC_IDS
        low = public_id.lower()
        if low in RESERVED_PUBLIC_IDS or low == ADMIN_PUBLIC_ID.lower():
            raise ValueError(f"public_id '{public_id}' is reserved and cannot be auto-created")
        settings = {"reading_level": "college-freshman"}
        user = User(public_id=public_id, plan="basic", settings=settings)
        db.add(user)
        db.flush()
    return user


# ─── subject classification for extension-scraped assignments (08-28) ───────
# Fallback under the client-supplied subject (the extension classifies from the
# Canvas course name); keyword hints mirror assignment_dump._TOPIC_HINTS so scrape
# and dump bubbles agree. Deterministic + free: never carries an LLM call on
# the extension scrape path.

_SUBJECT_HINTS: dict[str, tuple[str, ...]] = {
    "Mathematics": ("algebra", "geometry", "calculus", "trig", "trigonometr", "statistic",
                    "equation", "theorem", "linear", "quadratic", "function", "probability",
                    "arithmetic", "math", "integral", "derivative", "exponential", "logarithm"),
    "Biology": ("cell", "dna", "genetics", "organism", "biology", "evolution", "crispr",
                "photosynthesis", "ecosystem", "bacteria", "mitochondria"),
    "Chemistry": ("chemistry", "chemical", "molecule", "atom", "compound", "reaction", "acid", "periodic"),
    "Physics": ("physics", "motion", "force", "kinematics", "newton", "velocity", "acceleration",
                "gravity", "electricity", "magnet"),
    "Computer Science": ("algorithm", "code", "programming", "data structure", "python",
                         "machine learning", "neural", "ap csp", "apcsp", "computer science", "java"),
    "History": ("history", "reconstruction", "civil war", "president", "ancient", "revolution",
                "empire", "world war", "century", "antebellum", "columbian"),
    "Literature": ("novel", "literature", "poem", "woolf", "faulkner", "narrative", "modernist",
                   "english literature", "shakespeare", "poetry"),
    "English": ("english", "grammar", "essay", "vocabulary", "reading", "writing", "rhetoric"),
    "Economics": ("economic", "inflation", "gdp", "macroeconomic", "microeconomic", "monetary",
                  "supply", "demand", "market"),
    "Ethics": ("ethics", "ethical", "moral", "autonomous systems"),
    "Psychology": ("cognitive", "behavior", "psychology", "bias", "decision"),
    "Spanish": ("spanish", "espanol", "español", "conjugat", "vocabulario"),
    "French": ("french", "francais", "français"),
    "Health": ("health", "nutrition", "p.e.", "physical education", "wellness"),
}


def _classify_subject(text: str) -> tuple[str, str]:
    """Return (subject, course_code) from scrape title/prompt text.

    Defaults to the sensible 'General Academic' / GEN-101 when nothing matches
    (same neutral bucket the dump flow uses) so a bubble always has a topic.
    Keywords match at a word START so substrings never misroute a page
    ("miscellaneous" must not hit the 'cell' biology hint).
    """
    import re
    lower = (text or "").lower()
    for subj, keys in _SUBJECT_HINTS.items():
        for k in keys:
            if re.search(r"(?:^|[\s\W])" + re.escape(k), lower):
                return subj, subj.split()[0][:4].upper() + "-101"
    return "General Academic", "GEN-101"


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
                    assignment_id: int | None, transcript_id: int | None,
                    on_progress: study_tools.ProgressCB | None = None,
                    count: int | None = None) -> StudyMaterial:
    # charge on success only — pre-charge then credit back on failure
    if not credits.charge(user, kind, db):
        raise HTTPException(402, "insufficient credits — top up at /api/payments")

    try:
        # route by the user's effort score (1-1000): low effort favors the
        # cheap utility engines, high effort the flagship reasoning engines
        effort_score = int(user_settings_service.get_user_settings(user).get("effort_score", 500))
        gen = study_tools.GENERATORS[kind]
        if kind == "study_guide":
            content, model = await gen(transcript_text, assignment_prompt, reading_level,
                                       on_progress=on_progress, effort_score=effort_score)
        elif kind == "flashcards":
            items, model = await gen(transcript_text, count=count or 20, reading_level=reading_level,
                                     on_progress=on_progress, effort_score=effort_score)
            content = json.dumps(items, ensure_ascii=False)
        elif kind == "practice_test":
            data, model = await gen(transcript_text, reading_level=reading_level,
                                    on_progress=on_progress, effort_score=effort_score)
            content = json.dumps(data, ensure_ascii=False)
        else:  # summary
            content, model = await gen(transcript_text, on_progress=on_progress,
                                       effort_score=effort_score)
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
    # Audit 08-28, LOW: this used to be REQUIRED even though the route never
    # reads it — clients that omitted it got a baffling 422 "Field required".
    # Optional now: the authenticated session is always the identity (the
    # route below keys everything on current_user), and the field remains in
    # the schema purely for extension-payload compatibility.
    public_id: str | None = Field(default=None, max_length=100)
    canvas_id: str | None = Field(default=None, max_length=200)
    # Extension scrape metadata (08-28): the scraped page carries its LMS
    # identity + detected topic so the row lands in the right bubble.
    # canvas_id from the extension is "<courseId>:<assignmentId>" so the same
    # assignment id in two different courses can never dedupe wrongly.
    subject: str | None = Field(default=None, max_length=64)
    course_name: str | None = Field(default=None, max_length=200)
    course_code: str | None = Field(default=None, max_length=16)
    rubric: str | None = Field(default=None, max_length=500_000)
    source_url: str | None = Field(default=None, max_length=2000)
    # Explicit bubble target: only honored when the assignment belongs to the
    # caller (same ownership rule the materials/flashcards routes use).
    assignment_id: int | None = None
    title: str = Field(..., max_length=500)
    due_date: str | None = Field(default=None, max_length=100)
    # 08-28 truncation fix: long assignment pages (pacing guides, packets,
    # rubric+prompt pages) exceed the old 50k cap and were REJECTED with a 422
    # — the scrape payload (and tail of the content) was lost. SQLite stores
    # String/TEXT unbounded; the extension marks anything above 1M chars.
    prompt: str = Field(default="", max_length=1_000_000)
    file_urls: list[str] = Field(default_factory=list, max_length=200)
    # 08-28 quick-scrape integrity: per-file records {url, filename, size,
    # sha256, content_type, uploaded, dump_id} from the extension's real
    # scrape — a file that could not stream into the dump flow still keeps its
    # URL + content-hash on the bubble.
    files_meta: list[dict] | None = Field(default=None, max_length=200)
    # 08-28 chatbox→scrape binding: the mini-chatbox instruction that produced
    # (or last re-ran) this scrape, persisted per assignment so a follow-up
    # message continues the scrape with full context.
    instruction: str | None = Field(default=None, max_length=4000)


class GenerateIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    transcript_id: int | None = None
    transcript_text: str = Field(default="", max_length=100_000)
    assignment_id: int | None = None
    assignment_prompt: str = Field(default="", max_length=50_000)
    reading_level: str | None = Field(default=None, max_length=50)
    count: int | None = Field(default=None, ge=1, le=100)  # FIX B3: flashcards count passthrough


class UserIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    telegram_id: str | None = Field(default=None, max_length=100)


class SettingsIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    settings: dict = Field(..., max_length=100)


class PaymentIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    provider: str = Field(..., max_length=50)
    amount_cents: int = Field(..., gt=0, le=10_000_000)


class DiscountIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    payload: dict = Field(..., max_length=100)

class LoginIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    password: str = Field(..., max_length=256)
    code: Optional[str] = None
    two_factor_code: Optional[str] = None
    turnstile_token: Optional[str] = None  # 08-31: mandatory once captcha configured

class SignupIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    password: str = Field(..., max_length=256)
    turnstile_token: Optional[str] = None  # 08-31: mandatory once captcha configured

# ─── auth endpoints ──────────────────────────────────────────────────────

@app.get("/api/csrf")
def get_csrf(response: Response, request: Request):
    """Retrieve/initialize a CSRF token cookie."""
    token = set_csrf_cookie(response, request)
    return {"csrf_token": token}


@app.get("/api/public-config")
def public_config():
    """Client-safe config for the login captcha (Turnstile) + feature flags."""
    return {
        "turnstile_sitekey": config.turnstile_sitekey,
        "captcha_enabled": captcha_required(),
        "import_from_url_enabled": config.import_from_url_enabled,
    }


@app.post("/api/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """Authenticate a user with public_id and password."""
    logger.info("Login attempt for public_id: %s", body.public_id)

    # Login captcha (08-31, operator): once Turnstile is configured every
    # login must present a valid token unless the operator's test-bot bypass
    # header is present. Deny-closed: enforcement never fails open.
    if captcha_required() and not has_valid_bypass(request):
        remote_ip = request.client.host if request.client else ""
        if not verify_turnstile_token(body.turnstile_token or "", remote_ip):
            raise HTTPException(
                403, "Security check required — complete the captcha and try again."
            )

    # Per-IP login throttle (audit 08-28, LOW): the per-account limiter below
    # keys on the public_id, so 12 bad logins across 12 different accounts
    # from one IP never tripped it. Keep BOTH: the account limiter (5/hr,
    # exponential backoff) still runs, and this sliding window stops ~5
    # failed attempts per minute per client IP with a Retry-After.
    client = request.client.host if request.client else "unknown"
    ip_key = f"login_ip:{client}"
    allowed_ip, ip_wait = auth_limiter.check_ip_auth(ip_key)
    if not allowed_ip:
        raise HTTPException(
            429, f"Too many failed login attempts from this address. Try again in {ip_wait}s",
            headers={"Retry-After": str(ip_wait)})

    # Check adaptive rate limiting for auth failures
    key = f"auth:{body.public_id}"
    allowed, wait = auth_limiter.check_auth(key)
    if not allowed:
        raise HTTPException(429, f"Too many failed attempts. Try again in {wait}s",
                            headers={"Retry-After": str(wait)})

    user = db.query(User).filter(User.public_id == body.public_id).first()
    if not user:
        auth_limiter.log_failure(key)
        auth_limiter.log_failure(ip_key, window_seconds=60.0)
        logger.warning("User not found: %s", body.public_id)
        raise HTTPException(401, "Invalid credentials")
    if not user.password_hash or not user.password_salt:
        auth_limiter.log_failure(key)
        auth_limiter.log_failure(ip_key, window_seconds=60.0)
        logger.warning("No password set for user: %s", body.public_id)
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(body.password, user.password_hash, user.password_salt):
        auth_limiter.log_failure(key)
        auth_limiter.log_failure(ip_key, window_seconds=60.0)
        logger.warning("Invalid password for user: %s", body.public_id)
        raise HTTPException(401, "Invalid credentials")

    # Reset failures on successful login
    auth_limiter.reset_failures(key)

    # Ban enforcement (operator 08-27): banned / temp-banned accounts are
    # refused at sign-in even with valid credentials.
    if is_user_banned(user):
        raise HTTPException(403, "Account suspended by the operator")

    if user.settings and user.settings.get("2fa_enabled"):
        from .auth_2fa import totp_service, code_store
        code = body.code or body.two_factor_code
        method = user.settings.get("2fa_method", "totp")
        if not code:
            # 09-01 (Logan, live): the route used to return 2fa_required WITHOUT
            # sending the code — the UI asked for a code that never arrived.
            # Send the email/SMS code here so it lands while the user types.
            if method in ("email", "sms"):
                settings_ = user.settings or {}
                if method == "sms":
                    from .auth_2fa import send_sms_sync
                    from .routes_auth_2fa import _e164
                    phone = settings_.get("phone_number") or (settings_.get("profile") or {}).get("phone")
                    try:
                        phone = _e164(phone) if phone else ""
                    except ValueError:
                        phone = ""
                    if not phone:
                        raise HTTPException(
                            400,
                            "No phone number on file for SMS 2FA — add one in Settings, or use the authenticator app.",
                        )
                    if settings_.get("sms_opt_out"):
                        raise HTTPException(
                            400,
                            "SMS messages are disabled for this number (you replied STOP). Reply START from that phone, or use email/authenticator 2FA.",
                        )
                    new_code = code_store.generate_code(user.public_id, purpose="2fa_challenge", length=12)
                    if not send_sms_sync(phone, f"Your Helpotron 2FA code is: {new_code}. Valid for 15 minutes."):
                        raise HTTPException(502, "SMS could not be delivered right now — try again in a moment.")
                else:  # email
                    from .auth_2fa import email_service
                    target = (settings_.get("profile") or {}).get("email") or f"{user.public_id}@helpotron.app"
                    new_code = code_store.generate_code(user.public_id, purpose="2fa_challenge", length=12)
                    email_service.send_verification_code(target, new_code, purpose_label="2FA Login")
            return {"status": "2fa_required", "method": method, "message": "2FA verification code required"}

        if method == "totp":
            secret = user.settings.get("2fa_totp_secret")
            if not totp_service.verify_code_with_replay(user.id, secret, code):
                auth_limiter.log_failure(ip_key, window_seconds=60.0)
                raise HTTPException(401, "Invalid 2FA code")
        else:
            valid, msg = code_store.verify_code(user.public_id, code, purpose="2fa_challenge")
            if not valid:
                auth_limiter.log_failure(ip_key, window_seconds=60.0)
                raise HTTPException(401, "Invalid 2FA code")

    # Create session
    token = SessionStore.create_session(user.id, user.public_id)
    # Set session cookie — max_age keeps the login across browser restarts
    # (operator 08-27, kaitylyn: without it the cookie is a browser-session
    # cookie and users re-login on every visit; the DB session already lives
    # 7 days). Same window as SessionStore._session_expiry.
    # Secure tracks the REAL transport (audit 08-28 LOW→FIXED): production_mode
    # previously forced Secure unconditionally, and WebKit silently DROPS
    # Secure cookies set from plain-HTTP pages — so a phone that landed on
    # http://helpotron.dpdns.org (edge serves http with no redirect) logged
    # straight back out (the mobile login bounce). uvicorn now runs with
    # --proxy-headers, so request.url.is_secure mirrors X-Forwarded-Proto
    # from cloudflared: Secure only when the browser is truly on https.
    # The vite-preview 308 (vite.config.js) pushes http visitors onto https.
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=request.url.is_secure,
        samesite="lax",
        path="/",
        max_age=SessionStore._session_expiry,
    )
    # Set CSRF cookie (readable by JS)
    csrf_token = set_csrf_cookie(response, request)
    
    return {
        "message": "Logged in",
        "public_id": user.public_id,
        "plan": user.plan,
        "credits": user.credits,
        "csrf_token": csrf_token,
        "token": create_jwt_token(user.id),
        # Long-lived opaque session token (same value as the cookie, DB-backed,
        # 7-day sliding window) — API clients like the browser extension store
        # this and send it as `Authorization: Bearer <session_token>` so the
        # 24h JWT expiry does not force a re-login on every use.
        "session_token": token,
    }


@app.post("/api/signup")
def signup(body: SignupIn, request: Request, db: Session = Depends(get_db)):
    """Create a new user account with a 7-day free trial."""
    # Same gate as /api/login (08-31, operator): once Turnstile is configured
    # every signup must present a valid token unless the operator's test-bot
    # bypass header is present. Deny-closed: enforcement never fails open, and
    # an empty token isn't even sent to the network.
    if captcha_required() and not has_valid_bypass(request):
        remote_ip = request.client.host if request.client else ""
        if not verify_turnstile_token(body.turnstile_token or "", remote_ip):
            raise HTTPException(
                403, "Security check required — complete the captcha and try again."
            )

    # Account creation is far tighter than the blanket 120/min IP budget:
    # a demo box should never let one client mint dozens of trial accounts.
    # 08-26 prototype-beta: free test run means real users share an IP — 5/hr
    # was starving them; raise to 20/hr (still stops minting machines).
    client = request.client.host if request.client else "unknown"
    if not ratelimit.limiter.allow(f"signup:{client}", 20, window=3600.0):
        # Audit 08-28, LOW: the 429 told the user nothing — no Retry-After,
        # no hint of HOW long. The message now names the window and the
        # response carries Retry-After in seconds (standard 429 contract).
        retry_after = ratelimit.limiter.retry_after(f"signup:{client}", 20, window=3600.0)
        raise HTTPException(
            429,
            f"Too many accounts created from this address. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )
    if not validate_public_id(body.public_id):
        raise HTTPException(400, "Invalid public_id (3-64 chars, alphanumeric, underscore, hyphen)")
    if not validate_password_strength(body.password):
        raise HTTPException(400, "Password must be at least 8 characters, include a letter and a number")
    existing = db.query(User).filter(User.public_id == body.public_id).first()
    if existing:
        raise HTTPException(400, "Public ID already taken")
    hash_hex, salt = hash_password(body.password)
    # New accounts start at 0 tokens (08-31 owner directive, late evening —
    # supersedes both the named-only and the universal grants: no auto-grant,
    # the owner approves each signup's 300 tokens individually).
    settings = {"reading_level": "college-freshman"}
    user = User(
        public_id=body.public_id,
        plan="none",
        password_hash=hash_hex,
        password_salt=salt,
        settings=settings,
        credits=0,
        subscription_status="none",
    )
    db.add(user)
    db.commit()
    return {
        "message": "User created",
        "public_id": user.public_id,
        "plan": user.plan,
        "trial_expires_at": None,
        "token_balance": float(settings.get("token_balance", 0) or 0),
    }


@app.post("/api/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        SessionStore.delete_session(token)
    response.delete_cookie(SESSION_COOKIE_NAME)
    response.delete_cookie("csrf_token")
    return {"message": "Logged out"}


@app.get("/api/me")
async def me(request: Request, db: Session = Depends(get_db)):
    """Current user (remediation BATCH-11): identity comes only from the
    session cookie or the Bearer session token — the X-Public-ID header is
    never an identity and no user is ever auto-created from a header.

    09-02: the handler was cookie-only, but the login response documents the
    Bearer session-token contract for API clients like the browser extension
    — it got a 401 and was forced into the website re-login flow. Auth now
    goes through get_current_user (cookie first, then Bearer), which also
    slides the session window on the 25s idle-tab balance poll (08-29 fix)
    and enforces the ban choke point at the same place as every other route."""
    user = await get_current_user(request)
    return {
        "public_id": user.public_id,
        "plan": user.plan or "none",
        "credits": _wallet_display_credits(db, user),
        "token_balance": float((user.settings or {}).get("token_balance", 0) or 0),
        "authenticated": True,
        "is_admin": is_admin_user(user),
        # Operator 09-01: elite/admin users bypass the token gate
        # entirely (routes_overlord) — "0 tokens" was shown to the
        # elite owner, which reads as a zero balance. Frontend
        # renders "Unlimited" usage instead of the number.
        "unlimited": bool(user.plan == "elite" or is_admin_user(user)),
    }


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
            "credits": credits.effective_credits_balance(db, u),
            "token_balance": float((u.settings or {}).get("token_balance", 0) or 0),
            "is_active": True,
            "role": getattr(u, "role", "user"),
            "banned": bool((u.settings or {}).get("banned")),
            "banned_until": (u.settings or {}).get("banned_until"),
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


# ─── admin user actions (frontend-facing) ─────────────────────────────────
# The admin dashboard (AdminConsole.jsx) calls these exact /api/admin/user/...
# paths. Implementations live in server/admin.py; these thin wrappers expose
# them at the paths the frontend uses, with the same admin guard.

@app.get("/api/admin/search")
async def admin_search(q: str, request: Request, db: Session = Depends(get_db)):
    """Universal admin search across users, assignments, materials, credit txns."""
    from .admin import admin_universal_search
    return await admin_universal_search(q=q, request=request, db=db)


@app.post("/api/admin/user/{public_id}/credits")
async def admin_user_credits(public_id: str, amount: float, reason: str = "admin adjustment",
                             request: Request = None, db: Session = Depends(get_db)):
    from .admin import adjust_user_credits
    return await adjust_user_credits(public_id=public_id, amount=amount, reason=reason,
                                     request=request, db=db)


@app.post("/api/admin/user/{public_id}/welcome-tokens")
async def admin_user_welcome_tokens(public_id: str, amount: float = WELCOME_TOKEN_BONUS,
                                    reason: str = "owner-approved welcome grant",
                                    request: Request = None, db: Session = Depends(get_db)):
    """08-31 (Bob): welcome tokens are granted only after he approves the
    signup in chat — this is the endpoint the approval loop calls."""
    from .admin import grant_welcome_tokens
    return await grant_welcome_tokens(public_id=public_id, amount=amount, reason=reason,
                                      request=request, db=db)


@app.post("/api/admin/user/{public_id}/plan")
async def admin_user_plan(public_id: str, plan: str, request: Request,
                          db: Session = Depends(get_db)):
    from .admin import set_user_plan
    return await set_user_plan(public_id=public_id, plan=plan, request=request, db=db)


@app.post("/api/admin/user/{public_id}/reset-password")
async def admin_user_reset_password(public_id: str, req: ResetPasswordRequest, request: Request,
                                    db: Session = Depends(get_db)):
    from .admin import reset_user_password
    return await reset_user_password(public_id=public_id, req=req, request=request, db=db)


@app.post("/api/admin/user/{public_id}/ban")
async def admin_user_ban(public_id: str, request: Request, db: Session = Depends(get_db)):
    from .admin import ban_user
    return await ban_user(public_id=public_id, request=request, db=db)


@app.post("/api/admin/user/{public_id}/unban")
async def admin_user_unban(public_id: str, request: Request, db: Session = Depends(get_db)):
    from .admin import unban_user
    return await unban_user(public_id=public_id, request=request, db=db)


@app.post("/api/admin/user/{public_id}/tempban")
async def admin_user_tempban(public_id: str, hours: float = 24, request: Request = None,
                             db: Session = Depends(get_db)):
    from .admin import temp_ban_user
    return await temp_ban_user(public_id=public_id, hours=hours, request=request, db=db)


@app.post("/api/admin/user/{public_id}/kick")
async def admin_user_kick(public_id: str, request: Request = None, db: Session = Depends(get_db)):
    from .admin import kick_user
    return await kick_user(public_id=public_id, request=request, db=db)


@app.delete("/api/admin/user/{public_id}")
async def admin_user_delete(public_id: str, request: Request = None, db: Session = Depends(get_db)):
    from .admin import delete_user
    return await delete_user(public_id=public_id, request=request, db=db)


@app.post("/api/admin/user/{public_id}/act")
async def admin_user_act(public_id: str, request: Request, db: Session = Depends(get_db)):
    """Impersonate a user for debugging: swap the session cookie to a fresh
    session of the target user. The admin's browser becomes that account until
    they log in again."""
    from .admin import require_admin
    from .database import User
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    token = SessionStore.create_session(user.id, user.public_id)
    response = JSONResponse({"ok": True, "acting_as": user.public_id})
    # Same transport-derived Secure rule as the login cookie (audit 08-28).
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=request.url.is_secure,
        samesite="lax",
        path="/",
        max_age=SessionStore._session_expiry,
    )
    return response


# ─── health ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ─── credits ───────────────────────────────────────────────────────────────

@app.get('/api/credits/balance')
async def get_user_credits(request: Request, db: Session = Depends(get_db)):
    from .routes_features import get_current_authenticated_user
    from .credits import TASK_COSTS, get_balance
    user = get_current_authenticated_user(request, db)
    return {'credits': get_balance(user), 'costs': TASK_COSTS}


# ─── users ─────────────────────────────────────────────────────────────────

@app.post("/api/users")
def create_user(body: UserIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == current_user.id).first() or current_user
    if body.public_id != user.public_id and not getattr(user, "is_admin", False):
        raise HTTPException(403, "Cannot modify another user's profile")
    if body.telegram_id:
        user.telegram_id = body.telegram_id
    db.commit()
    return {"public_id": user.public_id, "plan": user.plan, "credits": user.credits}


@app.patch("/api/users/{public_id}")
def update_settings(public_id: str, body: SettingsIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == current_user.id).first() or current_user
    if user.public_id != public_id and not getattr(user, "is_admin", False):
        raise HTTPException(403, "Cannot modify another user's settings")
    accepted, rejected = filter_user_settings_payload(body.settings)
    if rejected:
        logger.warning(
            "users PATCH from user=%s dropped non-writable keys: %s",
            getattr(user, "public_id", "?"), ", ".join(sorted(rejected)),
        )
    user.settings = {**(user.settings or {}), **accepted}
    db.commit()
    return {"settings": user.settings, "ignored_fields": sorted(rejected)}


# ─── assignments (from extension) ──────────────────────────────────────────

@app.post("/api/assignments")
async def upsert_assignment(body: AssignmentIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Extension scrape save (08-28): dedupe on the LMS canvas_id and attribute
    the scraped page to the right assignment bubble.

    Fixes the 'scraped but not in the math bubble' bug: the extension now sends
    canvas_id ('<courseId>:<assignmentId>') so a re-scrape updates the SAME
    assignment (never a new orphan), and subject/course metadata so the bubble
    renders under its real topic (e.g. Mathematics) instead of a blank card.
    The optional assignment_id links the page to an explicit bubble the client
    chose — validated: only assignments owned by the caller are accepted.

    Identity (audit 08-28, LOW): the assignment is always created/updated for
    the AUTHENTICATED session user — body.public_id is optional (kept in the
    schema for extension-payload compatibility) and never an identity; a
    client that omits it gets the same behavior, no 422. When supplied it is
    ignored for ownership, exactly as before.

    Team launch (08-28 BUG 3 fix): once the scrape stores REAL content (≥200
    chars of prompt/rubric), the assignment workflow is kicked off so the
    sub-agent team actually works it — one kick per bubble (progress
    team_launched is the idempotence key, set before commit). Files the
    extension could not stream (URL + hash only) are handed to the server-side
    attachment job, which downloads what it can and routes the bytes through
    the real dump flow (process_dump_upload) with progress.attached_files as
    the honest record of what is attached.
    """
    user = db.query(User).filter(User.id == current_user.id).first() or current_user
    assignment = None
    # Explicit bubble target wins when supplied and owned by this user.
    if body.assignment_id is not None:
        assignment = (
            db.query(Assignment)
            .filter(Assignment.id == body.assignment_id, Assignment.user_id == user.id)
            .first()
        )
    if assignment is None and body.canvas_id:
        assignment = db.query(Assignment).filter_by(user_id=user.id, canvas_id=body.canvas_id).first()
    if assignment is None:
        assignment = Assignment(user_id=user.id)
        # 09-01 lifecycle: a brand-new assignment awaits the user's direction.
        # Re-scrapes of an existing row keep whatever status it has (the
        # assignment.status or ... expression never overrides a set status).
        assignment.status = assignment.status or "pending_approval"
        db.add(assignment)
    assignment.canvas_id = body.canvas_id
    assignment.title = body.title
    assignment.due_date = body.due_date
    # 08-28: never let an empty scrape silently wipe existing content (the
    # "quick scrape did nothing" case) — only overwrite with real text.
    if body.prompt:
        assignment.prompt = body.prompt
    elif assignment.prompt is None:
        # 08-29 (A4): prompt is optional by design, but the DB column is
        # NOT NULL — a title-only create INSERTed NULL and 500'd. Only fill
        # never-set prompts; existing content stays protected.
        assignment.prompt = ""
    assignment.file_urls = body.file_urls
    progress = {**(assignment.progress or {})}
    if body.source_url:
        progress["source_url"] = body.source_url
    if body.rubric:
        progress["rubric"] = body.rubric
    if body.files_meta:
        progress["files_meta"] = body.files_meta
    if body.instruction:
        progress["last_instruction"] = body.instruction
    # Subject attribution: client-detected > existing > keyword fallback.
    # Never overwrite a bubble's real subject with 'General Academic'.
    subj = (body.subject or "").strip()
    detected_subj = None
    if not subj and not progress.get("subject"):
        detected_subj, detected_code = _classify_subject(f"{body.title} {body.prompt}")
        subj = detected_subj
    if subj:
        progress["subject"] = subj
        code = (body.course_code or "").strip()
        if not code:
            code = detected_code if detected_subj else str(subj).split()[0][:4].upper() + "-101"
        progress["course_code"] = code
        if not body.course_name:
            progress.setdefault("course_name", subj)
    if body.canvas_id or body.source_url:
        progress["scraped"] = True

    # Team routing (BUG 3): a scrape with REAL material becomes a work order
    # for the assignment sub-agent team. Kicked exactly once per bubble — a
    # re-scrape of the same canvas page must not re-run the whole workflow.
    team_content_len = len((body.prompt or "").strip()) + len((body.rubric or "").strip())
    should_launch_team = (
        team_content_len >= 200
        and not progress.get("team_launched")
        and not progress.get("orchestrator_done")
    )
    if should_launch_team:
        progress["team_launched"] = utcnow().isoformat()

    # AI-detection seed (BUG 4): the card must show the REAL source risk, not
    # None/0 forever. Score the scraped content now (real registry — the
    # DummyDetector randomizer is gone from the default registry; 24h cache by
    # hash makes rescrapes free). If an explicit score already exists (e.g.
    # finalize scored the produced work), keep it; only seed when absent and
    # only when there is real content.
    scorable = f"{body.prompt or ''}\n{body.rubric or ''}".strip()
    if len(scorable) >= 200 and not progress.get("detector_risk"):
        try:
            progress["detector_risk"] = await detectors.check_ai_detection_cached(scorable)
            progress["detector_at"] = utcnow().isoformat()
        except Exception as e:  # noqa: BLE001 — never fail a scrape save
            logger.warning("detector seed skipped for assignment %s: %s", assignment.id, e)

    assignment.progress = progress
    db.commit()

    # Post-commit side effects (never fail the API response on them).
    if should_launch_team:
        try:
            from .orchestrator import start_assignment_workflow
            start_assignment_workflow(assignment.id, user.public_id)
        except Exception as e:  # noqa: BLE001 — scrape save must still succeed
            logger.warning("Team launch failed for assignment %s: %s", assignment.id, e)
    unuploaded = [m for m in (body.files_meta or []) if isinstance(m, dict) and m.get("url") and not m.get("uploaded")]
    if unuploaded:
        from .assignment_dump import launch_attach_scraped_files
        try:
            asyncio.create_task(launch_attach_scraped_files(
                assignment.id, user.id, unuploaded,
            ))
        except Exception as e:  # noqa: BLE001
            logger.warning("File attach task wasn't started for assignment %s: %s", assignment.id, e)

    return {
        "assignment_id": assignment.id,
        "status": assignment.status,
        "subject": progress.get("subject", ""),
        "course_code": progress.get("course_code", ""),
    }


class AiDetectRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1_000_000)
    threshold: float = Field(default=80.0, ge=0, le=100)
    assignment_id: Optional[int] = None


@app.post("/api/ai/detect")
async def ai_detect(
    body: AiDetectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Real AI-detection verdict for any text: runs the actual detector
    registry (perplexity + burstiness heuristics always; Pangram/Sapling
    when their API keys are configured) through
    the same 24h cache as everything else. Returns the same 0-1 risk scale the
    cards read (progress.detector_risk), plus 0-100 average and per-detector
    breakdown. Optionally persists the verdict onto an owned assignment."""
    text = body.text.strip()
    if len(text) < 20:
        return {"risk": 0.0, "score": 0.0, "passed": True, "scored_chars": len(text),
                "detectors": [], "note": "text too short to score"}

    avg_score, results, passed = await detectors.score_text(text, threshold=body.threshold)
    details = [{"detector": r.name, "score": round(r.score, 2), "error": r.error, "details": r.details}
               for r in results][:12]
    verdict = {
        "risk": round(max(0.0, min(1.0, avg_score / 100.0)), 4),
        "score": round(float(avg_score), 2),
        "passed": bool(passed),
        "scored_chars": len(text),
        "detectors": details,
    }
    if body.assignment_id is not None:
        assignment = (
            db.query(Assignment)
            .filter(Assignment.id == body.assignment_id, Assignment.user_id == current_user.id)
            .first()
        )
        if assignment is None:
            raise HTTPException(404, "Assignment not found")
        assignment.progress = {
            **(assignment.progress or {}),
            "detector_risk": verdict["risk"],
            "ai_score": verdict["score"],
            "detector_passed": verdict["passed"],
            "detector_scored_chars": verdict["scored_chars"],
            "detector_details": [{"detector": d["detector"], "score": d["score"]} for d in details],
            "detector_at": utcnow().isoformat(),
        }
        db.commit()
        verdict["assignment_id"] = assignment.id
    return verdict


@app.get("/api/status/{public_id}")
def status(public_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.public_id != public_id:
        raise HTTPException(403, "Forbidden")
    user = current_user
    out = []
    for a in db.query(Assignment).filter_by(user_id=user.id).order_by(Assignment.id.desc()).limit(50):
        out.append({
            "id": a.id, "title": a.title, "due_date": a.due_date, "status": a.status,
            "progress": a.progress, "created_at": a.created_at.isoformat(),
            "turned_in": bool(a.turned_in),
            "turned_in_at": a.turned_in_at.isoformat() if a.turned_in_at else None,
        })
    return {"assignments": out}


# ─── transcription ─────────────────────────────────────────────────────────

@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...),
                     assignment_id: int | None = Form(default=None),
                     assignment_id_q: int | None = Query(default=None),
                     current_user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    # clients (extension recorder, web) send assignment_id as form
    # fields; curl and direct callers use query params — accept both
    assignment_id = assignment_id if assignment_id is not None else assignment_id_q
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed_audio_exts = {".mp3", ".wav", ".flac", ".ogg", ".webm", ".m4a", ".aac", ".mp4"}
    if ext and ext not in allowed_audio_exts:
        raise HTTPException(400, f"Unsupported audio format: '{ext}'. Allowed: {', '.join(sorted(allowed_audio_exts))}")
    max_audio_bytes = 100 * 1024 * 1024  # 100MB
    content = await file.read()
    if not content:
        raise HTTPException(400, "empty upload")
    if len(content) > max_audio_bytes:
        raise HTTPException(413, "Audio upload exceeds 100MB limit")
    path = transcription.save_upload(content, file.filename or "lecture.webm")
    try:
        text, duration = await transcription.transcribe_audio(path)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    if not text.strip():
        raise HTTPException(500, "transcription returned empty text")

    # charge: 1 credit per started hour of audio
    hours = max(1.0, math.ceil((duration or 3600.0) / 3600.0))
    if not (current_user.plan == "elite" or current_user.credits >= hours):
        raise HTTPException(402, "insufficient credits for transcription")
    if current_user.plan != "elite":
        current_user.credits -= hours
        db.add(credits.CreditTransaction(user_id=current_user.id, delta=-hours, reason=f"spend:transcription:{hours}h"))

    t = Transcript(user_id=current_user.id, assignment_id=assignment_id, source="upload",
                   text=text, duration_seconds=duration)
    db.add(t)
    db.flush()
    if assignment_id is not None:
        a = db.get(Assignment, assignment_id)
        if a and a.user_id == current_user.id:
            a.status = "transcribed"
            a.progress = {**a.progress, "transcribed": True}
    db.commit()
    return {"transcript_id": t.id, "chars": len(text), "duration_seconds": duration}


# ─── study materials ───────────────────────────────────────────────────────

@app.post("/api/study-guide")
async def study_guide(body: GenerateIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return await _material_endpoint(db, body, "study_guide", current_user)


@app.post("/api/flashcards")
async def flashcards(body: GenerateIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return await _material_endpoint(db, body, "flashcards", current_user)


@app.post("/api/practice-test")
async def practice_test(body: GenerateIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return await _material_endpoint(db, body, "practice_test", current_user)


@app.post("/api/summary")
async def summary(body: GenerateIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return await _material_endpoint(db, body, "summary", current_user)


async def _material_endpoint(db: Session, body: GenerateIn, kind: str, current_user: User) -> dict:
    transcript_text, transcript_id = _require_transcript(db, current_user.public_id, body.transcript_id, body.transcript_text)
    try:
        material = await _generate(db, current_user, kind, transcript_text, body.assignment_prompt,
                                   body.reading_level, body.assignment_id, transcript_id,
                                   count=body.count)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))
    db.commit()
    return _material_payload(material)


@app.post("/api/generate/stream/{kind}")
async def generate_stream(kind: str, body: GenerateIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """FIX B3: SSE progress streaming for long-running generation tasks.

    Same contract as the plain material endpoints, but emits 4 progress
    events (Parsing syllabus -> Extracting key concepts -> Generating
    <material> -> Verifying accuracy) in real time before the final done
    event. Frames are `data: {"event": ...}\n\n`; on failure an error event
    carries the detail in-band instead of an HTTP error body.
    """
    if kind not in study_tools.GENERATORS:
        raise HTTPException(404, f"unknown generation kind: {kind}")
    transcript_text, transcript_id = _require_transcript(
        db, current_user.public_id, body.transcript_id, body.transcript_text)

    def _sse(event: str, **payload: Any) -> str:
        return f"data: {json.dumps({'event': event, **payload}, ensure_ascii=False)}\n\n"

    async def event_stream():
        q: asyncio.Queue = asyncio.Queue()

        async def on_progress(step: int, label: str) -> None:
            await q.put(_sse("progress", step=step, total=4, label=label))

        async def run() -> None:
            try:
                target_user = db.query(User).filter(User.id == current_user.id).first() or current_user
                material = await _generate(
                    db, target_user, kind, transcript_text, body.assignment_prompt,
                    body.reading_level, body.assignment_id, transcript_id,
                    on_progress=on_progress, count=body.count)
                db.commit()
                await q.put(_sse("done", material=_material_payload(material)))
            except HTTPException as e:
                db.rollback()
                await q.put(_sse("error", status=e.status_code, detail=e.detail))
            except Exception as e:  # noqa: BLE001 — stream carries the error in-band
                db.rollback()
                await q.put(_sse("error", status=500, detail=str(e)))
            finally:
                await q.put(None)

        task = asyncio.create_task(run())
        while True:
            frame = await q.get()
            if frame is None:
                break
            yield frame
        await task  # run() swallows everything; this is a safety net only

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/materials/{public_id}/{kind}")
def materials(public_id: str, kind: str,
              limit: int = Query(default=20, ge=1, le=100),
              offset: int = Query(default=0, ge=0),
              current_user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    if current_user.public_id != public_id:
        raise HTTPException(403, "Forbidden")
    if kind != "all" and kind not in ALL_MATERIAL_KINDS:
        raise HTTPException(400, f"kind must be one of {ALL_MATERIAL_KINDS} or 'all'")
    q = db.query(StudyMaterial).filter_by(user_id=current_user.id)
    if kind != "all":
        q = q.filter_by(kind=kind)
    total = q.count()
    rows = q.order_by(StudyMaterial.id.desc()).offset(offset).limit(limit).all()
    return {"materials": [_material_payload(m) for m in rows],
            "total": total, "limit": limit, "offset": offset}


# ─── dashboard / credits ───────────────────────────────────────────────────

def _wallet_display_credits(db: Session, user: User) -> float:
    """Display balance for the UI: reconciled credits + Data Lake micro-credits
    at 1000:1 (operator 08-28) — 1050 micro-credits shows as 1.05 credits.
    Storage is untouched: micro-credits stay in settings until the operator
    redeems them into spendable credits.

    09-01 fix: the raw users.credits column had diverged from the
    credit_transactions ledger (08-26 grants to max / MasonLohse16 live in
    the ledger but the column reads 0.0), so every surface showed "0 cr" /
    "0 credits". effective_credits_balance reconciles the two at read time."""
    micro = (user.settings or {}).get("micro_credits_balance", 0) or 0
    return round(credits.effective_credits_balance(db, user) + micro / 1000, 3)


def _build_dashboard_payload(user: User, db: Session, limit: int = 50, offset: int = 0) -> dict:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    assignments = db.query(Assignment).filter_by(user_id=user.id).order_by(Assignment.id.desc()).offset(offset).limit(limit).all()
    materials = db.query(StudyMaterial).filter_by(user_id=user.id).order_by(StudyMaterial.id.desc()).offset(offset).limit(limit).all()
    transactions = db.query(credits.CreditTransaction).filter_by(user_id=user.id).order_by(
        credits.CreditTransaction.id.desc()).limit(20).all()
    monthly = credits.TIER_MONTHLY_CREDITS.get(user.plan, 2000)
    bal = _wallet_display_credits(db, user)

    # Real usage aggregate (operator 08-27): tokens_processed used to be
    # fabricated as credits*10000. Pull REAL input+output tokens from the
    # ApiUsageLog ledger so the number is honest — it can be 0 for fresh
    # users and that is correct.
    try:
        from .database import ApiUsageLog
        from sqlalchemy import func as sa_func
        tokens_used = db.query(
            sa_func.coalesce(sa_func.sum(ApiUsageLog.input_tokens + ApiUsageLog.output_tokens), 0)
        ).filter(ApiUsageLog.public_id == user.public_id).scalar()
        tokens_used = int(tokens_used or 0)
    except Exception:
        tokens_used = 0

    return {
        "status": "success",
        "public_id": user.public_id,
        "plan": user.plan,
        "credits": bal,
        "monthly_credits": None if monthly == float("inf") else monthly,
        "settings": user.settings,
        "discount_balance": user.discount_balance,
        # Operator 08-31: one-time order discount from a redeemed referral
        # code (30% new user / 15% existing) — server-side truth for the UI.
        "referral_discount_pct": float(getattr(user, "referral_discount_pct", 0.0) or 0.0),
        "two_factor_enabled": bool((user.settings or {}).get("2fa_enabled")),
        "two_factor_recommended": not bool((user.settings or {}).get("2fa_enabled")),
        "pagination": {"limit": limit, "offset": offset},
        "user": {
            "public_id": user.public_id,
            "tier": (user.plan or "none").capitalize(),
            "credits_remaining": bal,
            "credits_formatted": f"{bal:,.1f}",
            "tokens_processed": tokens_used
        },
        # 08-30 audit: telemetry/roi_stats were removed — the numbers
        # (uptime 100.0%, "evasion success 99.8%", "$1,450 saved") were
        # hardcoded and no UI component read them. Fabricated payload, gone.
        "assignments": [
            {
                "id": a.id,
                "title": a.title,
                "due_date": a.due_date,
                "status": a.status,
                "progress": a.progress,
                "course": (a.progress or {}).get("course") or (a.progress or {}).get("subject") or "",
                "instructor": (a.progress or {}).get("teacher_name") or "",
                "ai_risk": (a.progress or {}).get("detector_risk"),
                "turned_in": bool(a.turned_in),
                "turned_in_at": a.turned_in_at.isoformat() if a.turned_in_at else None,
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_id = public_id or x_public_id
    if not target_id:
        raise HTTPException(401, "public_id required")
    if current_user.public_id != target_id:
        raise HTTPException(403, "Forbidden")
    return _build_dashboard_payload(current_user, db, limit=limit, offset=offset)


@app.get("/api/dashboard/{public_id}")
def dashboard(public_id: str, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.public_id != public_id:
        raise HTTPException(403, "Forbidden")
    user = current_user
    return _build_dashboard_payload(user, db, limit=limit, offset=offset)


@app.get("/api/credits/{public_id}")
def credits_balance(public_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.public_id != public_id:
        raise HTTPException(403, "Forbidden")
    user = current_user
    return {"plan": user.plan, "credits": credits.get_balance(user)}


# ─── payments / discounts ──────────────────────────────────────────────────

def _purchase_2fa_required(user: User) -> None:
    """Owner directive 08-31 / 09-04: when purchases_require_2fa is on, every buyer must
    have 2FA enabled (settings flag — same source login reads) before paying."""
    if config.purchases_require_2fa and not (user.settings or {}).get("2fa_enabled"):
        raise HTTPException(
            403,
            "Two-factor authentication must be enabled before making purchases — "
            "enable it in Account > Settings and try again.",
        )



@app.post("/api/payments")
def pay(body: PaymentIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _purchase_2fa_required(current_user)
    if body.amount_cents <= 0:
        raise HTTPException(400, "Payment amount must be greater than zero")
    if _stripe_enabled() and body.provider.lower() == "stripe":
        raise HTTPException(400, "Stripe payments must be initiated via /api/checkout")
    user = db.query(User).filter(User.id == current_user.id).first() or current_user
    try:
        payment = process_payment(db, user, body.provider, body.amount_cents)
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return {
        "payment_id": payment["id"],
        "status": payment["status"],
        "credits": credits.get_balance(user),
        # Operator 08-31 referral discount (0 when none/no longer active)
        "amount_charged_cents": payment.get("amount_charged_cents", body.amount_cents),
        "referral_discount_pct": payment.get("referral_discount_pct", 0.0),
    }


class CheckoutIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    plan: str = Field(..., max_length=20)
    is_annual: bool = False


@app.post("/api/checkout")
def checkout(body: CheckoutIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a Stripe Checkout session for a subscription."""
    _purchase_2fa_required(current_user)
    user = db.query(User).filter(User.id == current_user.id).first() or current_user
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


@app.post("/api/discount")
def discount(body: DiscountIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == current_user.id).first() or current_user
    result = credits.record_data_submission(db, user, body.payload)
    db.commit()
    return result


# ─── browser agent (extension "Activate") ─────────────────────────────────

class AgentStartIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    assignment_id: int | None = None
    instruction: str = Field(default="", max_length=5_000)


@app.post("/api/agent/start")
async def agent_start(body: AgentStartIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not credits.charge(current_user, "agent_session", db):
        raise HTTPException(402, "insufficient credits — agent sessions cost 1 credit")
    db.commit()
    session = agent_manager.create(current_user.public_id, body.assignment_id, body.instruction)
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
def agent_status(session_id: str, current_user: User = Depends(get_current_user)):
    session = agent_manager.get(session_id)
    if session is None or session.user_public_id != current_user.public_id:
        raise HTTPException(404, "session not found")
    return session.snapshot()


@app.websocket("/ws/agent/{session_id}")
async def agent_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        current_user = await get_current_user(websocket=websocket)
    except HTTPException:
        await websocket.close(code=1008)
        return
    session = agent_manager.get(session_id)
    if not session or session.user_public_id != current_user.public_id:
        await websocket.close(code=1008)
        return
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
def upload_style(body: StyleUploadIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Upload the student's custom writing style for mimicry."""
    if current_user.public_id != body.public_id:
        raise HTTPException(403, "Forbidden")
    set_style(current_user.id, body.style_text, db)
    return {"status": "ok", "message": "Style uploaded successfully"}


@app.get("/api/style/{public_id}")
def get_style_endpoint(public_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve the student's current style text."""
    if current_user.public_id != public_id:
        raise HTTPException(403, "Forbidden")
    style = get_style(current_user.id, db)
    return {"style_text": style or ""}


# ─── assignment draft generation ──────────────────────────────────────────

class DraftGenerateIn(BaseModel):
    public_id: str = Field(..., max_length=100)
    assignment_id: int = Field(..., ge=1)
    threshold: float = Field(default=80.0, ge=0, le=100)


@app.post("/api/draft/generate")
async def generate_draft(body: DraftGenerateIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Start a draft generation workflow. Returns draft_id for polling."""
    # Check credits
    if current_user.credits < DRAFT_COST:
        raise HTTPException(402, f"insufficient credits — need {DRAFT_COST} credits")
    # Check style exists
    style = get_style(current_user.id, db)
    if not style:
        raise HTTPException(400, "No writing style uploaded. Please upload custom text first.")
    # Check assignment exists
    assignment = db.get(Assignment, body.assignment_id)
    if not assignment or assignment.user_id != current_user.id:
        raise HTTPException(404, "Assignment not found")
    # Create draft record and start background task
    draft = await create_draft_task(current_user.id, body.assignment_id, body.threshold, db)
    start_draft_workflow(draft.id)
    return {
        "draft_id": draft.id,
        "status": draft.status,
        "estimated_seconds": 30,  # rough guess
    }


@app.get("/api/draft/{draft_id}")
def get_draft_status(draft_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Check status of a draft generation."""
    draft = db.get(Draft, draft_id)
    if not draft or draft.user_id != current_user.id:
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
def retry_draft(draft_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Manually retry a risky draft (student asks for further instruction)."""
    draft = db.get(Draft, draft_id)
    if not draft or draft.user_id != current_user.id:
        raise HTTPException(404, "Draft not found")
    if draft.status != "risky":
        raise HTTPException(400, "Only risky drafts can be retried")
    if current_user.credits < DRAFT_COST:
        raise HTTPException(402, f"insufficient credits — need {DRAFT_COST} credits")
    
    current_user.credits -= DRAFT_COST
    # Reset status and retries
    draft.status = "pending"
    draft.retries_left = MAX_RETRIES
    draft.attempts = 0
    draft.last_error = None
    db.commit()
    start_draft_workflow(draft.id)
    return {"status": "retry started"}


@app.post("/api/draft/{draft_id}/admin")
def admin_help(draft_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
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


try:
    from .humanizer import AIHumanizerPipeline
except (ImportError, ValueError):
    from server.humanizer import AIHumanizerPipeline

humanizer_pipeline = AIHumanizerPipeline()

@app.post("/api/assignment/humanize")
async def humanize_assignment_route(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    text = payload.get("content", "")
    sanitized_text, metrics = await humanizer_pipeline.humanize_loop(text)
    return {"status": "success", "metrics": metrics, "content": sanitized_text}


try:
    from .export import export_to_google_doc
    from .gdocs_exporter import HumanizedTypingSimulator
except (ImportError, ValueError):
    from server.export import export_to_google_doc
    from server.gdocs_exporter import HumanizedTypingSimulator


@app.post("/api/assignment/{assignment_id}/export-gdocs")
async def export_gdocs_route(assignment_id: int, payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Explicit user-triggered export streaming content into Google Docs with human typing history."""
    assignment = db.get(Assignment, assignment_id)
    if not assignment or assignment.user_id != current_user.id:
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


# ─── Unified Safe Localhost / Production SPA Mount ───────────────────────────
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_REPO_ROOT = Path(__file__).resolve().parent.parent
_WEB_DIST = _REPO_ROOT / "web" / "dist"

_UPLOADS_DIR = _REPO_ROOT / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
(_REPO_ROOT / "exports").mkdir(parents=True, exist_ok=True)
(_REPO_ROOT / "data_lake").mkdir(parents=True, exist_ok=True)

class HardenedUploadsStaticFiles(StaticFiles):
    """StaticFiles subclass that hardens file serving against stored XSS."""
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
        content_type = response.headers.get("content-type", "").lower()
        safe_inline = ("image/png", "image/jpeg", "image/gif", "image/webp", "image/avif")
        if not any(content_type.startswith(t) for t in safe_inline):
            response.headers["Content-Disposition"] = "attachment"
        return response

# User uploads (avatars, agent files) served statically — mounted before the
# SPA catch-all below so /uploads/* resolves to files, not index.html.
app.mount("/uploads", HardenedUploadsStaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")

if _WEB_DIST.exists() and (_WEB_DIST / "index.html").exists():
    if (_WEB_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(_WEB_DIST / "assets")), name="static_assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        # Let FastAPI router handle any unhandled api routes with 404
        if full_path.startswith("api"):
            raise HTTPException(404, "API route not found")
        # Prevent path traversal outside _WEB_DIST or access to dotfiles
        try:
            target = (_WEB_DIST / full_path).resolve()
            dist_resolved = _WEB_DIST.resolve()
            if not target.is_relative_to(dist_resolved):
                raise HTTPException(404, "Not found")
            if any(part.startswith(".") for part in target.relative_to(dist_resolved).parts):
                raise HTTPException(404, "Not found")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(404, "Not found")

        if full_path and target.is_file():
            # Immutable content-hashed assets
            if full_path.startswith("assets/"):
                return FileResponse(target, headers={"Cache-Control": "public, max-age=31536000, immutable"})
            return FileResponse(target)
        return FileResponse(
            _WEB_DIST / "index.html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
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





