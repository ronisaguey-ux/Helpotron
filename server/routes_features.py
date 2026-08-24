"""Feature routes for Helpotron: auto-detect, gamification, collab, calendar, Telegram, AI recommendations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from .database import User, get_db
    from .security import SessionStore, SESSION_COOKIE_NAME, verify_jwt_token
except (ImportError, ValueError):
    from server.database import User, get_db
    from server.security import SessionStore, SESSION_COOKIE_NAME, verify_jwt_token

from fastapi import status


def get_current_authenticated_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Feature-route auth dependency (remediation BATCH-01): a request is only
    trusted if it carries a valid session cookie OR Bearer token — the
    X-Public-ID header is never an identity.

    The login flow issues an opaque session token (SessionStore / UserSession
    table), so the cookie path is resolved through the session store first;
    the Bearer JWT path is kept for API clients."""
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if session_token:
        session = SessionStore.get_session(session_token)
        if session:
            SessionStore.refresh_session(session_token)
            user = db.query(User).filter(User.id == session['user_id']).first()
            if user:
                return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or expired session'
        )

    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        payload = verify_jwt_token(auth_header.split(' ', 1)[1])
        if payload and 'sub' in payload:
            user = db.query(User).filter(User.id == payload['sub']).first()
            if user:
                return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Authentication required to access feature'
    )


try:
    from .features import (
        detect_assignment_type,
        get_user_stats,
        FriendRequest,
        CalendarSync,
        TelegramNotifier,
        recommend_next_study,
        set_theme,
        get_theme,
    )
except (ImportError, ValueError):
    from server.features import (
        detect_assignment_type,
        get_user_stats,
        FriendRequest,
        CalendarSync,
        TelegramNotifier,
        recommend_next_study,
        set_theme,
        get_theme,
    )


router = APIRouter(prefix="/api/features", tags=["features"])


async def _get_feature_user(request: Request, db: Session) -> User:
    # Remediation BATCH-01: strict auth only — session cookie or Bearer JWT.
    # The X-Public-ID header / public_id query fallback is gone (spoofing).
    from .security import get_current_user
    return await get_current_user(request)


@router.get("/costs/intelligence")
async def my_cost_intelligence(request: Request, db: Session = Depends(get_db)):
    """User-facing cost intelligence — real breakdown from ApiUsageLog:
    per-tier and per-subject spend, monthly total, spending limit + buffer.
    Feeds the CostIntelligenceSection in the Credits & Billing view."""
    user = get_current_authenticated_user(request, db)
    from .cost_tracking import get_user_cost_intelligence
    return get_user_cost_intelligence(user.id, db)


# ─── 1. AUTO-DETECT ASSIGNMENT TYPE ────────────────────────────────────────

class DetectTypeRequest(BaseModel):
    prompt: str
    title: str = ""


@router.post("/detect-type")
async def detect_type(req: DetectTypeRequest):
    return {"type": detect_assignment_type(req.prompt, req.title)}


# ─── 2. GAMIFICATION ──────────────────────────────────────────────────────

@router.get("/stats")
async def stats(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    return get_user_stats(user, db)


# ─── 3. COLLABORATIVE STUDY GROUPS ──────────────────────────────────────

class FriendRequestModel(BaseModel):
    target_username: str


@router.post("/friend-request")
async def send_friend_request(req: FriendRequestModel, request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    result = FriendRequest.send_request(db, user, req.target_username)
    return {"message": result}


@router.post("/friend-accept")
async def accept_friend_request(req: FriendRequestModel, request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    result = FriendRequest.accept_request(db, user, req.target_username)
    return {"message": result}


@router.get("/friends")
async def list_friends(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    return {"friends": FriendRequest.get_friends(user)}


class ShareMaterialModel(BaseModel):
    friend_username: str
    material_id: int


@router.post("/share-material")
async def share_material(req: ShareMaterialModel, request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    result = FriendRequest.share_material(db, user, req.friend_username, req.material_id)
    return {"message": result}


# ─── 4. CALENDAR INTEGRATION ─────────────────────────────────────────────

@router.get("/calendar/deadlines")
async def get_calendar_deadlines(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    from .database import Assignment
    assignments = db.query(Assignment).filter(Assignment.user_id == user.id).all()
    return {"deadlines": CalendarSync.sync_deadlines(user, assignments)}


# ─── 5. TELEGRAM NOTIFICATIONS ──────────────────────────────────────────

class TelegramConfigModel(BaseModel):
    bot_token: str
    chat_id: str


@router.post("/telegram/configure")
async def configure_telegram(req: TelegramConfigModel, request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    settings = user.settings or {}
    settings["telegram_bot_token"] = req.bot_token
    settings["telegram_chat_id"] = req.chat_id
    user.settings = settings
    db.commit()
    return {"message": "Telegram configured successfully"}


@router.post("/telegram/test")
async def test_telegram(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    result = TelegramNotifier.send_message(user, "✅ Helpotron test notification!")
    return {"message": result}


# ─── 6. AI RECOMMENDATIONS ───────────────────────────────────────────────

@router.get("/recommend")
async def recommend(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    return {"recommendation": recommend_next_study(user, db)}


# ─── 7. THEME SETTINGS ───────────────────────────────────────────────────

class ThemeModel(BaseModel):
    theme: str  # dark, light, auto


@router.post("/theme")
async def set_user_theme(req: ThemeModel, request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    result = set_theme(user, req.theme)
    db.commit()
    return {"message": result}


@router.get("/theme")
async def get_user_theme(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    return {"theme": get_theme(user)}


# ─── 8. FERPA/GDPR SELF-SERVICE ACCOUNT DELETION ─────────────────────────

@router.post("/account/delete")
async def delete_user_account(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    from .database import Assignment, StudySet, DraftSubmission, DumpItem
    
    # Cascade delete all student study data
    db.query(DraftSubmission).filter(DraftSubmission.public_id == user.public_id).delete(synchronize_session=False)
    db.query(StudySet).filter(StudySet.user_id == user.public_id).delete(synchronize_session=False)
    db.query(Assignment).filter(Assignment.public_id == user.public_id).delete(synchronize_session=False)
    db.query(DumpItem).filter(DumpItem.user_id == user.public_id).delete(synchronize_session=False)
    
    db.delete(user)
    db.commit()
    
    return {"status": "success", "message": "Account and all associated academic data permanently deleted."}

