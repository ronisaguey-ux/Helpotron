"""Helpotron Telegram bot — standalone long-polling process.

Commands: /start /status /ready /summary /credits /pause /resume /admin
Alerts (background loop): materials ready, usage warning (<20% credits),
discount earned. Shares the SQLite DB with the API (WAL-safe for reads).

Run:  .venv/bin/python -m server.telegram_bot
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

import httpx
from sqlalchemy import or_

from .config import config
from .database import Assignment, StudyMaterial, User, SessionLocal, init_db
from .payments import usage_percent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("helpotron.bot")

API = f"https://api.telegram.org/bot{config.telegram_bot_token}"

ALERTED_MATERIALS: set[int] = set()
LAST_ALERT: dict[int, float] = {}  # telegram_id -> ts of last usage warning
USAGE_WARN_INTERVAL = 24 * 3600


async def _call(method: str, **kwargs) -> dict | None:
    url = f"{API}/{method}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=kwargs)
    if resp.status_code != 200:
        logger.warning("telegram %s -> %s: %s", method, resp.status_code, resp.text[:200])
        return None
    return resp.json()


async def send_message(chat_id: str, text: str) -> None:
    await _call("sendMessage", chat_id=chat_id, text=text, parse_mode="Markdown")


async def send_document_to_user(chat_id: str, file_path: str, caption: str = "") -> bool:
    """Stream a document file (.docx, .pdf, .zip) directly to user Telegram chat."""
    url = f"{API}/sendDocument"
    if not os.path.exists(file_path):
        logger.warning("File %s does not exist for Telegram delivery", file_path)
        return False
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            with open(file_path, "rb") as f:
                files = {"document": (os.path.basename(file_path), f)}
                data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"}
                resp = await client.post(url, data=data, files=files)
        return resp.status_code == 200
    except Exception as e:
        logger.error("Failed sending document to Telegram chat %s: %s", chat_id, e)
        return False


async def push_completed_assignment(db, assignment_id: int, file_path: str) -> bool:
    """Notify and push completed deliverable bundle to user on Telegram."""
    assignment = db.query(Assignment).filter_by(id=assignment_id).first()
    if not assignment or not assignment.user or not assignment.user.telegram_id:
        return False
    caption = f"🎯 *{assignment.title}* is complete and cleared all AI evasion checks!"
    return await send_document_to_user(assignment.user.telegram_id, file_path, caption=caption)


def _find_user_by_telegram(db, telegram_id: str) -> User | None:
    return db.query(User).filter(User.telegram_id == telegram_id).first()


def _find_or_link(db, telegram_id: str) -> User | None:
    user = _find_user_by_telegram(db, telegram_id)
    if user is None:
        # first contact: create a shell user with public_id = tg<id>
        public_id = f"tg{telegram_id}"
        user = db.query(User).filter(User.public_id == public_id).first()
        if user is None:
            user = User(public_id=public_id, telegram_id=telegram_id,
                        plan="basic", settings={"reading_level": "college-freshman"})
            db.add(user)
        else:
            user.telegram_id = telegram_id
        db.commit()
    return user


# ─── commands ──────────────────────────────────────────────────────────────

async def cmd_status(db, telegram_id: str) -> str:
    user = _find_or_link(db, telegram_id)
    rows = (db.query(Assignment).filter_by(user_id=user.id)
            .order_by(Assignment.id.desc()).limit(10).all())
    if not rows:
        return "No assignments tracked yet — open the extension on a Canvas page and hit *Start Scrape*."
    lines = ["*Active assignments:*"]
    for a in rows:
        done = len([k for k in a.progress.values() if k])
        lines.append(f"• {a.title[:60]} — {a.status} ({done}/4 materials)")
    return "\n".join(lines)


async def cmd_ready(db, telegram_id: str) -> str:
    user = _find_or_link(db, telegram_id)
    rows = (db.query(Assignment).filter_by(user_id=user.id, status="materials_ready")
            .order_by(Assignment.id.desc()).limit(10).all())
    if not rows:
        return "Nothing ready yet. Transcribe a lecture first, then generate materials."
    lines = ["*Ready to review:*"]
    for a in rows:
        lines.append(f"• {a.title[:60]} (assignment {a.id}) — all 4 materials generated")
    return "\n".join(lines)


async def cmd_summary(db, telegram_id: str, assignment_id: str | None) -> str:
    user = _find_or_link(db, telegram_id)
    materials = db.query(StudyMaterial).filter_by(user_id=user.id, kind="summary").order_by(
        StudyMaterial.id.desc()).limit(5).all()
    if assignment_id:
        try:
            aid = int(assignment_id)
        except ValueError:
            return "Usage: /summary <assignment_id>"
        materials = [m for m in materials if m.assignment_id == aid] or materials[:1]
    if not materials:
        return "No summaries yet — generate one with the *2-min summary* button on the dashboard."
    m = materials[0]
    return m.content[:3500]


async def cmd_credits(db, telegram_id: str) -> str:
    user = _find_or_link(db, telegram_id)
    balance = "unlimited" if user.plan == "elite" else f"{user.credits:.1f} credits"
    return f"Plan: *{user.plan}*  |  Balance: *{balance}*"


async def cmd_pause_resume(db, telegram_id: str, paused: bool) -> str:
    user = _find_or_link(db, telegram_id)
    user.notifications_paused = paused
    db.commit()
    return f"Notifications {'paused' if paused else 'resumed'}."


async def cmd_admin() -> str:
    if config.telegram_admin_chat_id:
        return f"Support: @{config.telegram_admin_chat_id} — or reply here and a human sees it."
    return "Support is configured on the server — pings go to the admin chat."


# ─── alerts ────────────────────────────────────────────────────────────────

async def alert_loop() -> None:
    """Every 30s: notify on newly-ready materials and low credits."""
    while True:
        await asyncio.sleep(30)
        try:
            db = SessionLocal()
            try:
                ready = (db.query(StudyMaterial)
                         .filter(StudyMaterial.kind == "study_guide",
                                 StudyMaterial.id.not_in(list(ALERTED_MATERIALS) or [0]))
                         .order_by(StudyMaterial.id.desc()).limit(5).all())
                for m in ready:
                    if m.user.telegram_id and not m.user.notifications_paused:
                        await send_message(m.user.telegram_id,
                                           f"✅ *{m.assignment.title if m.assignment else 'Material'}* — study guide is ready!")
                        ALERTED_MATERIALS.add(m.id)
                        logger.info("alerted %s about material %d", m.user.telegram_id, m.id)
                for u in db.query(User).filter(User.telegram_id.isnot(None)).all():
                    if u.notifications_paused:
                        continue
                    now = time.time()
                    if now - LAST_ALERT.get(u.telegram_id, 0) < USAGE_WARN_INTERVAL:
                        continue
                    if usage_percent(u) >= 80:
                        await send_message(u.telegram_id,
                                           f"⚠️ Usage warning: you've used {usage_percent(u):.0f}% of monthly credits.")
                        LAST_ALERT[u.telegram_id] = now
            finally:
                db.close()
        except Exception as e:
            logger.warning("alert loop error: %s", e)


# ─── main loop ─────────────────────────────────────────────────────────────

HANDLERS = {
    "/status": cmd_status,
    "/ready": cmd_ready,
    "/credits": cmd_credits,
}


async def main() -> None:
    if not config.telegram_bot_token:
        logger.error("TELEGRAM_BOT_TOKEN not set — bot cannot start. See .env.example.")
        return
    init_db()
    asyncio.create_task(alert_loop())
    offset = 0
    logger.info("helpotron bot polling started")
    while True:
        try:
            data = await _call("getUpdates", offset=offset, timeout=50)
            if not data or not data.get("ok"):
                await asyncio.sleep(5)
                continue
            for update in data.get("result", []):
                offset = update["update_id"] + 1
                msg = update.get("message") or {}
                chat_id = str(msg.get("chat", {}).get("id", ""))
                text = (msg.get("text") or "").strip()
                if not chat_id or not text:
                    continue
                logger.info("command %r from %s", text[:40], chat_id)
                db = SessionLocal()
                try:
                    cmd, _, arg = text.partition(" ")
                    if cmd == "/start":
                        reply = "Welcome to *Helpotron*! 📚 Track assignments, transcribe lectures, and get study guides, flashcards, practice tests and 2-minute summaries. Try /status."
                    elif cmd == "/summary":
                        reply = await cmd_summary(db, chat_id, arg or None)
                    elif cmd == "/pause":
                        reply = await cmd_pause_resume(db, chat_id, True)
                    elif cmd == "/resume":
                        reply = await cmd_pause_resume(db, chat_id, False)
                    elif cmd == "/admin":
                        reply = await cmd_admin()
                    elif cmd in HANDLERS:
                        reply = await HANDLERS[cmd](db, chat_id)
                    else:
                        reply = "Commands: /status /ready /summary /credits /pause /resume /admin"
                except Exception as e:
                    logger.exception("handler error")
                    reply = f"Something broke on my side ({e.__class__.__name__}) — try again in a minute."
                finally:
                    db.close()
                await send_message(chat_id, reply)
        except Exception as e:
            logger.warning("poll loop error: %s", e)
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())
