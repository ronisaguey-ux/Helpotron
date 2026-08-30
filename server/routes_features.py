"""Feature routes for Helpotron: auto-detect, gamification, collab, calendar, Telegram, AI recommendations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from .database import User, get_db
    from .security import SessionStore, SESSION_COOKIE_NAME, verify_jwt_token, is_user_banned
except (ImportError, ValueError):
    from server.database import User, get_db
    from server.security import SessionStore, SESSION_COOKIE_NAME, verify_jwt_token, is_user_banned

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
                if is_user_banned(user):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail='Account suspended'
                    )
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
                if is_user_banned(user):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail='Account suspended'
                    )
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


def _bind_to_session(db: Session, user: User) -> User:
    """Re-fetch ``user`` inside ``db``.

    ``_get_feature_user`` resolves identity through ``get_current_user``, which
    opens and closes its own session, so the instance it returns is detached —
    writing to it and calling ``db.commit()`` persists nothing, and
    ``db.refresh()`` raises. Every write path below goes through this first.
    """
    bound = db.query(User).filter(User.id == user.id).first()
    if bound is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    return bound


def _telegram_status_payload(user) -> dict:
    """Connection state for the settings UI — never returns the bot token."""
    token, chat_id = TelegramNotifier.credentials(user)
    return {
        "connected": bool(token and chat_id),
        "chat_id": chat_id,
        # Enough to recognise which bot is wired up, not enough to use it.
        "bot_hint": f"…{token[-4:]}" if token and len(token) >= 4 else None,
    }


@router.get("/telegram/status")
async def telegram_status(request: Request, db: Session = Depends(get_db)):
    """Whether this account has a working Telegram bot attached.

    Audit 08-29: the settings page hardcoded Telegram (and Canvas) as
    "connected" for every account. This is the read path that lets the UI show
    the truth instead.
    """
    user = await _get_feature_user(request, db)
    return _telegram_status_payload(user)


class TelegramTokenModel(BaseModel):
    bot_token: str


@router.post("/telegram/inspect")
async def inspect_telegram_bot(req: TelegramTokenModel, request: Request, db: Session = Depends(get_db)):
    """Step 2 of setup: confirm the pasted BotFather token names a real bot."""
    await _get_feature_user(request, db)
    result = await TelegramNotifier.describe_bot(req.bot_token)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["detail"])
    return result


@router.post("/telegram/find-chat")
async def find_telegram_chat(req: TelegramTokenModel, request: Request, db: Session = Depends(get_db)):
    """Step 3 of setup: read the chat ID out of the user's own first message.

    Telegram will not reveal a chat ID until the human messages the bot, and
    making students dig for a numeric ID is where this integration normally
    dies. They say hi to their bot; we read it back.
    """
    await _get_feature_user(request, db)
    result = await TelegramNotifier.resolve_chats(req.bot_token)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["detail"])
    return result


@router.post("/telegram/configure")
async def configure_telegram(req: TelegramConfigModel, request: Request, db: Session = Depends(get_db)):
    """Attach a Telegram bot after verifying the credentials actually work.

    The previous version stored whatever was posted and replied "configured
    successfully", so a typo in the token produced a connected-looking account
    that could never deliver a message. Credentials are only persisted once
    Telegram itself has accepted them.
    """
    user = await _get_feature_user(request, db)
    bot_token = (req.bot_token or "").strip()
    chat_id = (req.chat_id or "").strip()
    if not bot_token or not chat_id:
        raise HTTPException(status_code=400, detail="Both a bot token and a chat ID are required.")

    probe = User(settings={"telegram_bot_token": bot_token, "telegram_chat_id": chat_id})
    result = await TelegramNotifier.send_message(
        probe, "✅ Helpotron is connected. Notifications will arrive here."
    )
    if not result["sent"]:
        raise HTTPException(status_code=400, detail=result["detail"])

    bound = _bind_to_session(db, user)
    settings = dict(bound.settings or {})
    settings["telegram_bot_token"] = bot_token
    settings["telegram_chat_id"] = chat_id
    bound.settings = settings
    db.commit()
    return {"message": "Telegram connected. A confirmation was sent to your chat.", **_telegram_status_payload(bound)}


@router.post("/telegram/disconnect")
async def disconnect_telegram(request: Request, db: Session = Depends(get_db)):
    """Remove the stored bot credentials for this account."""
    user = await _get_feature_user(request, db)
    bound = _bind_to_session(db, user)
    settings = dict(bound.settings or {})
    settings.pop("telegram_bot_token", None)
    settings.pop("telegram_chat_id", None)
    bound.settings = settings
    db.commit()
    return {"message": "Telegram disconnected.", **_telegram_status_payload(bound)}


@router.post("/telegram/test")
async def test_telegram(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    result = await TelegramNotifier.send_message(user, "✅ Helpotron test notification!")
    if not result["sent"]:
        raise HTTPException(status_code=400, detail=result["detail"])
    return {"message": result["detail"]}


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
    """Persist the account's theme.

    Audit 08-29: this wrote through the detached user returned by
    ``_get_feature_user`` and committed an empty unit of work, so the theme
    never actually saved. An unknown theme also came back as HTTP 200 with the
    rejection buried in ``message``; it is a 400 now.
    """
    theme = (req.theme or "").strip().lower()
    if theme not in ("dark", "light", "auto"):
        raise HTTPException(status_code=400, detail="Choose dark, light, or auto.")

    user = await _get_feature_user(request, db)
    bound = _bind_to_session(db, user)
    settings = dict(bound.settings or {})
    settings["theme"] = theme
    bound.settings = settings
    db.commit()
    return {"message": f"Theme set to {theme}", "theme": theme}


@router.get("/theme")
async def get_user_theme(request: Request, db: Session = Depends(get_db)):
    user = await _get_feature_user(request, db)
    return {"theme": get_theme(user)}

