"""User Settings, Personas, Citations, Goals, and Privacy Services for Helpotron.

Includes:
1. Target Score & Grade Scheduling Engine (Letter grades + 0-100 numeric mapping + Trajectory).
2. Academic Level Engine (3rd Grade to PhD Professor).
3. Multi-Sample Writing Style Customization (Scoped to Subject/Teacher, distinct from Data Lake).
4. Individual AI Detector Toggles.
5. Model Selection (Flash vs Pro).
6. TRIO Context-Aware Resolution Engine (Target, Restriction, Inclusion, Override).
"""
from __future__ import annotations

import copy
import csv
import io
import json
import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session
try:
    from .database import Assignment, StudyMaterial, Transcript, User, get_db
    from .default_styles import DEFAULT_STYLES, ACADEMIC_LEVELS, get_default_style
except (ImportError, ValueError):
    from server.database import Assignment, StudyMaterial, Transcript, User, get_db
    from server.default_styles import DEFAULT_STYLES, ACADEMIC_LEVELS, get_default_style


def persist_user_settings(db, user, settings=None) -> dict:
    """Persist user settings through a core UPDATE (BATCH-05 fix, operator
    08-26): a shallow `user.settings = X` write whose nested dicts are shared
    with the ORM-cached value compares equal (old == new), so SQLAlchemy
    skips the flush and every nested edit silently vanishes. This always
    fires, then refreshes the ORM view."""
    from sqlalchemy import update
    data = copy.deepcopy(settings if settings is not None else dict(user.settings or {}))
    db.execute(update(User).where(User.id == user.id).values(settings=data))
    db.commit()
    db.refresh(user)
    return data


logger = logging.getLogger("helpotron.user_settings")

GRADE_LETTER_MAP = [
    {"letter": "F", "min": 0, "max": 59, "default_num": 50},
    {"letter": "F+", "min": 60, "max": 62, "default_num": 61},
    {"letter": "D", "min": 63, "max": 66, "default_num": 65},
    {"letter": "D+", "min": 67, "max": 69, "default_num": 68},
    {"letter": "C", "min": 70, "max": 73, "default_num": 72},
    {"letter": "C+", "min": 74, "max": 76, "default_num": 75},
    {"letter": "B", "min": 77, "max": 82, "default_num": 80},
    {"letter": "B+", "min": 83, "max": 86, "default_num": 85},
    {"letter": "A", "min": 87, "max": 92, "default_num": 90},
    {"letter": "A+", "min": 93, "max": 100, "default_num": 98},
]


def score_to_letter(score: int | float) -> str:
    s = max(0, min(100, int(round(score))))
    for g in reversed(GRADE_LETTER_MAP):
        if s >= g["min"]:
            return g["letter"]
    return "F"


def letter_to_score(letter: str) -> int:
    for g in GRADE_LETTER_MAP:
        if g["letter"].upper() == letter.upper():
            return g["default_num"]
    return 85  # Default B+


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


AVAILABLE_MODELS = [
    {
        "id": "nemotron_nano",
        "name": "NVIDIA Nemotron-3 Nano 30B",
        "pricing": "$0.05 / $0.20 per 1M tokens",
        "context_window": 32768,
        "recommended_use": "Effort 1: Ultra-Fast Utility & Rapid Keyword Extraction",
        "description": "Effort Level 1 worker for low-latency tasks and instant drafting.",
        "category": "utility_fast",
        "provider": "NVIDIA",
        "min_effort": 1,
    },
    {
        "id": "qwen_72b",
        "name": "Qwen 2.5 72B Instruct",
        "pricing": "$0.09 / $0.18 per 1M tokens",
        "context_window": 131072,
        "recommended_use": "Effort 2: Economical Drafting & Summary Generation",
        "description": "Effort Level 2 high-capacity open-weight engine for fast text creation.",
        "category": "fast_draft",
        "provider": "Qwen",
        "min_effort": 150,
    },
    {
        "id": "gemini_31_flash_lite",
        "name": "Google Gemini 3.1 Flash-Lite",
        "pricing": "$0.075 / $0.30 per 1M tokens",
        "context_window": 1000000,
        "recommended_use": "Effort 3: Audio Transcription, OCR & Massive Context",
        "description": "Effort Level 3 workhorse for lecture audio and long multi-modal documents.",
        "category": "bulk_throughput",
        "provider": "Google",
        "min_effort": 250,
    },
    {
        "id": "deepseek_v4_1_flash",
        "name": "DeepSeek-V4.1 Flash",
        "pricing": "$0.15 / $0.60 per 1M tokens",
        "context_window": 1048576,
        "recommended_use": "Effort 4–10: Balanced-to-Flagship Reasoning & Vision",
        "description": "Single DeepSeek engine for Effort Levels 4 through 10: balanced multi-step reasoning, rubric compliance, deep synthesis and vision.",
        "category": "instruction_following",
        "provider": "DeepSeek",
        "is_multimodal": True,
        "min_effort": 350,
    },
    {
        "id": "gemini_38_flash",
        "name": "Google Gemini 3.8 Flash",
        "pricing": "$0.25 / $1.00 per 1M tokens",
        "context_window": 1000000,
        "recommended_use": "Max Effort Gemini-Exclusive: Audio, Video, Google Slides & Doc History",
        "description": "Exclusively engaged when max effort is requested on Gemini-only tasks.",
        "category": "multimodal_vision",
        "provider": "Google",
        "is_multimodal": True,
        "min_effort": 800,
    },
]


PUBLIC_TIERS = [
    {
        "id": "fast_economical",
        "name": "Fast & Economical (Effort 1–3)",
        "recommended_use": "Rapid transcription, OCR, keyword extraction, and drafts",
        "min_effort": 1,
    },
    {
        "id": "balanced",
        "name": "Balanced Rigor (Effort 4–7)",
        "recommended_use": "Standard coursework synthesis, multi-step problem solving, and vision",
        "min_effort": 350,
    },
    {
        "id": "flagship",
        "name": "Flagship Cognitive Synthesis (Effort 8–10)",
        "recommended_use": "Deep reasoning, rigorous research, and thesis-level drafting",
        "min_effort": 750,
    },
]


def resolve_effort_tier(effort_score: int | float | None) -> Dict[str, Any]:
    """Calculates model workload distribution based on effort score (1 - 1000 or 1 - 10)."""
    if effort_score is None:
        score = 500
    else:
        score = int(effort_score)

    if score <= 10:
        lvl = max(1, min(10, score))
        score = lvl * 100
    elif score <= 150: lvl = 1
    elif score <= 250: lvl = 2
    elif score <= 350: lvl = 3
    elif score <= 750: lvl = 5
    else: lvl = 9

    if lvl == 1:
        return {
            "tier": "effort_1_nemotron_nano",
            "tier_label": "Level 1: Nemotron 3 Nano",
            "score": score,
            "level": 1,
            "description": "Ultra-fast utility and rapid token extraction using NVIDIA Nemotron 3 Nano.",
            "summary_model": "nemotron_nano",
            "flashcard_model": "nemotron_nano",
            "draft_model": "nemotron_nano",
            "humanizer_model": "nemotron_nano",
        }
    elif lvl == 2:
        return {
            "tier": "effort_2_qwen_72b",
            "tier_label": "Level 2: Qwen 2.5 72B",
            "score": score,
            "level": 2,
            "description": "Economical high-capacity open-weight drafting using Qwen 2.5 72B Instruct.",
            "summary_model": "qwen_72b",
            "flashcard_model": "qwen_72b",
            "draft_model": "qwen_72b",
            "humanizer_model": "qwen_72b",
        }
    elif lvl == 3:
        return {
            "tier": "effort_3_gemini_lite",
            "tier_label": "Level 3: Gemini 3.1 Flash Lite",
            "score": score,
            "level": 3,
            "description": "Fast OCR, audio transcription, and long-context processing with Gemini 3.1 Flash Lite.",
            "summary_model": "gemini_31_flash_lite",
            "flashcard_model": "gemini_31_flash_lite",
            "draft_model": "gemini_31_flash_lite",
            "humanizer_model": "gemini_31_flash_lite",
        }
    elif lvl <= 7:
        return {
            "tier": "effort_4_7_deepseek_v4_1_flash",
            "tier_label": f"Levels 4–7: DeepSeek V4.1 Flash (Lvl {lvl})",
            "score": score,
            "level": lvl,
            "description": "Balanced multi-step reasoning, rubric compliance, and vision analysis with DeepSeek V4.1 Flash.",
            "summary_model": "deepseek_v4_1_flash",
            "flashcard_model": "deepseek_v4_1_flash",
            "draft_model": "deepseek_v4_1_flash",
            "humanizer_model": "deepseek_v4_1_flash",
        }
    else:
        return {
            "tier": "effort_8_10_deepseek_v4_1_flash",
            "tier_label": f"Levels 8–10 (7+): DeepSeek V4.1 Flash (Lvl {lvl})",
            "score": score,
            "level": lvl,
            "description": "Flagship cognitive depth, research, and rigorous synthesis with DeepSeek V4.1 Flash (Gemini 3.8 Flash for Gemini-exclusive tasks).",
            "summary_model": "deepseek_v4_1_flash",
            "flashcard_model": "deepseek_v4_1_flash",
            "draft_model": "deepseek_v4_1_flash",
            "humanizer_model": "deepseek_v4_1_flash",
        }


DEFAULT_CUSTOM_SUBJECTS = [
    {
        "id": "subj_math",
        "name": "Mathematics",
        "description": "Calculus, linear algebra, statistics, discrete mathematics, and formal proofs",
        "color": "blue",
    },
    {
        "id": "subj_english",
        "name": "English & Literature",
        "description": "Literary analysis, rhetorical essays, creative writing, and close textual reading",
        "color": "purple",
    },
    {
        "id": "subj_history",
        "name": "History & Social Studies",
        "description": "Historiography, source evaluation, archival synthesis, and political science",
        "color": "amber",
    },
    {
        "id": "subj_cs",
        "name": "Computer Science",
        "description": "Algorithms, data structures, system architecture, and software engineering",
        "color": "emerald",
    },
    {
        "id": "subj_biology",
        "name": "Biology & Life Sciences",
        "description": "Cellular biology, genetics, ecology, physiology, and laboratory reports",
        "color": "teal",
    },
    {
        "id": "subj_psychology",
        "name": "Psychology & Cognitive Sciences",
        "description": "Empirical methodology, cognitive biases, behavioral neuroscience, and case studies",
        "color": "indigo",
    },
]


class UserSettingsService:
    """Manages context-aware personalization, TRIO scopes, styles, detectors, and scheduling."""

    @staticmethod
    def get_user_settings(user: User) -> Dict[str, Any]:
        """Returns full normalized settings dictionary with comprehensive context-aware defaults."""
        settings = dict(user.settings or {})
        defaults = {
            # 1. Target Grade & Academic Level
            "academic_level": "high_school",  # 3rd_grade through phd_professor
            "target_score_numeric": 88,
            "target_score_letter": "A",
            "grade_scheduling": {
                "enabled": False,
                "start_score": 75,  # C+
                "target_score": 92,  # A
                "rate_unit": "week",  # day | week | month
                "increment_points": 3,
                "increment_interval": 7,  # e.g. every 7 days
                "start_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },

            # 2. Effort Level Score & Auto-Start Configuration
            "effort_score": 500,  # 1 - 1000 scale
            "auto_start": False,  # True = Auto-start execution on assignment bubble organization; False = Manual staging approval

            # 3. Gemini 3.8 Flash Multimodal & Presentation Engine
            "gemini_multimodal": {
                "enabled": True,  # Enables Gemini 3.8 Flash
                "auto_spawn_on_media": True,  # Auto-spawns Gemini 3.8 Flash sub-agent into teams when assignment has media/video
                "image_generation": True,
                "video_generation": True,
                "interpretation": True,
            },
            # PowerPoint / Google Slides Pure-Gemini Engine (Bypasses Nemotron & DeepSeek)
            "presentation_gemini_config": {
                "pure_gemini_exclusive": True,
                "flash_lite_percent": 60,  # 60% Gemini 3.1 Flash-Lite / 40% Gemini 3.8 Flash
                "speaker_notes_enabled": True,
                "visual_layout_instructions": True,
            },
            # Fake Writing History & Version Replay (LMS / Google Docs Audit Trail Evasion)
            "fake_writing_history": {
                "enabled": False,
                "typing_speed_wpm": 65,
                "burstiness": "natural_academic",
                "simulated_version_count": 8,
                "simulated_micro_pauses": True,
                "suppress_paste_events": True,
            },

            # 4. Custom Subjects & Taxonomy
            "custom_subjects": DEFAULT_CUSTOM_SUBJECTS,

            # 5. Scoped overrides — the per-area variants of a setting.
            #
            # CANONICAL SHAPE (matches humanize_skill._scoped_value, which is the
            # code that actually resolves them):
            #     settings["scoped"][path] = [{ id, scope: {level, ref}, value }]
            #     path is a dotted setting path, e.g. "ai.humanizer"
            #
            # `scoped` is declared HERE so the API will accept it. It previously was
            # not, which meant every override a client saved was silently dropped by
            # filter_user_settings_payload: the user saw "saved", the value was never
            # stored, and no override could ever take effect. `scoped_subsettings`
            # below is the older key with a different shape ({target_type,
            # target_value}) that nothing ever read; it is kept so anything already
            # stored under it keeps resolving (see _scoped_value).
            "scoped": {},

            # Legacy key, kept readable for compatibility. New writes go to
            # `scoped`. Do not build on this.
            "scoped_subsettings": {
                "effort_score": [],
                "academic_level": [],
                "target_score": [],
                "auto_start": [],
                "gemini_multimodal": [],
            },

            # 6. Writing Customization & Humanization
            "tone": "formal",  # formal | semi_formal | conversational
            "vocabulary_level": "advanced",  # basic | intermediate | advanced | expert
            "sentence_length": "mixed",  # short | medium | long | mixed
            "creativity_level": "balanced",  # conservative | balanced | creative
            "burstiness": 88,  # 0 - 100
            "perplexity": 92,  # 0 - 100
            "active_persona_id": "persona_balanced",
            "personas": DEFAULT_PERSONAS,
            "custom_style_samples": [],  # Array of { id, title, content, target_subject, target_teacher, extracted_style }

            # 7. Individual AI Detectors
            "ai_detectors": {
                "pangram": True,
                "sapling": True,
                "perplexity_cadence": True,
                "statistical_burstiness": True,
                # 09-06 (owner): free self-hosted tier — ZipPy compression
                # heuristic + INT8 ONNX RoBERTa classifier. No API keys.
                "zippy": True,
                "roberta_onnx": True,
            },

            # 8. Model Selection & Specialized Task Routing
            "model_selection": {
                "summary_model": "moe_high_throughput",
                "flashcard_model": "fast_utility_worker",
                "rubric_model": "instruction_parser",
                "draft_model": "fast_draft_tier",
                "humanizer_model": "elite_humanizer_tier",
                "default_model": "moe_high_throughput",
                "gemini_multimodal": "gemini_38_flash",
            },

            # 8b. AI & Intelligence (agent brain — one top-level key so the
            # Settings UI, overlord and the per-surface hierarchy gates share
            # it; "ai" must be declared here or the 08-29 writable-keys filter
            # silently drops every AI-section edit at the PATCH boundary).
            "ai": {
                "aiName": "Helpotron",
                "personality": "Professional",
                "instructions": "",
                "effortScore": 500,
                "effort": "balanced",
                "autoRouting": True,
                # 09-02 (extension permission mode): manual/auto/yolo governs
                # CHAT action approvals in the extension. Declared in defaults
                # so the schema-derived PATCH allowlist accepts it — same
                # precedent as educationalMode; the web client (MyAgentView)
                # already writes it via ai: { ..., mode: next }.
                "mode": "manual",
                # Humanizer skill (08-30): unified AI-humanizer rulebook; when a
                # surface is "on", humanize_skill.humanizer_block() is appended
                # to that surface's agent system prompt.
                "humanizer": "off",
                # AI Detection Standard (08-31, operator): run the plugged-in
                # detectors on agent replies and redo until the min-human%
                # rate is met. Same global/subject/assignment hierarchy as the
                # humanizer (via settings["scoped"] overrides). Detector names
                # are registry keys of the 3 plugged-in detectors.
                "detection": {
                    "enabled": "off",
                    "min_human": 70,
                    # 09-04 (owner A8 purge): Pangram + Sapling only;
                    # 09-06 (owner): + free self-hosted tier (ZipPy,
                    # RoBERTa-ONNX — run in-process, funnel-skips the paid
                    # detectors when the local verdict is clear).
                    "detectors": {"sapling": True, "pangram": True, "zippy": True, "roberta_onnx": True},
                },
                # Sample Voice (08-31, operator): "write like a sample" — the
                # user adds samples (paste or upload) and the agent writes in
                # that voice. enabled is scoped-able (ai.style.enabled);
                # selection holds the GLOBAL sample ids; per-subject/assignment
                # overrides are scoped variants of ai.style.samples (value =
                # list of sample ids). samples = {id: {name, text}} library.
                "style": {
                    "enabled": "off",
                    "selection": [],
                    "samples": {},
                },
                "hierarchy": {
                    "my_agent": {},
                    "assignment_team": {},
                    "study_tools": {},
                    "dump_agent": {},
                    "qa_chat": {},
                    "extensions": {},
                },
            },

            # Educational Mode (08-26 gate): True = school-only help scope for
            # the My Agent surface; False = open chat about anything. Declared
            # here — the 08-29 writable-keys filter is derived from this
            # defaults schema, so an undeclared key would be silently dropped
            # at the PATCH boundary and the backend gate could never flip.
            "educationalMode": True,

            # 9. Data Lake & Micro-Credits
            "datalake_opt_in": True,
            "micro_credits_balance": 0,  # earned only via admin-reviewed Data Lake implementations (operator 08-26)
            "micro_credits_auto_redeem": False,

            # 10. Public Credits Leaderboard (Custom Alias / Privacy Protected)
            # (08-27: no fabricated defaults. A private alias is auto-generated
            # as Learner_<public_id> in get_credits_leaderboard when the user
            # has not set one, and credits start at 0 until real usage exists.)
            "leaderboard_alias": None,
            "leaderboard_opt_in": True,
            "credits_used_total": 0.0,

            # 6. Context-Aware TRIO Overrides
            "trio_rules": [],  # Array of { id, name, target: {type, value}, restriction, inclusion, overrides, apply_to_all }

            # Display & General
            "display": {
                "theme": "dark",
                "custom_color": "#3b82f6",
                "font_size": "medium",
                "compact_mode": False,
            },
            "localization": {
                "language": "en",
                "date_format": "YYYY-MM-DD",
                "timezone": "America/New_York",
            },
            "notifications": {
                "email_assignment_completion": True,
                "inapp_notifications": True,
                "telegram_notifications": True,
                "quiet_hours_enabled": False,
                "quiet_hours_start": "22:00",
                "quiet_hours_end": "08:00",
            },
            "permissions": {
                "auto_approved_rules": [
                    "generate_flashcards",
                    "summarize_lecture",
                    "format_citations",
                    "audit_rubric",
                ],
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
            elif isinstance(v, dict) and isinstance(settings.get(k), dict):
                for sub_k, sub_v in v.items():
                    if sub_k not in settings[k]:
                        settings[k][sub_k] = sub_v

        # Ensure letter / numeric consistency
        if "target_score_numeric" in settings and "target_score_letter" not in settings:
            settings["target_score_letter"] = score_to_letter(settings["target_score_numeric"])

        # AUTH-01: Ensure 2fa_totp_secret is never exposed via settings read
        settings.pop("2fa_totp_secret", None)

        return settings

    @staticmethod
    def _deep_merge_settings(dest: dict, src: dict) -> dict:
        """Recursively merges src dictionary into dest dictionary in place.
        Preserves sibling keys in nested dictionaries (REL-02).
        """
        for k, v in src.items():
            if isinstance(v, dict) and isinstance(dest.get(k), dict):
                UserSettingsService._deep_merge_settings(dest[k], v)
            else:
                dest[k] = copy.deepcopy(v)
        return dest


    #: Keys whose value is a COMPLETE document rather than a bag of independent
    #: preferences, and which must therefore be REPLACED on write, not merged.
    #:
    #: `scoped` holds `{path: [variants]}`. The generic merge below (`current[k].update(v)`)
    #: makes deletion impossible: sending `{}` merges nothing and every existing key
    #: survives, so a client could never clear its overrides and a stale entry was
    #: permanent. Verified live — `PATCH {"scoped": {}}` returned 200 and changed
    #: nothing, while `{"scoped": {"<path>": []}}` worked. Patching one path at a time
    #: cannot remove a path that is no longer wanted, which is a leak the user cannot
    #: see or fix. The client always sends the full map, so replacing is also what it
    #: already means. This is why the merge must be opted OUT of rather than the
    #: caller working around it.
    REPLACE_ON_WRITE = frozenset({"scoped"})

    @staticmethod
    def update_user_settings(db: Session, user: User, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Merges updates into user settings and commits.

        THE READ-MODIFY-WRITE MUST BE SERIALISED, and on this database the obvious
        mechanism does not work. `settings` is a JSON blob, so no single UPDATE can
        express the merge; and `with_for_update()` is a **NO-OP on SQLite** — verified
        by compiling the statement, the emitted SQL contains no `FOR UPDATE`, because
        SQLite has no row locks to take. Shipping it would have looked like a fix and
        protected nothing.

        `BEGIN IMMEDIATE` is the mechanism that does work: it takes the database WRITE
        lock before the read, so a concurrent writer blocks here (busy_timeout is 30s
        and the journal is WAL) and its subsequent read sees this writer's commit
        instead of a stale snapshot.

        The failure it prevents is silent and financial. Reproduced before the fix: two
        sessions both read the same dict, the first commits `key_A`, the second commits
        `key_B` from its stale copy, and `key_A` is gone with both calls reporting
        success. For token balances that is two concurrent charges each debiting the
        same balance — the account is overdrawn and nothing raises.
        """
        # Take the write lock up front so the read below cannot be a stale snapshot.
        # If a transaction is already open we are inside the caller's unit of work and
        # its lock is already held, so the error is expected and safe to ignore.
        try:
            db.execute(text("BEGIN IMMEDIATE"))
        except Exception:
            pass

        # Drop any cached copy (the identity map may hold an object read BEFORE another
        # writer committed) so the read below goes back to the database.
        if hasattr(db, "expire_all"):
            db.expire_all()

        current = UserSettingsService.get_user_settings(user)
        for k, v in updates.items():
            if k == "scoped" and isinstance(v, dict):
                # REL-07: Merge scoped settings per-path to avoid clobbering other tab overrides,
                # while allowing an explicit empty dict to clear all overrides.
                if not v:
                    current["scoped"] = {}
                else:
                    if not isinstance(current.get("scoped"), dict):
                        current["scoped"] = {}
                    for path, path_val in v.items():
                        current["scoped"][path] = copy.deepcopy(path_val)
            elif k in UserSettingsService.REPLACE_ON_WRITE:
                # Still copy, so the caller's object cannot alias the stored JSON.
                current[k] = copy.deepcopy(v)
            elif isinstance(v, dict) and isinstance(current.get(k), dict):
                UserSettingsService._deep_merge_settings(current[k], v)
            else:
                current[k] = v

        # Recalculate target score mappings if either is updated
        if "target_score_numeric" in updates and "target_score_letter" not in updates:
            current["target_score_letter"] = score_to_letter(updates["target_score_numeric"])
        elif "target_score_letter" in updates and "target_score_numeric" not in updates:
            current["target_score_numeric"] = letter_to_score(updates["target_score_letter"])

        # BATCH-05 fix (operator 08-26): `current` is a SHALLOW copy whose nested
        # dicts are shared with the ORM-cached value, so mutating them makes
        # old == new and SQLAlchemy skips the flush — every nested update
        # silently vanished. Write through a core UPDATE (always fired).
        from sqlalchemy import update
        db.execute(update(User).where(User.id == user.id).values(settings=copy.deepcopy(current)))
        db.commit()
        db.refresh(user)
        return current

    # ─── Personas Lifecycle ──────────────────────────────────────────────────

    @staticmethod
    def save_persona(db: Session, user: User, persona: Dict[str, Any]) -> Dict[str, Any]:
        settings = UserSettingsService.get_user_settings(user)
        personas: List[Dict] = settings.get("personas", [])
        p_id = persona.get("id") or f"persona_{uuid.uuid4().hex[:6]}"
        persona["id"] = p_id

        updated = False
        for idx, p in enumerate(personas):
            if p.get("id") == p_id:
                personas[idx] = persona
                updated = True
                break
        if not updated:
            personas.append(persona)

        settings["personas"] = personas
        persist_user_settings(db, user, settings)
        return persona

    @staticmethod
    def delete_persona(db: Session, user: User, persona_id: str) -> bool:
        settings = UserSettingsService.get_user_settings(user)
        personas = [p for p in settings.get("personas", []) if p.get("id") != persona_id]
        settings["personas"] = personas
        if settings.get("active_persona_id") == persona_id:
            settings["active_persona_id"] = "persona_balanced"
        persist_user_settings(db, user, settings)
        return True

    # ─── Custom Writing Style Samples (Private Per User) ────────────────────

    @staticmethod
    def add_custom_style_sample(
        db: Session,
        user: User,
        title: str,
        content: str,
        target_subject: Optional[str] = None,
        target_teacher: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extracts stylistic traits and adds private sample to user settings."""
        settings = UserSettingsService.get_user_settings(user)
        samples = list(settings.get("custom_style_samples", []))

        words = content.split()
        avg_sentence_len = round(len(words) / max(1, content.count(".") + content.count("!") + content.count("?")), 1)
        unique_words = len(set(w.lower() for w in words))
        ttr = round(unique_words / max(1, len(words)), 2)

        sample_id = f"style_{uuid.uuid4().hex[:8]}"
        sample_entry = {
            "id": sample_id,
            "title": title or f"Writing Sample {len(samples) + 1}",
            "content_snippet": content[:300] + ("..." if len(content) > 300 else ""),
            "full_content": content,
            "word_count": len(words),
            "target_subject": target_subject or "All Subjects",
            "target_teacher": target_teacher or "All Teachers",
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
            "extracted_style": {
                "avg_sentence_length": avg_sentence_len,
                "lexical_diversity": ttr,
                "cadence": "High Variance" if avg_sentence_len > 18 else "Structured",
                "estimated_level": "College Upper" if ttr > 0.65 else "Standard",
            },
        }

        samples.append(sample_entry)
        settings["custom_style_samples"] = samples
        persist_user_settings(db, user, settings)
        return sample_entry

    @staticmethod
    def delete_custom_style_sample(db: Session, user: User, sample_id: str) -> bool:
        settings = UserSettingsService.get_user_settings(user)
        samples = [s for s in settings.get("custom_style_samples", []) if s.get("id") != sample_id]
        settings["custom_style_samples"] = samples
        persist_user_settings(db, user, settings)
        return True

    # ─── TRIO (Target, Restriction, Inclusion, Override) Resolution ─────────

    @staticmethod
    def save_trio_rule(db: Session, user: User, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Saves a context-aware TRIO rule."""
        settings = UserSettingsService.get_user_settings(user)
        rules = list(settings.get("trio_rules", []))
        rule_id = rule.get("id") or f"trio_{uuid.uuid4().hex[:8]}"
        rule["id"] = rule_id
        rule["created_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

        updated = False
        for idx, r in enumerate(rules):
            if r.get("id") == rule_id:
                rules[idx] = rule
                updated = True
                break
        if not updated:
            rules.append(rule)

        settings["trio_rules"] = rules
        persist_user_settings(db, user, settings)
        return rule

    @staticmethod
    def delete_trio_rule(db: Session, user: User, rule_id: str) -> bool:
        settings = UserSettingsService.get_user_settings(user)
        rules = [r for r in settings.get("trio_rules", []) if r.get("id") != rule_id]
        settings["trio_rules"] = rules
        persist_user_settings(db, user, settings)
        return True

    # ─── Custom Subjects Management ──────────────────────────────────────────

    @staticmethod
    def add_custom_subject(
        db: Session,
        user: User,
        name: str,
        description: str,
        color: Optional[str] = "blue",
    ) -> Dict[str, Any]:
        """Adds a user custom subject to their taxonomy."""
        settings = UserSettingsService.get_user_settings(user)
        subjects = list(settings.get("custom_subjects", []))
        subject_id = f"subj_custom_{uuid.uuid4().hex[:6]}"
        new_subj = {
            "id": subject_id,
            "name": name.strip(),
            "description": description.strip(),
            "color": color or "blue",
            "is_custom": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        subjects.append(new_subj)
        settings["custom_subjects"] = subjects
        persist_user_settings(db, user, settings)
        return new_subj

    @staticmethod
    def delete_custom_subject(db: Session, user: User, subject_id: str) -> bool:
        """Deletes a custom subject from taxonomy."""
        settings = UserSettingsService.get_user_settings(user)
        subjects = [s for s in settings.get("custom_subjects", []) if s.get("id") != subject_id]
        settings["custom_subjects"] = subjects
        persist_user_settings(db, user, settings)
        return True

    @staticmethod
    def get_custom_subjects(db: Session, user: User) -> List[Dict[str, Any]]:
        """Returns full list of standard and custom subjects."""
        settings = UserSettingsService.get_user_settings(user)
        return settings.get("custom_subjects", DEFAULT_CUSTOM_SUBJECTS)

    # ─── Custom Bubbles Management ───────────────────────────────────────────

    @staticmethod
    def add_custom_bubble(
        db: Session,
        user: User,
        title: str,
        description: str,
        color: Optional[str] = "blue",
        icon: Optional[str] = "🫧",
    ) -> Dict[str, Any]:
        """Creates a custom assignment bubble for organizing coursework."""
        settings = UserSettingsService.get_user_settings(user)
        bubbles = list(settings.get("custom_bubbles", []))
        bubble_id = f"bubble_{uuid.uuid4().hex[:6]}"
        new_bubble = {
            "id": bubble_id,
            "title": title.strip(),
            "description": description.strip(),
            "color": color or "blue",
            "icon": icon or "🫧",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        bubbles.append(new_bubble)
        settings["custom_bubbles"] = bubbles
        persist_user_settings(db, user, settings)
        return new_bubble

    @staticmethod
    def delete_custom_bubble(db: Session, user: User, bubble_id: str) -> bool:
        """Deletes a custom bubble."""
        settings = UserSettingsService.get_user_settings(user)
        bubbles = [b for b in settings.get("custom_bubbles", []) if b.get("id") != bubble_id]
        settings["custom_bubbles"] = bubbles
        persist_user_settings(db, user, settings)
        return True

    @staticmethod
    def get_custom_bubbles(db: Session, user: User) -> List[Dict[str, Any]]:
        """Returns list of custom organization bubbles."""
        settings = UserSettingsService.get_user_settings(user)
        return settings.get("custom_bubbles", [])

    # ─── Credits Used Leaderboard & Custom Display Alias ─────────────────────

    @staticmethod
    def get_credits_leaderboard(db: Session, current_user: Optional[User] = None) -> Dict[str, Any]:
        """Calculates rankings of top learners based on total compute credits used with custom privacy aliases."""
        users = db.query(User).all()
        board = []

        # (08-27: synthetic baseline learners removed — the board ranks only
        # real users, honestly, even when few signups exist.)
        for u in users:
            s = UserSettingsService.get_user_settings(u)
            if s.get("leaderboard_opt_in", True):
                alias = s.get("leaderboard_alias") or f"Learner_{u.public_id[:4]}"
                used = float(s.get("credits_used_total") or 0.0)
                level_key = s.get("academic_level", "high_school")
                level_label = level_key.replace("_", " ").title()
                is_current = (current_user is not None) and (u.id == current_user.id)

                board.append({
                    "alias": alias,
                    "credits_used": used,
                    "level": level_label,
                    "badge": "⭐ Contender",
                    "is_self": is_current,
                })

        # Sort descending by credits used
        board.sort(key=lambda x: x["credits_used"], reverse=True)

        # Assign ranks & top-tier badges
        user_rank = None
        for idx, entry in enumerate(board):
            rank_num = idx + 1
            entry["rank"] = rank_num
            if rank_num == 1:
                entry["badge"] = "🥇 Grandmaster"
            elif rank_num == 2:
                entry["badge"] = "🥈 Master"
            elif rank_num == 3:
                entry["badge"] = "🥉 Expert"

            if entry.get("is_self"):
                user_rank = rank_num

        current_settings = UserSettingsService.get_user_settings(current_user) if current_user else {}

        return {
            "leaderboard": board[:50],
            "total_participants": len(board),
            "user_stats": {
                # (08-27: honest user_stats — rank is None when the user is not
                # on the board yet; alias/credits come from real settings only.)
                "rank": user_rank,
                "current_alias": current_settings.get("leaderboard_alias") or None,
                "opt_in": current_settings.get("leaderboard_opt_in", True),
                "credits_used": float(current_settings.get("credits_used_total") or 0.0),
            },
        }

    @staticmethod
    def update_leaderboard_alias(
        db: Session,
        user: User,
        alias: str,
        opt_in: bool = True,
    ) -> Dict[str, Any]:
        """Updates user's custom leaderboard alias to protect their real username."""
        settings = UserSettingsService.get_user_settings(user)
        cleaned_alias = alias.strip()
        settings["leaderboard_alias"] = cleaned_alias
        settings["leaderboard_opt_in"] = opt_in
        persist_user_settings(db, user, settings)
        return {
            "status": "success",
            "leaderboard_alias": cleaned_alias,
            "leaderboard_opt_in": opt_in,
        }




    @staticmethod
    def resolve_effective_settings(
        user_settings: Dict[str, Any],
        subject: Optional[str] = None,
        teacher: Optional[str] = None,
        assignment_title: Optional[str] = None,
        class_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Cascades settings through the TRIO hierarchy: Global -> Subject -> Class -> Teacher -> Assignment."""
        effective = dict(user_settings)
        rules: List[Dict[str, Any]] = user_settings.get("trio_rules", [])

        priority_weights = {
            "assignment": 40,
            "teacher": 30,
            "class": 20,
            "subject": 10,
            "global": 0,
        }

        sorted_rules = sorted(
            rules,
            key=lambda r: (
                priority_weights.get(r.get("target", {}).get("type", "global"), 0) + r.get("override_priority", 0)
            )
        )

        for rule in sorted_rules:
            if rule.get("apply_to_all"):
                effective.update(rule.get("overrides", {}))
                continue

            target_type = rule.get("target", {}).get("type")
            target_val = (rule.get("target", {}).get("value") or "").strip().lower()

            matched = False
            if target_type == "subject" and subject and target_val in subject.lower():
                matched = True
            elif target_type == "teacher" and teacher and target_val in teacher.lower():
                matched = True
            elif target_type == "class" and class_code and target_val in class_code.lower():
                matched = True
            elif target_type == "assignment" and assignment_title and target_val in assignment_title.lower():
                matched = True

            if matched:
                restriction = (rule.get("restriction") or "").strip().lower()
                inclusion = (rule.get("inclusion") or "").strip().lower()

                if inclusion and subject and inclusion in subject.lower():
                    continue

                effective.update(rule.get("overrides", {}))

        # Calculate scheduled grade if grade_scheduling is active
        sched = effective.get("grade_scheduling", {})
        if sched.get("enabled"):
            try:
                start_d = datetime.strptime(sched.get("start_date", "2026-01-01"), "%Y-%m-%d").replace(tzinfo=timezone.utc)
                now = datetime.now(timezone.utc)
                days_elapsed = max(0, (now - start_d).days)

                interval = max(1, sched.get("increment_interval", 7))
                pts = sched.get("increment_points", 3)
                start_score = sched.get("start_score", 75)
                target_score = sched.get("target_score", 92)

                steps = days_elapsed // interval
                current_score = min(target_score, start_score + (steps * pts))
                effective["target_score_numeric"] = current_score
                effective["target_score_letter"] = score_to_letter(current_score)
            except Exception:
                pass

        return effective

    # ─── AI Citation & Export Helpers ────────────────────────────────────────

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
            citation = f'{first_author}. "{title}." '
            if publisher:
                citation += f"{publisher}, "
            citation += f"{year}."
            if url_or_doi:
                citation += f" {url_or_doi}."

        elif style_lower == "chicago":
            citation = f'{author_str}. "{title}." '
            if publisher:
                citation += f"{publisher}, "
            citation += f"{year}."
            if url_or_doi:
                citation += f" {url_or_doi}."

        else:  # Harvard default
            citation = f"{author_str}, {year}. *{title}*."
            if publisher:
                citation += f" {publisher}."
            if url_or_doi:
                citation += f" Available at: {url_or_doi}."

        return {
            "id": f"cit_{uuid.uuid4().hex[:8]}",
            "style": style.upper(),
            "source_type": source_type,
            "title": title,
            "authors": authors,
            "year": year,
            "url_or_doi": url_or_doi,
            "formatted_text": citation.strip(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

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
                "score_ai": (a.progress or {}).get("ai_score"),
                "grade": (a.progress or {}).get("grade"),
                "subject": (a.progress or {}).get("subject") or (a.progress or {}).get("course") or "",
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
                h["grade"] or "Not graded",
                f"{h['score_ai']}%" if h["score_ai"] is not None else "",
                h["created_at"],
            ])
        return output.getvalue()


user_settings_service = UserSettingsService()


# ─── Settings write-authorisation (audit 08-29, finding H1) ──────────────────
#
# The settings JSON blob is not just preferences: ban state, spendable balances
# and 2FA state are stored in it too, and are read as authority elsewhere —
#
#   settings["banned"] / ["banned_until"]  -> security.is_user_banned()
#   settings["token_balance"]              -> routes_overlord.py budget deduct
#   settings["2fa_enabled"]                -> main.py login second factor
#   settings["tokens"]                     -> admin.py redeemable grants
#
# PATCH /api/settings merged its request body into that blob key-by-key with no
# field authorisation, so any signed-up account (signup is open) could send
# {"token_balance": 1e9} or {"banned": false} and grant itself unlimited paid
# usage or lift its own ban.
#
# The allowlist is derived from the defaults schema rather than hand-listed, so
# a new preference added to get_user_settings() is writable automatically and
# cannot be forgotten here, while any key that is *not* a declared preference —
# every field above — is refused by construction.

#: Declared in the defaults schema but written by the server, never the user.
_SERVER_OWNED_SETTINGS_KEYS = frozenset({
    "micro_credits_balance",  # granted only by admin-reviewed Data Lake payouts
    "credits_used_total",     # usage accounting, written by the metering path
})

_WRITABLE_KEYS_CACHE: Optional[frozenset] = None


def user_writable_settings_keys() -> frozenset:
    """Top-level settings keys a user may set on themselves via the API."""
    global _WRITABLE_KEYS_CACHE
    if _WRITABLE_KEYS_CACHE is None:
        blank = SimpleNamespace(settings=None)
        declared = set(UserSettingsService.get_user_settings(blank).keys())
        _WRITABLE_KEYS_CACHE = frozenset(declared - _SERVER_OWNED_SETTINGS_KEYS)
    return _WRITABLE_KEYS_CACHE


def filter_user_settings_payload(
    payload: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[str]]:
    """Split an untrusted settings payload into (accepted, rejected_keys).

    Apply at every HTTP boundary that forwards a user-supplied body into
    update_user_settings(). The service itself stays unrestricted because
    trusted internal callers legitimately write server-owned fields (e.g.
    routes_datalake.py crediting micro_credits_balance).
    """
    if not isinstance(payload, dict):
        return {}, []
    allowed = user_writable_settings_keys()
    accepted: Dict[str, Any] = {}
    rejected: List[str] = []
    for key, value in payload.items():
        if key in allowed:
            accepted[key] = value
        else:
            rejected.append(str(key))
    return accepted, rejected



# Strict Canonical 6-Tier Hierarchy
SCOPE_HIERARCHY = ["global", "subject", "class", "teacher", "assignment", "task"]

DEFAULT_SETTINGS = {
    "effort": "medium",
    "effort_level": "medium",
    "auto_routing": True,
    "humanizer_level": "medium",
    "tone": "academic",
    "detail_level": "comprehensive",
    "citation_style": "apa"
}


class ScopedSettingsService:
    """Scoped settings inspector runtime service (BATCH-04)."""
    def __init__(self, db: Optional[Session] = None):
        self.db = db

    def get_effective_settings(self, user_id: str, scope_type: str = "global", scope_id: str = "global", **kwargs) -> Dict[str, Any]:
        from .database import SessionLocal, UserSetting
        db = self.db or SessionLocal()
        should_close = self.db is None
        try:
            records = db.query(UserSetting).filter(UserSetting.user_id == str(user_id)).all()
            res = dict(DEFAULT_SETTINGS)
            res["scope_type"] = scope_type
            res["scope_id"] = scope_id
            for r in records:
                if r.setting_key:
                    res[r.setting_key] = r.setting_value
            return res
        finally:
            if should_close:
                db.close()


def resolve_effective_setting(
    db: Session,
    user_id: str,
    setting_key: str,
    subject_id: Optional[str] = None,
    class_id: Optional[str] = None,
    teacher_id: Optional[str] = None,
    assignment_id: Optional[str] = None,
    task_id: Optional[str] = None
) -> Dict[str, Any]:
    """Resolve effective setting value along the strict 6-tier hierarchy."""
    scope_values = {
        "global": "global",
        "subject": subject_id,
        "class": class_id,
        "teacher": teacher_id,
        "assignment": assignment_id,
        "task": task_id
    }

    records = db.query(UserSetting).filter(
        UserSetting.user_id == str(user_id),
        UserSetting.setting_key == setting_key
    ).all() if hasattr(db, "query") else []

    record_map = {(r.scope_type.lower(), r.scope_id): r.setting_value for r in records}

    effective_value = DEFAULT_SETTINGS.get(setting_key, "medium")
    source_scope = "default"
    inheritance_chain = [{"scope": "default", "value": effective_value}]

    for scope in SCOPE_HIERARCHY:
        sid = scope_values.get(scope)
        if sid:
            val = record_map.get((scope, sid))
            if val is not None:
                effective_value = val
                source_scope = f"{scope}:{sid}"
                inheritance_chain.append({"scope": scope, "scope_id": sid, "value": val})

    return {
        "key": setting_key,
        "effective_value": effective_value,
        "source_scope": source_scope,
        "inheritance_chain": inheritance_chain,
        "provenance": f"Resolved from {source_scope}"
    }

def resolve_scoped_setting(*args, **kwargs):
    if args and not hasattr(args[0], 'query'):
        # Called as (user_id, setting_key, scope_type, scope_id, db)
        user_id = args[0]
        setting_key = args[1] if len(args) > 1 else kwargs.get('setting_key')
        scope_type = args[2] if len(args) > 2 else kwargs.get('scope_type', 'global')
        scope_id = args[3] if len(args) > 3 else kwargs.get('scope_id', 'default')
        db = args[4] if len(args) > 4 else kwargs.get('db')
        if not db:
            from .database import SessionLocal
            db = SessionLocal()
        return resolve_effective_setting(db, str(user_id), str(setting_key))
    return resolve_effective_setting(*args, **kwargs)

def set_scoped_setting(*args, **kwargs) -> Dict[str, Any]:
    """Set or update a scoped setting in the database with dual signature compatibility."""
    from .database import SessionLocal, UserSetting
    if args and not hasattr(args[0], 'query'):
        # Called as (user_id, setting_key, value, scope_type, scope_id, db)
        user_id = str(args[0])
        setting_key = str(args[1]) if len(args) > 1 else str(kwargs.get('setting_key'))
        setting_value = args[2] if len(args) > 2 else kwargs.get('value')
        scope_type = str(args[3]) if len(args) > 3 else str(kwargs.get('scope_type', 'global'))
        scope_id = str(args[4]) if len(args) > 4 else str(kwargs.get('scope_id', 'default'))
        db = args[5] if len(args) > 5 else kwargs.get('db')
    else:
        db = args[0] if args else kwargs.get('db')
        user_id = str(args[1]) if len(args) > 1 else str(kwargs.get('user_id'))
        setting_key = str(args[2]) if len(args) > 2 else str(kwargs.get('setting_key'))
        setting_value = args[3] if len(args) > 3 else kwargs.get('setting_value', kwargs.get('value'))
        scope_type = str(args[4]) if len(args) > 4 else str(kwargs.get('scope_type', 'global'))
        scope_id = str(args[5]) if len(args) > 5 else str(kwargs.get('scope_id', 'global'))

    should_close = False
    if not db:
        db = SessionLocal()
        should_close = True

    try:
        scope_type = scope_type.lower()
        record = db.query(UserSetting).filter(
            UserSetting.user_id == user_id,
            UserSetting.setting_key == setting_key,
            UserSetting.scope_type == scope_type,
            UserSetting.scope_id == scope_id
        ).first()

        if record:
            record.setting_value = str(setting_value)
        else:
            record = UserSetting(
                user_id=user_id,
                setting_key=setting_key,
                setting_value=str(setting_value),
                scope_type=scope_type,
                scope_id=scope_id
            )
            db.add(record)

        db.commit()
        db.refresh(record)
        return {"status": "success", "id": record.id, "setting_key": setting_key, "value": setting_value, "scope": f"{scope_type}:{scope_id}"}
    finally:
        if should_close:
            db.close()

def get_scoped_settings_for_entity(
    db: Session,
    user_id: str,
    subject_id: Optional[str] = None,
    class_id: Optional[str] = None,
    teacher_id: Optional[str] = None,
    assignment_id: Optional[str] = None,
    task_id: Optional[str] = None
) -> Dict[str, Any]:
    """Resolve all default settings for a given entity context."""
    results = {}
    for key in DEFAULT_SETTINGS:
        results[key] = resolve_effective_setting(
            db, user_id, key,
            subject_id=subject_id,
            class_id=class_id,
            teacher_id=teacher_id,
            assignment_id=assignment_id,
            task_id=task_id
        )
    return results
