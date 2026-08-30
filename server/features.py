"""Approved Helpotron features: auto-detect, gamification, collab, calendar, Telegram, AI recommendations."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from .database import User, Assignment, StudyMaterial
from .llm import generate_with_deepseek


# ─── 1. AUTO-DETECT ASSIGNMENT TYPE ────────────────────────────────────────

def detect_assignment_type(prompt: str, title: str = "") -> str:
    """Classify assignment type with zero-latency local heuristics: essay, quiz, discussion, coding, lab, presentation, other."""
    text = f"{title} {prompt}".lower()
    
    # 1. Zero-cost instant rule-based heuristic matching
    if any(k in text for k in ["presentation", "powerpoint", "slides", "deck", ".pptx", ".ppt", ".key", "pitch deck"]):
        return "presentation"
    if any(k in text for k in ["essay", "paper", "thesis", "argumentative", "rhetorical", "analysis paper", "write a 5-paragraph"]):
        return "essay"
    if any(k in text for k in ["quiz", "exam", "multiple choice", "test", "midterm", "final exam", "question set"]):
        return "quiz"
    if any(k in text for k in ["code", "coding", "python", "java", "javascript", "c++", "algorithm", "function", "github", "programming"]):
        return "coding"
    if any(k in text for k in ["lab report", "experiment", "hypothesis", "laboratory", "biology lab", "chemistry lab", "physics lab"]):
        return "lab"
    if any(k in text for k in ["discussion", "reply to 2 classmates", "forum post", "peer response", "weekly discussion"]):
        return "discussion"

    # 2. Secondary fallback via lightweight model if ambiguous
    try:
        system = "Classify into exactly one: essay, quiz, discussion, coding, lab, presentation, other. Reply with only the category name."
        user_msg = f"Title: {title}\nPrompt: {prompt[:400]}"
        result = generate_with_deepseek(prompt=user_msg, system=system, max_tokens=10)
        types = ["presentation", "essay", "quiz", "coding", "lab", "discussion", "other"]
        for t in types:
            if t in result.lower():
                return t
    except Exception:
        pass

    return "other"


# ─── 2. GAMIFICATION ──────────────────────────────────────────────────────

def get_user_stats(user: User, db: Session) -> Dict[str, Any]:
    """Return gamification stats: XP, level, streak, badges."""
    # XP: 10 per assignment completed, 5 per study material, 2 per day streak
    assignments = db.query(Assignment).filter(Assignment.user_id == user.id).count()
    materials = db.query(StudyMaterial).filter(StudyMaterial.user_id == user.id).count()
    xp = assignments * 10 + materials * 5
    level = xp // 100 + 1
    # Badge checks
    badges = []
    if assignments >= 10:
        badges.append("assignment-scholar")
    if materials >= 20:
        badges.append("study-master")
    if xp >= 500:
        badges.append("xp-hunter")
    # Streak placeholder (requires daily tracking)
    streak = user.settings.get("streak", 0) if user.settings else 0
    return {"xp": xp, "level": level, "streak": streak, "badges": badges}


# ─── 3. COLLABORATIVE STUDY GROUPS ──────────────────────────────────────

class FriendRequest:
    """Friend request model stored in User.settings."""
    @staticmethod
    def send_request(db: Session, from_user: User, to_username: str) -> str:
        to_user = db.query(User).filter(User.public_id == to_username).first()
        if not to_user:
            return "User not found"
        if from_user.id == to_user.id:
            return "Cannot friend yourself"
        # Store in to_user.settings as pending requests
        settings = to_user.settings or {}
        pending = settings.get("pending_requests", [])
        if from_user.public_id in pending:
            return "Request already sent"
        pending.append(from_user.public_id)
        settings["pending_requests"] = pending
        to_user.settings = settings
        db.commit()
        return f"Friend request sent to {to_username}"

    @staticmethod
    def accept_request(db: Session, user: User, from_username: str) -> str:
        settings = user.settings or {}
        pending = settings.get("pending_requests", [])
        if from_username not in pending:
            return "No pending request from that user"
        pending.remove(from_username)
        settings["pending_requests"] = pending
        # Add to friends list
        friends = settings.get("friends", [])
        if from_username not in friends:
            friends.append(from_username)
        settings["friends"] = friends
        user.settings = settings
        db.commit()
        return f"Accepted friend request from {from_username}"

    @staticmethod
    def get_friends(user: User) -> List[str]:
        settings = user.settings or {}
        return settings.get("friends", [])

    @staticmethod
    def share_material(db: Session, user: User, friend_username: str, material_id: int) -> str:
        """Share a study material with a friend."""
        friend = db.query(User).filter(User.public_id == friend_username).first()
        if not friend:
            return "Friend not found"
        material = db.query(StudyMaterial).filter(StudyMaterial.id == material_id, StudyMaterial.user_id == user.id).first()
        if not material:
            return "Material not found or not yours"
        # Add to friend's shared materials (stored in settings)
        settings = friend.settings or {}
        shared = settings.get("shared_materials", [])
        shared.append({"from": user.public_id, "material_id": material_id, "kind": material.kind, "title": f"Shared {material.kind}"})
        settings["shared_materials"] = shared
        friend.settings = settings
        db.commit()
        return f"Shared material with {friend_username}"


# ─── 4. CALENDAR INTEGRATION ─────────────────────────────────────────────

class CalendarSync:
    """Placeholder for Google Calendar / Notion sync."""
    @staticmethod
    def sync_deadlines(user: User, assignments: List[Assignment]) -> str:
        # Placeholder — real implementation would call Google Calendar API
        # For now, just return a formatted list
        lines = ["📅 Upcoming deadlines:"]
        for a in assignments:
            if a.due_date:
                lines.append(f"- {a.title}: due {a.due_date}")
        return "\n".join(lines)


# ─── 5. TELEGRAM NOTIFICATIONS ──────────────────────────────────────────

class TelegramNotifier:
    """Send notifications through the user's own Telegram bot.

    Audit 08-29: this used to return "Notification sent to Telegram
    (simulated)" without ever making a network call — the settings page showed
    a success toast for a message that was never delivered. It now performs the
    real Bot API ``sendMessage`` call, using the same transport as
    ``recovery.notify_developer_via_telegram`` and ``telegram_bot.py``, and
    reports the actual outcome including Telegram's own error description.
    """

    API_TIMEOUT_SECONDS = 15

    @staticmethod
    def credentials(user: User) -> tuple[Optional[str], Optional[str]]:
        settings = user.settings or {}
        token = (settings.get("telegram_bot_token") or "").strip() or None
        chat_id = (settings.get("telegram_chat_id") or "").strip() or None
        return token, chat_id

    @staticmethod
    def is_configured(user: User) -> bool:
        token, chat_id = TelegramNotifier.credentials(user)
        return bool(token and chat_id)

    @staticmethod
    async def describe_bot(bot_token: str) -> Dict[str, Any]:
        """Resolve a BotFather token to the bot it belongs to.

        Lets the settings page confirm "this is @your_bot" the moment a token
        is pasted, instead of waiting for a delivery failure to reveal a typo.
        """
        token = (bot_token or "").strip()
        if not token:
            return {"ok": False, "detail": "Paste the token BotFather gave you."}
        try:
            async with httpx.AsyncClient(timeout=TelegramNotifier.API_TIMEOUT_SECONDS) as client:
                resp = await client.get(f"https://api.telegram.org/bot{token}/getMe")
        except httpx.HTTPError as exc:
            return {"ok": False, "detail": f"Could not reach Telegram ({type(exc).__name__})."}

        if resp.status_code != 200:
            return {"ok": False, "detail": "Telegram does not recognise that token. Copy it again from BotFather."}
        result = (resp.json() or {}).get("result") or {}
        return {
            "ok": True,
            "username": result.get("username"),
            "name": result.get("first_name"),
        }

    @staticmethod
    async def resolve_chats(bot_token: str) -> Dict[str, Any]:
        """Find the chats that have already messaged this bot.

        Telegram only exposes a chat ID once the human has spoken to the bot
        first, so asking a student to hunt down their own numeric ID is the
        step that makes most self-hosted bot setups fail. Instead the user
        sends any message to their new bot and we read it back from
        ``getUpdates``.
        """
        token = (bot_token or "").strip()
        if not token:
            return {"ok": False, "detail": "Paste the token BotFather gave you.", "chats": []}
        try:
            async with httpx.AsyncClient(timeout=TelegramNotifier.API_TIMEOUT_SECONDS) as client:
                resp = await client.get(
                    f"https://api.telegram.org/bot{token}/getUpdates",
                    params={"limit": 20, "allowed_updates": '["message"]'},
                )
        except httpx.HTTPError as exc:
            return {"ok": False, "detail": f"Could not reach Telegram ({type(exc).__name__}).", "chats": []}

        if resp.status_code != 200:
            return {"ok": False, "detail": "Telegram does not recognise that token.", "chats": []}

        seen: Dict[str, Dict[str, Any]] = {}
        for update in (resp.json() or {}).get("result") or []:
            chat = ((update.get("message") or {}).get("chat")) or {}
            chat_id = chat.get("id")
            if chat_id is None:
                continue
            label = chat.get("username") or " ".join(
                part for part in (chat.get("first_name"), chat.get("last_name")) if part
            ) or chat.get("title")
            # Later updates win, so the freshest label for a chat is kept.
            seen[str(chat_id)] = {"chat_id": str(chat_id), "label": label or str(chat_id)}

        chats = list(seen.values())
        if not chats:
            return {
                "ok": False,
                "detail": "No messages yet. Open your bot in Telegram, send it any message, then try again.",
                "chats": [],
            }
        return {"ok": True, "chats": chats}

    @staticmethod
    async def send_message(user: User, message: str) -> Dict[str, Any]:
        """Deliver ``message`` to the user's chat. Never raises."""
        bot_token, chat_id = TelegramNotifier.credentials(user)
        if not bot_token or not chat_id:
            return {
                "sent": False,
                "detail": "Telegram is not connected. Add your bot token and chat ID first.",
            }

        try:
            async with httpx.AsyncClient(timeout=TelegramNotifier.API_TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": chat_id, "text": message},
                )
        except httpx.HTTPError as exc:
            # Network/timeout — the token is never included in the message.
            return {
                "sent": False,
                "detail": f"Could not reach Telegram ({type(exc).__name__}). Check your connection and try again.",
            }

        if resp.status_code == 200:
            return {"sent": True, "detail": "Message delivered to your Telegram chat."}

        # Telegram returns a human-readable reason; surface it so the user can act.
        try:
            reason = (resp.json() or {}).get("description") or ""
        except ValueError:
            reason = ""
        return {
            "sent": False,
            "detail": reason or f"Telegram rejected the message (HTTP {resp.status_code}).",
        }


# ─── 6. AI RECOMMENDATIONS ───────────────────────────────────────────────

def recommend_next_study(user: User, db: Session) -> str:
    """Recommend what to study next based on weak areas and past performance."""
    assignments = db.query(Assignment).filter(Assignment.user_id == user.id).all()
    if not assignments:
        return "Complete an assignment first to get recommendations."
    # Simple heuristic: recommend materials for assignments with no study materials
    for a in assignments:
        materials = db.query(StudyMaterial).filter(StudyMaterial.assignment_id == a.id).count()
        if materials == 0:
            return f"📚 Study recommendation: Create materials for '{a.title}' — it has no study guides yet."
    return "You're up to date! Consider reviewing older materials or starting a new assignment."


# ─── 7. SETTINGS: THEMES ────────────────────────────────────────────────

def set_theme(user: User, theme: str) -> str:
    """Set theme: dark, light, auto."""
    if theme not in ["dark", "light", "auto"]:
        return "Invalid theme. Choose dark, light, or auto."
    settings = user.settings or {}
    settings["theme"] = theme
    user.settings = settings
    return f"Theme set to {theme}"


def get_theme(user: User) -> str:
    return (user.settings or {}).get("theme", "light")


def extract_assignment_metadata_local(text: str) -> dict:
    import re
    points = 0
    match = re.search(r'Points:\s*(\d+)', text, re.IGNORECASE)
    if match:
        points = int(match.group(1))
    has_rubric = 'rubric' in text.lower()
    return {
        "points": points,
        "has_rubric": has_rubric
    }


# ── Remediation BATCH-06: regex assignment classification (cost capping) ─────
ASSIGNMENT_PATTERNS = [
    (re.compile(r"(quiz|exam|test|assessment)", re.I), "QUIZ"),
    (re.compile(r"(essay|paper|write|reflection|dissertation)", re.I), "ESSAY"),
    (re.compile(r"(discussion|reply|post|thread)", re.I), "DISCUSSION"),
    (re.compile(r"(problem set|homework|math|calc|physics|pset)", re.I), "PROBLEM_SET"),
    (re.compile(r"(lab|experiment|report)", re.I), "LAB_REPORT"),
]


def classify_assignment_type(title: str, description: str = "") -> str:
    combined = f"{title} {description}"
    for pattern, cat in ASSIGNMENT_PATTERNS:
        if pattern.search(combined):
            return cat
    return "GENERAL_ASSIGNMENT"
