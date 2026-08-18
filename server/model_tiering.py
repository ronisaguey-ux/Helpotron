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
        "originality_ai": {"name": "Originality.ai 3.0", "cost_usd": 0.0030, "tier": "standard"},
        "copyleaks": {"name": "Copyleaks Enterprise", "cost_usd": 0.0040, "tier": "premium"},
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
        active_detectors = enabled_detectors or ["pangram", "originality_ai"]
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


model_tiering_engine = ModelTieringEngine()
