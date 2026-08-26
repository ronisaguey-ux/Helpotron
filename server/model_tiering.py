"""Model Tiering & Effort Level Engine.

Manages dynamic routing between Gemini 3.1 Flash-Lite (Cost-effective default)
and Gemini 3.7 Flash (High-quality reasoning), maps 1-10 Effort Levels,
enforces cost-aware detector routing, and calculates pre-flight cost estimations.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from .config import config
from .database import User, Assignment


class ModelTieringEngine:
    # Model Catalog & Pricing (per 1M tokens)
    MODEL_TIERS = {
        "gemini-3.1-flash-lite": {
            "tier": "economy",
            "name": "Gemini 3.1 Flash-Lite",
            "cost_per_1m_input": 0.50,
            "cost_per_1m_output": 1.50,
            "description": "Ultra-fast, cost-effective default for audio transcription, OCR, text extraction, and initial drafts.",
            "recommended_effort_min": 1,
            "recommended_effort_max": 5,
        },
        "gemini-3.7-flash": {
            "tier": "high_quality",
            "name": "Gemini 3.7 Flash",
            "cost_per_1m_input": 2.50,
            "cost_per_1m_output": 7.50,
            "description": "High-intelligence flagship for complex reasoning, academic synthesis, humanization, and detector evasion.",
            "recommended_effort_min": 6,
            "recommended_effort_max": 10,
        },
    }

    DETECTOR_PRICING = {
        "pangram": {"name": "Pangram Cadence", "cost_usd": 0.0020, "tier": "cheap"},
        "sapling": {"name": "Sapling Academic", "cost_usd": 0.0015, "tier": "cheap"},
        "winston_ai": {"name": "Winston AI", "cost_usd": 0.0020, "tier": "cheap"},
    }

    @staticmethod
    def resolve_model_for_task(
        task_type: str,  # "transcription", "ocr", "draft", "humanization", "reasoning", "grading"
        effort_level: int = 5,
        user_override: Optional[str] = None,
        assignment_override: Optional[str] = None,
        admin_override: Optional[str] = None,
    ) -> str:
        """Determines whether to use Gemini 3.1 Flash-Lite or Gemini 3.7 Flash based on Effort Level."""
        if admin_override:
            return admin_override
        if assignment_override:
            return assignment_override
        if user_override:
            return user_override

        # Task-specific base model routing by effort level
        if task_type in ["transcription", "audio"]:
            return "gemini-3.1-flash-lite"

        if task_type in ["ocr", "vision", "extraction"]:
            return "gemini-3.1-flash-lite" if effort_level <= 6 else "gemini-3.7-flash"

        # Content generation & humanization
        if effort_level <= 4:
            # Low Effort (1-4): Economy tier (Gemini 3.1 Flash-Lite)
            return "gemini-3.1-flash-lite"
        elif effort_level <= 7:
            # Medium Effort (5-7): Balanced
            if task_type in ["humanization", "final_polish", "grading_prediction"]:
                return "gemini-3.7-flash"
            return "gemini-3.1-flash-lite"
        else:
            # High Effort (8-10): Premium tier (Gemini 3.7 Flash)
            return "gemini-3.7-flash"

    @staticmethod
    def estimate_task_cost(
        task_type: str,
        word_count: int = 500,
        effort_level: int = 5,
        enabled_detectors: Optional[List[str]] = None,
        user_multiplier: float = 1.0,
    ) -> Dict[str, Any]:
        """Calculates pre-flight estimated cost for a given operation."""
        model = ModelTieringEngine.resolve_model_for_task(task_type, effort_level)
        est_tokens = max(100, int(word_count * 1.4))

        # Model Token Cost
        if model == "gemini-3.1-flash-lite":
            model_cost = (est_tokens / 1_000_000.0) * 0.50 + (est_tokens / 1_000_000.0) * 1.50
        else:
            model_cost = (est_tokens / 1_000_000.0) * 2.50 + (est_tokens / 1_000_000.0) * 7.50

        # Detectors Cost
        detector_cost = 0.0
        active_detectors = enabled_detectors or ["pangram", "sapling", "winston_ai"]
        for d in active_detectors:
            if d in ModelTieringEngine.DETECTOR_PRICING:
                detector_cost += ModelTieringEngine.DETECTOR_PRICING[d]["cost_usd"]

        base_total = model_cost + detector_cost
        user_charged_total = base_total * user_multiplier

        return {
            "task_type": task_type,
            "effort_level": effort_level,
            "selected_model": model,
            "estimated_tokens": est_tokens,
            "model_cost_usd": round(model_cost, 5),
            "detector_cost_usd": round(detector_cost, 5),
            "base_total_cost_usd": round(base_total, 5),
            "user_multiplier": user_multiplier,
            "estimated_charged_cost_usd": round(user_charged_total, 5),
            "budget_friendly_advice": "Switch to Effort Level 1-4 (Gemini 3.1 Flash-Lite) to save ~70% on token cost." if effort_level > 6 else "Optimal cost-performance ratio selected.",
        }

    @staticmethod
    def is_presentation_task(prompt: str = "", file_name: str = "", task_type: str = "") -> bool:
        """Detects if an assignment or dumped material requires PowerPoint or Google Slides."""
        text = f"{prompt} {file_name} {task_type}".lower()
        presentation_keywords = [
            "powerpoint", "slides", "presentation", "deck", "google slides",
            ".pptx", ".ppt", ".key", ".gslides", "slide deck", "keynote", "pitch deck"
        ]
        return any(k in text for k in presentation_keywords)

    @staticmethod
    def resolve_presentation_gemini_models(
        flash_lite_percent: int = 50,
        prompt: str = "",
        file_name: str = "",
    ) -> Dict[str, Any]:
        """Exclusively uses Google Gemini models for presentation & slide assignments.
        
        Nemotron and DeepSeek subagent teams are bypassed completely.
        User can configure the exact percentage balance between Gemini 3.1 Flash-Lite
        (structure, outline, raw slide notes) and Gemini 3.7 Flash (visual styling,
        deep narrative synthesis, layout design).
        """
        lite_pct = max(0, min(100, int(flash_lite_percent)))
        flash_pct = 100 - lite_pct

        return {
            "is_presentation": True,
            "engine_mode": "pure_gemini",
            "bypassed_subagents": ["nemotron-3-super", "nemotron-nano", "deepseek-v4-flash", "llama-nemotron"],
            "active_models": {
                "gemini-3.1-flash-lite": {
                    "role": "Slide Outline, Structural Ingestion, Speaker Bullet Drafting",
                    "percentage": lite_pct,
                    "model_id": "gemini-3.1-flash-lite",
                },
                "gemini-3.7-flash": {
                    "role": "High-Cognition Narrative Flow, Slide Layout Logic, Visual Formatting",
                    "percentage": flash_pct,
                    "model_id": "gemini-3.7-flash",
                },
            },
            "summary": f"PowerPoint/Google Slides routed exclusively to Gemini ({lite_pct}% Flash-Lite / {flash_pct}% 3.7 Flash).",
        }

    @staticmethod
    def generate_fake_writing_history(
        content: str,
        wpm: int = 65,
        version_count: int = 8,
        burstiness: str = "natural_academic",
    ) -> Dict[str, Any]:
        """Generates realistic keystroke replay and incremental revision history for Google Docs / LMS audit evasion."""
        import random
        from datetime import datetime, timezone, timedelta

        words = content.split()
        total_words = len(words)
        total_chars = len(content)

        # Estimate realistic typing duration with micro-pauses and corrections
        base_minutes = max(10, int(total_words / max(20, wpm)))
        pause_multiplier = 1.4 if burstiness == "natural_academic" else 1.2
        total_elapsed_minutes = int(base_minutes * pause_multiplier)

        now = datetime.now(timezone.utc)
        start_time = now - timedelta(minutes=total_elapsed_minutes)

        versions = []
        step_words = max(1, total_words // version_count)
        
        for i in range(1, version_count + 1):
            cur_word_count = min(total_words, i * step_words if i < version_count else total_words)
            timestamp = start_time + timedelta(minutes=int(total_elapsed_minutes * (i / version_count)))
            
            partial_text = " ".join(words[:cur_word_count])
            versions.append({
                "version_number": i,
                "timestamp": timestamp.isoformat(),
                "word_count": cur_word_count,
                "character_count": len(partial_text),
                "edit_type": "initial_outline" if i == 1 else ("paragraph_expansion" if i < version_count else "final_polishing_and_citations"),
                "snippet": partial_text[:120] + ("..." if len(partial_text) > 120 else ""),
            })

        return {
            "enabled": True,
            "status": "simulated_history_active",
            "total_words": total_words,
            "total_characters": total_chars,
            "simulated_duration_minutes": total_elapsed_minutes,
            "target_wpm": wpm,
            "burstiness_profile": burstiness,
            "simulated_versions_count": len(versions),
            "versions": versions,
            "audit_trail_ready": True,
        }


model_tiering_engine = ModelTieringEngine()


MONTHLY_BUDGET_USD = {
    'basic': 3.00,
    'pro': 6.00,
    'elite': 15.00,
}

def check_budget_guardrail(user_plan: str, current_spend_usd: float) -> bool:
    """Return True if user is within their monthly LLM budget, False if over limit."""
    limit = MONTHLY_BUDGET_USD.get(user_plan, 1.00)
    return current_spend_usd < limit

def get_model_for_tier(user_plan: str, task_type: str = 'general') -> str:
    """Return the appropriate model name based on user plan and task type."""
    if user_plan == 'elite':
        return 'gemini-3.7-flash'
    elif user_plan == 'pro':
        return 'deepseek-v4-pro'
    else:
        return 'deepseek-v4-flash'
