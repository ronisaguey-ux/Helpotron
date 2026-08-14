"""Approved Helpotron features: auto-detect, gamification, collab, calendar, Telegram, AI recommendations."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from .database import User, Assignment, StudyMaterial
from .llm import generate_with_deepseek


# ─── 1. AUTO-DETECT ASSIGNMENT TYPE ────────────────────────────────────────

def detect_assignment_type(prompt: str, title: str = "") -> str:
    """Classify assignment type: essay, quiz, discussion, coding, lab, presentation, other."""
    system = "Classify the assignment into one of: essay, quiz, discussion, coding, lab, presentation, other. Reply with only the category name."
    user_msg = f"Title: {title}\nPrompt: {prompt[:1000]}"
    result = generate_with_deepseek(prompt=user_msg, system=system, max_tokens=20)
    types = ["essay", "quiz", "discussion", "coding", "lab", "presentation", "other"]
    for t in types:
        if t in result.lower():
            return t
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
    """Send notifications via user's own Telegram bot."""
    @staticmethod
    def send_message(user: User, message: str) -> str:
        bot_token = user.settings.get("telegram_bot_token") if user.settings else None
        chat_id = user.settings.get("telegram_chat_id") if user.settings else None
        if not bot_token or not chat_id:
            return "Telegram bot not configured. Use /settings to set token and chat ID."
        # Placeholder — real implementation would call Telegram API
        # import requests
        # url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        # requests.post(url, json={"chat_id": chat_id, "text": message})
        return f"📱 Notification sent to Telegram (simulated): {message[:50]}..."


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
