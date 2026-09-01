"""Routes: connect / disconnect / status for the Telegram bot ↔ My Agent link.

User supplies their OWN bot token (from @BotFather). The token is validated
against Telegram (getMe) before it is stored, stored server-side in
user.settings["ai"]["telegram_bot"], and is never echoed back to the client —
status returns only the bot username and linkage state.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import User, get_db
from .routes_features import get_current_authenticated_user
from .telegram_agent_link import bot_state, normalize_token, tg_get_me

logger = logging.getLogger("helpotron.telegram_agent.routes")

router = APIRouter(prefix="/api/telegram-agent", tags=["telegram_agent"])


class TelegramBotConnectRequest(BaseModel):
    token: str = Field(..., max_length=256)


def _masked(status: Dict[str, Any]) -> Dict[str, Any]:
    """Status view — never exposes the bot token."""
    return {
        "connected": bool(status.get("token")),
        "bot_username": status.get("bot_username", ""),
        "status": status.get("status", "disconnected"),
        "chat_linked": bool(status.get("chat_id")),
        "last_error": status.get("last_error", "") or "",
        "last_seen": status.get("last_seen", 0),
        "sessions_run": int(status.get("sessions_run", 0)),
    }


@router.get("/status")
def telegram_agent_status(
    request: Request,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return _masked(bot_state(current_user))


@router.post("/connect")
async def telegram_agent_connect(
    body: TelegramBotConnectRequest,
    request: Request,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        token = normalize_token(body.token)
    except ValueError as e:
        raise HTTPException(400, str(e))

    ok, username, err_body = await tg_get_me(token)
    if not ok:
        err_code = err_body.get("error_code") or 0
        if err_code in (401, 403):
            raise HTTPException(
                400,
                "Telegram rejected that token. Double-check it with @BotFather — "
                "/mybots → API Token.",
            )
        raise HTTPException(502, f"Could not reach Telegram ({username}). Try again in a moment.")

    settings = dict(current_user.settings or {})
    ai = dict(settings.get("ai") or {})
    existing = dict(ai.get("telegram_bot") or {})
    ai["telegram_bot"] = {
        "token": token,
        "bot_username": username,
        "chat_id": "",  # bound on the first private message to the bot
        "offset": 0,
        "status": "connected",
        "last_error": "",
        "last_seen": int(time.time()),
        "sessions_run": int(existing.get("sessions_run", 0)),
    }
    settings["ai"] = ai
    current_user.settings = settings
    db.add(current_user)
    db.commit()
    logger.info("telegram-agent connected for %s: @%s", current_user.public_id, username)
    return {"status": "connected", "bot_username": username}


@router.post("/disconnect")
def telegram_agent_disconnect(
    request: Request,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    settings = dict(current_user.settings or {})
    ai = dict(settings.get("ai") or {})
    if "telegram_bot" in ai:
        del ai["telegram_bot"]
    settings["ai"] = ai
    current_user.settings = settings
    db.add(current_user)
    db.commit()
    logger.info("telegram-agent disconnected for %s", current_user.public_id)
    return _masked({})
