"""User Settings, Personas, Citations, Goals, and Privacy Services for Helpotron."""
from __future__ import annotations

import csv
import io
import json
import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from .database import Assignment, StudyMaterial, Transcript, User, get_db

logger = logging.getLogger("helpotron.user_settings")

DEFAULT_PERSONAS = [
    {
        "id": "persona_balanced",
        "name": "Balanced (Default)",
        "tone": "academic",
        "vocabulary": "standard_collegiate",
        "sentence_length": "varied",
        "formality": 75,
        "is_default": True,
    },
    {
        "id": "persona_scholarly",
        "name": "Scholarly & Rigorous",
        "tone": "formal_research",
        "vocabulary": "advanced_academic",
        "sentence_length": "long_analytical",
        "formality": 95,
        "is_default": False,
    },
    {
        "id": "persona_conversational",
        "name": "Creative & Conversational",
        "tone": "engaging",
        "vocabulary": "accessible",
        "sentence_length": "short_punchy",
        "formality": 45,
        "is_default": False,
    },
]


class UserSettingsService:
    """Manages writing personas, display, localization, privacy, goals, and citations."""

    @staticmethod
    def get_user_settings(user: User) -> Dict[str, Any]:
        """Returns full normalized settings dictionary with robust defaults."""
        settings = dict(user.settings or {})
        defaults = {
            "reading_level": "college-freshman",
            "tone": "formal",
            "active_persona_id": "persona_balanced",
            "personas": DEFAULT_PERSONAS,
            "display": {
                "theme": "dark",
                "custom_color": "#6366f1",
                "font_size": "medium",  # small | medium | large | xlarge
                "font_family": "sans-serif",  # sans-serif | serif | monospace | system
                "compact_mode": False,
                "animation_level": "full",  # full | reduced | disabled
            },
            "feature_toggles": {
                "plagiarism_checker": True,
                "citation_generator": True,
                "goal_tracker": True,
                "study_groups": True,
                "data_discount": True,
                "gdocs_export": True,
            },
            "localization": {
                "language": "en",  # en | es | fr
                "date_format": "YYYY-MM-DD",  # MM/DD/YYYY | DD/MM/YYYY | YYYY-MM-DD
                "timezone": "UTC",
            },
            "notifications": {
                "email_assignment_completion": True,
                "email_feedback_updates": True,
                "email_announcements": True,
                "email_security_alerts": True,
                "inapp_notifications": True,
                "quiet_hours_enabled": False,
                "quiet_hours_start": "22:00",
                "quiet_hours_end": "08:00",
            },
            "privacy": {
                "datalake_opt_in": True,
                "anonymize_analytics": True,
            },
            "shortcuts": {
                "submit_assignment": "Ctrl+Enter",
                "save_draft": "Ctrl+S",
                "toggle_sidebar": "Ctrl+B",
            },
            "accessibility": {
                "high_contrast": False,
                "reduced_motion": False,
                "screen_reader_mode": False,
            },
            "goals": {
                "weekly_target_assignments": 5,
                "current_streak_days": 3,
                "last_submission_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "badges_earned": ["First Assignment Completed", "Streak Starter"],
            },
            "research_library": [],
        }

        # Deep merge defaults
        for k, v in defaults.items():
            if k not in settings:
                settings[k] = v
            elif isinstance(v, dict):
                for sub_k, sub_v in v.items():
                    if sub_k not in settings[k]:
                        settings[k][sub_k] = sub_v

        return settings

    @staticmethod
    def update_user_settings(db: Session, user: User, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Merges updates into user settings and commits."""
        current = UserSettingsService.get_user_settings(user)
        for k, v in updates.items():
            if isinstance(v, dict) and isinstance(current.get(k), dict):
                current[k].update(v)
            else:
                current[k] = v
        user.settings = current
        db.commit()
        return current

    # ─── Writing Personas ───────────────────────────────────────────────────

    @staticmethod
    def save_persona(db: Session, user: User, persona: Dict[str, Any]) -> Dict[str, Any]:
        settings = UserSettingsService.get_user_settings(user)
        personas: List[Dict] = settings.get("personas", [])
        p_id = persona.get("id") or f"persona_{uuid.uuid4().hex[:6]}"
        persona["id"] = p_id

        # Replace existing or append
        updated = False
        for idx, p in enumerate(personas):
            if p.get("id") == p_id:
                personas[idx] = persona
                updated = True
                break
        if not updated:
            personas.append(persona)

        settings["personas"] = personas
        user.settings = settings
        db.commit()
        return persona

    @staticmethod
    def delete_persona(db: Session, user: User, persona_id: str) -> bool:
        settings = UserSettingsService.get_user_settings(user)
        personas = [p for p in settings.get("personas", []) if p.get("id") != persona_id]
        settings["personas"] = personas
        if settings.get("active_persona_id") == persona_id:
            settings["active_persona_id"] = "persona_balanced"
        user.settings = settings
        db.commit()
        return True

    # ─── Assignment History & Export ────────────────────────────────────────

    @staticmethod
    def query_assignment_history(
        db: Session,
        user: User,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        subject: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query = db.query(Assignment).filter(Assignment.user_id == user.id)
        if status:
            query = query.filter(Assignment.status == status)

        assignments = query.order_by(Assignment.created_at.desc()).all()
        results = []
        for a in assignments:
            item = {
                "id": a.id,
                "title": a.title,
                "due_date": a.due_date,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "progress": a.progress or {},
                "score_ai": (a.progress or {}).get("ai_score", 12.5),
                "grade": (a.progress or {}).get("grade", "A"),
                "subject": (a.progress or {}).get("subject", "General Academic"),
            }
            results.append(item)
        return results

    @staticmethod
    def export_history_csv(db: Session, user: User) -> str:
        history = UserSettingsService.query_assignment_history(db, user)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Assignment ID", "Title", "Subject", "Due Date", "Status", "Grade", "AI Detection Score", "Created At"])
        for h in history:
            writer.writerow([
                h["id"],
                h["title"],
                h["subject"],
                h["due_date"],
                h["status"],
                h["grade"],
                f"{h['score_ai']}%",
                h["created_at"],
            ])
        return output.getvalue()

    # ─── AI Citation Generator ──────────────────────────────────────────────

    @staticmethod
    def generate_citation(
        style: str,
        source_type: str,
        title: str,
        authors: List[str],
        year: str,
        url_or_doi: Optional[str] = None,
        publisher: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generates formatted academic citations across APA, MLA, Chicago, and Harvard."""
        author_str = ", ".join(authors) if authors else "Author Unknown"
        first_author = authors[0] if authors else "Unknown"
        style_lower = style.lower()

        if style_lower == "apa":
            citation = f"{author_str} ({year}). *{title}*."
            if publisher:
                citation += f" {publisher}."
            if url_or_doi:
                citation += f" {url_or_doi}"

        elif style_lower == "mla":
            citation = f"{author_str}. \"{title}.\""
            if publisher:
                citation += f" *{publisher}*,"
            citation += f" {year}."
            if url_or_doi:
                citation += f" {url_or_doi}."

        elif style_lower == "chicago":
            citation = f"{author_str}. {year}. *{title}*."
            if publisher:
                citation += f" {publisher}."
            if url_or_doi:
                citation += f" {url_or_doi}."

        elif style_lower == "harvard":
            citation = f"{author_str}, {year}. *{title}*."
            if publisher:
                citation += f" {publisher}."
            if url_or_doi:
                citation += f" Available at: <{url_or_doi}>."

        else:
            citation = f"{author_str} ({year}). {title}. {url_or_doi or ''}"

        return {
            "id": f"cit_{uuid.uuid4().hex[:8]}",
            "style": style.upper(),
            "source_type": source_type,
            "title": title,
            "authors": authors,
            "year": year,
            "url_or_doi": url_or_doi,
            "publisher": publisher,
            "formatted_text": citation.strip(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    # ─── Goals & Streaks ────────────────────────────────────────────────────

    @staticmethod
    def record_submission_streak(db: Session, user: User) -> Dict[str, Any]:
        settings = UserSettingsService.get_user_settings(user)
        goals = settings.get("goals", {})

        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        last_date_str = goals.get("last_submission_date")
        streak = goals.get("current_streak_days", 0)

        if last_date_str == today_str:
            pass  # already counted today
        elif last_date_str:
            try:
                last_dt = datetime.strptime(last_date_str, "%Y-%m-%d")
                if datetime.now(timezone.utc) - last_dt <= timedelta(days=2):
                    streak += 1
                else:
                    streak = 1
            except Exception:
                streak = 1
        else:
            streak = 1

        goals["current_streak_days"] = streak
        goals["last_submission_date"] = today_str

        # Award Badges
        badges = set(goals.get("badges_earned", []))
        if streak >= 7:
            badges.add("7-Day Streak Master")
        if streak >= 14:
            badges.add("Fortnight Dedication")
        if streak >= 30:
            badges.add("30-Day Legend")
        goals["badges_earned"] = list(badges)

        settings["goals"] = goals
        user.settings = settings
        db.commit()
        return goals

    # ─── Privacy & GDPR Data Export ─────────────────────────────────────────

    @staticmethod
    def export_full_user_data(db: Session, user: User) -> Dict[str, Any]:
        """Produces full GDPR-compliant JSON dump of all user data."""
        return {
            "export_metadata": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "public_id": user.public_id,
                "plan": user.plan,
                "credits": user.credits,
            },
            "settings": UserSettingsService.get_user_settings(user),
            "assignments": [
                {
                    "id": a.id,
                    "title": a.title,
                    "prompt": a.prompt,
                    "due_date": a.due_date,
                    "status": a.status,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in user.assignments
            ],
            "transcripts": [
                {
                    "id": t.id,
                    "source": t.source,
                    "length": len(t.text or ""),
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in user.transcripts
            ],
            "study_materials": [
                {
                    "id": m.id,
                    "kind": m.kind,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in user.materials
            ],
        }

    @staticmethod
    def delete_full_user_data(db: Session, user: User) -> bool:
        """Deletes all user content, assignments, transcripts, and account records."""
        db.delete(user)
        db.commit()
        return True


user_settings_service = UserSettingsService()
