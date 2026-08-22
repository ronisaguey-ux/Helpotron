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
from .default_styles import DEFAULT_STYLES, ACADEMIC_LEVELS, get_default_style

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
        "id": "gemini_31_flash_lite",
        "name": "Google Gemini 3.1 Flash-Lite",
        "pricing": "$0.50 / $1.50 per 1M tokens",
        "context_window": 1000000,
        "recommended_use": "Ultra-Fast Audio Transcription, OCR & Rapid Summaries",
        "description": "Primary high-throughput workhorse for lecture transcription and fast study tools.",
        "category": "bulk_throughput",
        "provider": "Google",
        "min_effort": 1,
    },
    {
        "id": "gemini_37_flash",
        "name": "Google Gemini 3.7 Flash",
        "pricing": "$2.50 / $10.00 per 1M tokens",
        "context_window": 1000000,
        "recommended_use": "Multimodal Vision, Presentations & Flagship Synthesis",
        "description": "Flagship multimodal engine. Automatically spawned for image/video analysis and 100% pure Gemini slide generation.",
        "category": "multimodal_vision",
        "provider": "Google",
        "is_multimodal": True,
        "min_effort": 1,
    },
    {
        "id": "deepseek_v4_flash",
        "name": "DeepSeek-V4 Flash",
        "pricing": "$0.14 / $0.28 per 1M tokens",
        "context_window": 128000,
        "recommended_use": "Rapid Outlining, Fast Flashcards & Terminology",
        "description": "High-throughput, ultra-low latency reasoning model for initial scaffolds and quick study aids.",
        "category": "utility_fast",
        "provider": "DeepSeek",
        "min_effort": 1,
    },
    {
        "id": "deepseek_v4_pro",
        "name": "DeepSeek-V4 Pro",
        "pricing": "$0.55 / $2.19 per 1M tokens",
        "context_window": 128000,
        "recommended_use": "Cognitive Deep Reasoning, Proofs & Research",
        "description": "Flagship multi-step reasoning specialist with deep chain-of-thought verification.",
        "category": "deep_reasoning",
        "provider": "DeepSeek",
        "min_effort": 750,
    },
    {
        "id": "nemotron_3_super",
        "name": "NVIDIA Nemotron-3 Super",
        "pricing": "$0.20 / $0.80 per 1M tokens",
        "context_window": 131072,
        "recommended_use": "Strict Rubric Compliance & Practice Test Generation",
        "description": "High-precision instruction adherence engine for strict institutional assignment rubrics.",
        "category": "instruction_following",
        "provider": "NVIDIA",
        "min_effort": 350,
    },
    {
        "id": "nemotron_nano",
        "name": "NVIDIA Nemotron Nano",
        "pricing": "$0.05 / $0.20 per 1M tokens",
        "context_window": 32768,
        "recommended_use": "Low-Latency Keyword & Flashcard Worker",
        "description": "Compact, efficient subagent for high-frequency active recall question extraction.",
        "category": "utility_fast",
        "provider": "NVIDIA",
        "min_effort": 1,
    },
    {
        "id": "llama_33_nemotron_70b",
        "name": "Meta Llama 3.3 Nemotron 70B",
        "pricing": "$0.35 / $1.40 per 1M tokens",
        "context_window": 131072,
        "recommended_use": "Few-Shot Style Mimicry & Humanized Drafting",
        "description": "Advanced stylistic synthesis engine calibrated to replicate authentic student writing cadence.",
        "category": "elite_synthesis",
        "provider": "NVIDIA/Meta",
        "min_effort": 750,
    },
    {
        "id": "llama_31_8b",
        "name": "Meta Llama 3.1 8B",
        "pricing": "$0.08 / $0.30 per 1M tokens",
        "context_window": 131072,
        "recommended_use": "Fast Scaffolding & Summary Drafting",
        "description": "High-speed helper model for preliminary notes and conceptual outlines.",
        "category": "fast_draft",
        "provider": "Meta",
        "min_effort": 1,
    },
    # Compatibility aliases for functional tiers
    {
        "id": "moe_high_throughput",
        "name": "High-Throughput MoE Tier (Gemini 3.1 Flash-Lite / DeepSeek-V4 Flash)",
        "pricing": "$0.085 – $0.50 / 1M tokens",
        "context_window": 1000000,
        "recommended_use": "Bulk Lecture Summaries & Long Transcripts",
        "description": "Massive context throughput for audio transcripts and comprehensive multi-week syllabus summaries.",
        "category": "bulk_throughput",
        "min_effort": 1,
    },
    {
        "id": "fast_utility_worker",
        "name": "Ultra-Fast Utility Engine (Nemotron Nano / DeepSeek-V4 Flash)",
        "pricing": "$0.04 – $0.14 / 1M tokens",
        "context_window": 131072,
        "recommended_use": "Fast Flashcards & Term Extraction",
        "description": "Low-latency worker optimized for active recall cards and repetitive keyword extraction.",
        "category": "utility_fast",
        "min_effort": 1,
    },
    {
        "id": "instruction_parser",
        "name": "Instruction-Tuned Rubric Engine (Nemotron-3 Super)",
        "pricing": "$0.20 – $0.80 / 1M tokens",
        "context_window": 131072,
        "recommended_use": "Grading Rubrics & Practice Test Generation",
        "description": "High-precision instruction adherence for strict institutional rubrics and diagnostic test banks.",
        "category": "instruction_following",
        "min_effort": 350,
    },
    {
        "id": "deep_cognitive_engine",
        "name": "Deep Cognitive Synthesis Engine (DeepSeek-V4 Pro)",
        "pricing": "$0.55 – $2.19 / 1M tokens",
        "context_window": 128000,
        "recommended_use": "Cognitive Deep Reasoning & Academic Research",
        "description": "Flagship multi-step reasoning engine with chain-of-thought verification.",
        "category": "deep_reasoning",
        "min_effort": 750,
    },
    {
        "id": "elite_humanizer_tier",
        "name": "Elite Style & Humanization Tier (Llama 3.3 Nemotron 70B)",
        "pricing": "$0.35 – $1.40 / 1M tokens",
        "context_window": 131072,
        "recommended_use": "High-Stakes Multi-Pass Evasion & Complex Synthesis",
        "description": "Elite stylistic synthesis and institutional detector defense engine.",
        "category": "elite_synthesis",
        "min_effort": 750,
    },
    {
        "id": "fast_draft_tier",
        "name": "High-Speed Drafting Engine (Llama 3.1 8B)",
        "pricing": "$0.08 – $0.30 / 1M tokens",
        "context_window": 131072,
        "recommended_use": "Sub-Second Outline Structuring",
        "description": "Ultra high-speed execution tier for preliminary assignment scaffolding.",
        "category": "fast_draft",
        "min_effort": 1,
    },
]


# User-facing tier catalog. The user directive (2026-08-22) is that model
# names appear NOWHERE user-facing — /api/user/models returns this generic
# effort-tier catalog instead of AVAILABLE_MODELS. Internal routing keeps
# using AVAILABLE_MODELS / resolve_effort_tier / the llm.py cascade.
PUBLIC_TIERS = [
    {
        "id": "fast_economical",
        "name": "Fast & Economical",
        "recommended_use": "Transcription, OCR, rapid drafts",
        "min_effort": 1,
    },
    {
        "id": "balanced",
        "name": "Balanced",
        "recommended_use": "Standard coursework synthesis",
        "min_effort": 350,
    },
    {
        "id": "flagship",
        "name": "Flagship",
        "recommended_use": "Deep reasoning and final-quality writing",
        "min_effort": 750,
    },
]


def resolve_effort_tier(effort_score: int | float | None) -> Dict[str, Any]:
    """Calculates model workload distribution based on effort score (1 - 1000)."""
    score = max(1, min(1000, int(effort_score if effort_score is not None else 500)))
    if score <= 350:
        return {
            "tier": "low_effort",
            "tier_label": "High Speed / Cost-Saving (1–350)",
            "score": score,
            "description": "Bulk work and term extraction are heavily offloaded to ultra-efficient high-speed utility tiers.",
            "summary_model": "moe_high_throughput",
            "flashcard_model": "fast_utility_worker",
            "draft_model": "fast_draft_tier",
            "humanizer_model": "instruction_parser",
        }
    elif score <= 750:
        return {
            "tier": "medium_effort",
            "tier_label": "Balanced Rigor & Evasion (351–750)",
            "score": score,
            "description": "Balanced orchestration pairing instruction-tuned engines for rubrics with high-speed drafting and elite synthesis.",
            "summary_model": "moe_high_throughput",
            "flashcard_model": "fast_utility_worker",
            "draft_model": "instruction_parser",
            "humanizer_model": "elite_humanizer_tier",
        }
    else:
        return {
            "tier": "high_effort",
            "tier_label": "Flagship Cognitive Synthesis (751–1000)",
            "score": score,
            "description": "Maximum cognitive depth, rigorous multi-pass research, and deep reasoning passes offloaded to flagship cognitive engines.",
            "summary_model": "deep_cognitive_engine",
            "flashcard_model": "instruction_parser",
            "draft_model": "deep_cognitive_engine",
            "humanizer_model": "elite_humanizer_tier",
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

            # 3. Gemini 3.7 Flash Multimodal & Presentation Engine
            "gemini_multimodal": {
                "enabled": True,  # Enables Gemini 3.7 Flash
                "auto_spawn_on_media": True,  # Auto-spawns Gemini 3.7 Flash sub-agent into teams when assignment has media/video
                "image_generation": True,
                "video_generation": True,
                "interpretation": True,
            },
            # PowerPoint / Google Slides Pure-Gemini Engine (Bypasses Nemotron & DeepSeek)
            "presentation_gemini_config": {
                "pure_gemini_exclusive": True,
                "flash_lite_percent": 60,  # 60% Gemini 3.1 Flash-Lite / 40% Gemini 3.7 Flash
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

            # 5. Multi-Scoped Subsetting Overrides Map
            # Key: settingKey -> List of { id, target_type, target_value, value, label }
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
                "originality_ai": True,
                "copyleaks": True,
                "winston_ai": True,
                "perplexity_cadence": True,
                "statistical_burstiness": True,
            },

            # 8. Model Selection & Specialized Task Routing
            "model_selection": {
                "summary_model": "moe_high_throughput",
                "flashcard_model": "fast_utility_worker",
                "rubric_model": "instruction_parser",
                "draft_model": "fast_draft_tier",
                "humanizer_model": "elite_humanizer_tier",
                "default_model": "moe_high_throughput",
                "gemini_multimodal": "gemini_37_flash",
            },

            # 9. Data Lake & Micro-Credits
            "datalake_opt_in": True,
            "micro_credits_balance": 21,  # 100 micro-credits = $1.00 USD
            "micro_credits_auto_redeem": False,

            # 10. Public Credits Leaderboard (Custom Alias / Privacy Protected)
            "leaderboard_alias": "QuantumScholar_42",
            "leaderboard_opt_in": True,
            "credits_used_total": 4820.0,

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

        # Recalculate target score mappings if either is updated
        if "target_score_numeric" in updates and "target_score_letter" not in updates:
            current["target_score_letter"] = score_to_letter(updates["target_score_numeric"])
        elif "target_score_letter" in updates and "target_score_numeric" not in updates:
            current["target_score_numeric"] = letter_to_score(updates["target_score_letter"])

        user.settings = current
        db.commit()
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
        user.settings = settings
        db.commit()
        return sample_entry

    @staticmethod
    def delete_custom_style_sample(db: Session, user: User, sample_id: str) -> bool:
        settings = UserSettingsService.get_user_settings(user)
        samples = [s for s in settings.get("custom_style_samples", []) if s.get("id") != sample_id]
        settings["custom_style_samples"] = samples
        user.settings = settings
        db.commit()
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
        user.settings = settings
        db.commit()
        return rule

    @staticmethod
    def delete_trio_rule(db: Session, user: User, rule_id: str) -> bool:
        settings = UserSettingsService.get_user_settings(user)
        rules = [r for r in settings.get("trio_rules", []) if r.get("id") != rule_id]
        settings["trio_rules"] = rules
        user.settings = settings
        db.commit()
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
        user.settings = settings
        db.commit()
        return new_subj

    @staticmethod
    def delete_custom_subject(db: Session, user: User, subject_id: str) -> bool:
        """Deletes a custom subject from taxonomy."""
        settings = UserSettingsService.get_user_settings(user)
        subjects = [s for s in settings.get("custom_subjects", []) if s.get("id") != subject_id]
        settings["custom_subjects"] = subjects
        user.settings = settings
        db.commit()
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
        user.settings = settings
        db.commit()
        return new_bubble

    @staticmethod
    def delete_custom_bubble(db: Session, user: User, bubble_id: str) -> bool:
        """Deletes a custom bubble."""
        settings = UserSettingsService.get_user_settings(user)
        bubbles = [b for b in settings.get("custom_bubbles", []) if b.get("id") != bubble_id]
        settings["custom_bubbles"] = bubbles
        user.settings = settings
        db.commit()
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

        # Synthetic baseline learners if single/few users exist
        demo_profiles = [
            {"alias": "NeuralScribe_99", "credits_used": 14280.0, "level": "PhD Researcher", "badge": "🥇 Grandmaster", "is_self": False},
            {"alias": "AeroScholar_TX", "credits_used": 11450.0, "level": "Master's Scholar", "badge": "🥈 Master", "is_self": False},
            {"alias": "CyberSynthesist", "credits_used": 9820.0, "level": "Undergraduate", "badge": "🥉 Expert", "is_self": False},
            {"alias": "DeepReason_Dev", "credits_used": 8340.0, "level": "Undergraduate", "badge": "⭐ Senior", "is_self": False},
            {"alias": "BioMatrix_AI", "credits_used": 6910.0, "level": "Master's Scholar", "badge": "⭐ Senior", "is_self": False},
            {"alias": "CalculusVoyager", "credits_used": 5400.0, "level": "High School", "badge": "🚀 Prodigy", "is_self": False},
        ]

        for u in users:
            s = UserSettingsService.get_user_settings(u)
            if s.get("leaderboard_opt_in", True):
                alias = s.get("leaderboard_alias") or f"Learner_{u.public_id[:4]}"
                used = float(s.get("credits_used_total", 4820.0))
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

        # Merge with demo profiles if list is small
        if len(board) < 5:
            existing_aliases = {b["alias"] for b in board}
            for d in demo_profiles:
                if d["alias"] not in existing_aliases:
                    board.append(d)

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
                "rank": user_rank or 4,
                "current_alias": current_settings.get("leaderboard_alias", "QuantumScholar_42"),
                "opt_in": current_settings.get("leaderboard_opt_in", True),
                "credits_used": current_settings.get("credits_used_total", 4820.0),
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
        user.settings = settings
        db.commit()
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


user_settings_service = UserSettingsService()
