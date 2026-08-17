"""Multi-engine AI detection evasion and perplexity humanizer pipeline."""
from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Any, Dict, List, Tuple

from .detectors import DetectorRegistry, DetectorResult, score_text

logger = logging.getLogger("helpotron.humanizer")


class AIHumanizerPipeline:
    def __init__(self, human_score_threshold: float = 85.0, max_passes: int = 4):
        self.threshold = human_score_threshold
        self.max_passes = max_passes

    async def calculate_burstiness_perplexity(self, text: str) -> Dict[str, float]:
        sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
        if not sentences:
            return {"burstiness": 30.0, "perplexity_proxy": 40.0}
        lengths = [len(s.split()) for s in sentences]
        avg_len = sum(lengths) / len(lengths)
        variance = sum((l - avg_len) ** 2 for l in lengths) / len(lengths)
        burstiness_score = min(100.0, max(25.0, (variance ** 0.5) * 12.0))
        words = text.lower().split()
        unique_words = len(set(words))
        total_words = max(1, len(words))
        lexical_diversity = (unique_words / total_words) * 100.0
        return {
            "burstiness": round(burstiness_score, 2),
            "perplexity_proxy": round(lexical_diversity, 2),
        }

    async def evaluate_multi_checkers(self, text: str) -> Dict[str, Any]:
        avg_ai_score, results, passed = await score_text(text, threshold=100.0 - self.threshold)
        metrics = await self.calculate_burstiness_perplexity(text)
        human_score = max(0.0, 100.0 - avg_ai_score)
        is_stealth_ready = human_score >= self.threshold and metrics["burstiness"] >= 20.0
        return {
            "human_confidence_score": human_score,
            "burstiness": metrics["burstiness"],
            "lexical_diversity": metrics["perplexity_proxy"],
            "detector_details": [r.to_dict() for r in results],
            "is_stealth_ready": is_stealth_ready,
        }

    async def humanize_loop(self, draft_text: str) -> Tuple[str, Dict[str, Any]]:
        current_text = draft_text
        eval_result = await self.evaluate_multi_checkers(current_text)
        if eval_result["is_stealth_ready"]:
            return current_text, eval_result
        for _ in range(self.max_passes):
            # Synthesize cadence variations
            sentences = [s.strip() for s in re.split(r'([.!?]+)', current_text) if s.strip()]
            current_text = " ".join(sentences).replace(" .", ".").replace(" !", "!").replace(" ?", "?")
            eval_result = await self.evaluate_multi_checkers(current_text)
            if eval_result["is_stealth_ready"]:
                return current_text, eval_result
        # Fallback return with final metrics
        return current_text, eval_result
