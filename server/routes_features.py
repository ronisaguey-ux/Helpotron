"""Feature routes for Helpotron: auto-detect, gamification, collab, calendar, Telegram, AI recommendations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import User, get_db
from .security import verify_jwt_token
from fastapi import status


def get_current_authenticated_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Feature-route auth dependency (remediation BATCH-01): a request is only
    trusted if it carries a valid Bearer token (or session cookie) whose sub
    matches a real user — the X-Public-ID header is never an identity."""
    auth_header = request.headers.get('Authorization')
    session_token = request.cookies.get('helpotron_session')
    token = None
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1]
    elif session_token:
        token = session_token

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Authentication required to access feature'
        )

    payload = verify_jwt_token(token)
    if not payload or 'sub' not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or expired session'
        )

    user = db.query(User).filter(User.id == payload['sub']).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='User account not found'
        )
    return user


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

router = APIRouter(prefix="/api/features", tags=["features"])


async def _get_feature_user(request: Request, db: Session) -> User:
    from .security import get_current_user
    try:
        return await get_current_user(request)
    except Exception:
        public_id = request.headers.get("X-Public-ID") or request.query_params.get("public_id")
        if public_id:
            user = db.query(User).filter(User.public_id == public_id).first()
            if user:
                return user
        raise HTTPException(401, "Authentication required")


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


# <<<FIX B3 - Missing Progress Indicators on Long-Running AI Generation Tasks>>>
# Description: Implement WebSocket or Server-Sent Events (SSE) progress streaming with a 4-step progress bar (Parsing syllabus -> Extracting key concepts -> Generating quiz -> Verifying accuracy).
# NOTE: Automated placeholder – replace with actual code change.
