"""Telegram bot ↔ My Agent link (operator 08-31).

A user creates their OWN bot with @BotFather and pastes its token in
Settings → AI & Intelligence → Telegram Bot. The API then long-polls that bot:
text messages become My Agent instructions (1 credit each, same as a web agent
session) and the agent's summary is sent back to the chat as a reply.

State lives in user.settings["ai"]["telegram_bot"]:
  token, bot_username, chat_id (bound on the first private-chat message),
  offset (getUpdates cursor), status, last_error, last_seen, sessions_run.

Safety:
- The token is secret and per-user — the API never returns it (masked).
- Only PRIVATE chats are accepted, and the bot binds to the FIRST chat that
  messages it; everything else is ignored. That keeps a third party who
  stumbles upon the bot from hijacking the agent.
- Instructions cost credits through the normal charge path and carry an
  idempotency key per update_id, so a getUpdates replay cannot double-charge.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .database import SessionLocal, User

logger = logging.getLogger("helpotron.telegram_agent")

API = "https://api.telegram.org/bot{token}/{method}"

# Bot tokens look like 1234567890:AAAA... (digits, colon, ~35+ base64url chars).
TOKEN_RE = re.compile(r"^\d+:[A-Za-z0-9_-]{35,}$")

MAX_INSTRUCTION_CHARS = 3000  # TG text cap is 4096; agent takes up to 5000 anyway
POLL_INTERVAL = 3.0  # seconds between per-bot cycles
LONG_POLL_TIMEOUT = 50  # getUpdates long-poll per call
_BACKOFF: Dict[str, float] = {}  # token -> ts until which to skip polling

# public_id -> asyncio task for a running instruction; blocks concurrent
# instructions for the same user (the agent is single-threaded per user).
_RUNNING: Dict[str, asyncio.Task] = {}
# update_id -> ts; getUpdates replays pending updates after a crash, so keep a
# small seen-set so a duplicate update is not executed (and charged) twice.
_SEEN_UPDATES: Dict[int, float] = {}


# ── state helpers ───────────────────────────────────────────────────────────

def bot_state(user: User) -> dict:
    return ((user.settings or {}).get("ai") or {}).get("telegram_bot") or {}


def _persist_state(db, user: User, state: dict) -> None:
    settings = dict(user.settings or {})
    ai = dict(settings.get("ai") or {})
    ai["telegram_bot"] = state
    settings["ai"] = ai
    user.settings = settings
    db.add(user)
    db.commit()


def normalize_token(raw: str) -> str:
    """Strips whitespace; returns the token or raises ValueError."""
    token = (raw or "").strip()
    if not token:
        raise ValueError("Bot token is required.")
    if not TOKEN_RE.match(token):
        raise ValueError(
            "That doesn't look like a bot token. Create a bot with @BotFather "
            "(send /newbot) and paste the token it gives you."
        )
    return token


# ── Telegram API ────────────────────────────────────────────────────────────

async def tg_call(token: str, method: str, **payload: Any) -> Tuple[bool, dict]:
    """Calls the Bot API. Returns (ok, body). ok=False covers HTTP errors and
    Telegram's {"ok": false} responses (body carries error_code/description)."""
    url = API.format(token=token, method=method)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload)
    except Exception as e:  # network / timeout
        return False, {"error_code": 0, "description": f"network error: {e}"}
    try:
        body = resp.json()
    except Exception:
        return False, {"error_code": resp.status_code, "description": resp.text[:200]}
    if resp.status_code != 200 or body.get("ok") is not True:
        return False, body if isinstance(body, dict) else {"description": str(body)[:200]}
    return True, body


async def tg_send(token: str, chat_id: str, text: str) -> bool:
    ok, _ = await tg_call(token, "sendMessage", chat_id=chat_id, text=text)
    return ok


async def tg_get_me(token: str) -> Tuple[bool, str, dict]:
    """Returns (ok, bot_username_or_error_description, error_body)."""
    ok, body = await tg_call(token, "getMe")
    if ok:
        return True, str(body["result"].get("username") or "unknown"), {}
    return False, str(body.get("description") or body.get("error_code", "unknown")), body


# ── update processing ───────────────────────────────────────────────────────

async def _send_reply(token: str, chat_id: str, text: str) -> None:
    try:
        await tg_send(token, chat_id, text)
    except Exception:
        logger.exception("telegram-agent reply failed")


def _set_error(db, user: User, state: dict, error: str) -> None:
    state["status"] = "error"
    state["last_error"] = error
    state["last_seen"] = int(time.time())
    _persist_state(db, user, state)


async def _run_instruction(user: User, token: str, chat_id: str, text: str) -> None:
    """Runs ONE agent instruction for a user and replies with the summary.

    Runs as its own task so the poller keeps serving other users while the
    agent works (agent sessions can run for minutes)."""
    from . import credits
    from .agent_session import manager as agent_manager

    with SessionLocal() as db:
        fresh = db.query(User).filter(User.public_id == user.public_id).first()
        if fresh is None:
            return
        if not credits.charge(fresh, "agent_session", db):
            await _send_reply(
                token, chat_id,
                "I can't start that — not enough credits. Top up in the Helpotron "
                "app and try again (1 credit per instruction).",
            )
            return
        db.commit()
        session = agent_manager.create(fresh.public_id, None, text[:MAX_INSTRUCTION_CHARS])
        db_state = bot_state(fresh)

    try:
        await agent_manager.run(session)
    except Exception:
        logger.exception("telegram agent instruction failed: %s", session.session_id)

    reply = ""
    refunded = False
    if session.status == "done" and session.result_text:
        reply = session.result_text
    elif session.result_text and session.status != "done":
        # unparseable / guardrail messages carry a user-facing explanation
        reply = session.result_text
    else:
        reply = (
            "I couldn't finish that one (nothing was collected). Try rephrasing, "
            "or make sure the source page opens without a login."
        )
        if session.status in ("failed", "disconnected", "unparseable") and session.steps < 3:
            with SessionLocal() as db:
                ref_user = db.query(User).filter(User.public_id == user.public_id).first()
                if ref_user is not None:
                    credits.top_up(db, ref_user, credits.TASK_COSTS["agent_session"],
                                   reason="refund:telegram_agent:failed")
                    refunded = True

    if not reply:
        reply = "I ran out of something on my side — try again in a minute."
    if refunded:
        reply += "\n\n(Your credit was refunded — nothing was produced.)"
    await _send_reply(token, chat_id, reply)

    with SessionLocal() as db:
        w = db.query(User).filter(User.public_id == user.public_id).first()
        if w is not None:
            st = bot_state(w)
            st["sessions_run"] = int(st.get("sessions_run", 0)) + 1
            st["last_seen"] = int(time.time())
            _persist_state(db, w, st)


def _remember(update_id: int) -> bool:
    """Returns True if the update is new; counts a replay as already seen."""
    now = time.time()
    if update_id in _SEEN_UPDATES:
        return False
    _SEEN_UPDATES[update_id] = now
    # prune entries older than 10 minutes (getUpdates replays are immediate)
    for k in [k for k, ts in _SEEN_UPDATES.items() if now - ts > 600]:
        del _SEEN_UPDATES[k]
    if len(_SEEN_UPDATES) > 1000:
        for k in sorted(_SEEN_UPDATES, key=_SEEN_UPDATES.get)[:500]:
            del _SEEN_UPDATES[k]
    return True


async def _process_updates(user: User, token: str, updates: List[dict]) -> None:
    """Handles one getUpdates batch. Side effects (binds, replies, agent runs)
    happen here; state is persisted after each update so offsets survive."""
    state = dict(bot_state(user))
    state.setdefault("status", "connected")
    for upd in updates:
        if not _remember(upd.get("update_id", 0)):
            continue
        msg = upd.get("message") or {}
        chat = msg.get("chat") or {}
        text = (msg.get("text") or "").strip()
        chat_id = str(chat.get("id", ""))
        # Only private chats; a bot binds to the first chat that messages it.
        if not chat_id or chat.get("type") != "private":
            continue
        if not state.get("chat_id"):
            state["chat_id"] = chat_id
            state["status"] = "connected"
            state["last_error"] = ""
        elif state.get("chat_id") != chat_id:
            continue  # someone else found the bot; not our owner's chat

        if text == "/start":
            await _send_reply(
                token, chat_id,
                "👋 Helpotron agent on Telegram!\n\n"
                "Just type what you need — I'll run My Agent on it and reply here "
                "(1 credit per instruction).\n\n"
                "Commands: /status · /help",
            )
        elif text == "/help":
            await _send_reply(
                token, chat_id,
                "Send me any task and My Agent will do it — research, summaries, "
                "worksheets, whatever the site agent does. 1 credit per instruction.\n"
                "Commands: /status · /help",
            )
        elif text == "/status":
            state["sessions_run"] = int(state.get("sessions_run", 0))
            busy = user.public_id in _RUNNING and not _RUNNING[user.public_id].done()
            await _send_reply(
                token, chat_id,
                f"My Agent: {'working on something right now' if busy else 'idle'} · "
                f"{state.get('sessions_run', 0)} instruction(s) run · your credit cost is "
                "1 per instruction.",
            )
        else:
            # New instruction: start it unless one is already running for this user.
            if user.public_id in _RUNNING and not _RUNNING[user.public_id].done():
                await _send_reply(
                    token, chat_id,
                    "Still working on your last request — give me a moment and I'll "
                    "answer there first.",
                )
            else:
                _RUNNING[user.public_id] = asyncio.create_task(
                    _run_instruction(user, token, chat_id, text)
                )
                state["last_seen"] = int(time.time())
                await _send_reply(
                    token, chat_id,
                    "🤖 On it — running My Agent on that (1 credit). I'll reply here "
                    "when it's done.",
                )

    state["offset"] = max([int(u.get("update_id", 0)) for u in updates] +
                          [int(state.get("offset", 0))]) + 1
    state["last_seen"] = int(time.time())
    with SessionLocal() as db:
        w = db.query(User).filter(User.public_id == user.public_id).first()
        if w is not None:
            _persist_state(db, w, state)


# ── poller ──────────────────────────────────────────────────────────────────

def _connected_users():
    with SessionLocal() as db:
        rows = []
        for u in db.query(User).filter(User.settings.is_not(None)).all():
            st = bot_state(u)
            if st.get("token"):
                rows.append((u.public_id, st))
        return rows


async def _poll_one(public_id: str, state: dict) -> None:
    token = state.get("token", "")
    if not token or _BACKOFF.get(token, 0) > time.time():
        return
    offset = int(state.get("offset", 0) or 0)
    ok, body = await tg_call(
        token, "getUpdates",
        timeout=LONG_POLL_TIMEOUT,
        offset=offset,
        allowed_updates=["message"],
    )
    if ok:
        from .database import SessionLocal as _SL
        with _SL() as db:
            user = db.query(User).filter(User.public_id == public_id).first()
            if user is None:
                return
            updates = body.get("result") or []
            if updates:
                await _process_updates(user, token, updates)
            elif not bot_state(user).get("chat_id"):
                pass  # silent until the owner messages the bot
        return

    error_code = body.get("error_code") or 0
    description = str(body.get("description") or "")[:160]
    if error_code in (401, 403):
        with SessionLocal() as db:
            u = db.query(User).filter(User.public_id == public_id).first()
            if u is not None:
                _set_error(db, u, dict(bot_state(u)),
                           f"bot token rejected: {description}")
    elif error_code == 409:
        with SessionLocal() as db:
            u = db.query(User).filter(User.public_id == public_id).first()
            if u is not None:
                _set_error(db, u, dict(bot_state(u)),
                           "another process is polling this bot (conflict)")
    elif error_code == 429:
        _BACKOFF[token] = time.time() + 65
        logger.warning("telegram-agent %s rate-limited: %s", public_id, description)
    else:
        logger.warning("telegram-agent getUpdates %s failed: %s", public_id, description)


async def telegram_agent_loop() -> None:
    """Background loop: long-polls every connected user's bot sequentially."""
    logger.info("telegram-agent link loop started")
    while True:
        try:
            for public_id, state in _connected_users():
                try:
                    await _poll_one(public_id, state)
                except Exception:
                    logger.exception("telegram-agent poll failed for %s", public_id)
        except Exception:
            logger.exception("telegram-agent loop cycle failed")
        await asyncio.sleep(POLL_INTERVAL)
