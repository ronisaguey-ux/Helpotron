"""Feature routes for Helpotron: auto-detect, gamification, collab, calendar, Telegram, AI recommendations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import User, get_db
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
