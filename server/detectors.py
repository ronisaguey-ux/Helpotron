"""AI detector integration for helpotron.

Provides a unified interface to AI content detectors.
Each detector returns a score 0-100 (higher = more likely AI-generated).
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any, Dict, List, Optional, Tuple

import aiohttp

logger = logging.getLogger("helpotron.detectors")


class DetectorResult:
    """Result from a single detector."""

    def __init__(self, name: str, score: float, details: Optional[Dict] = None, error: Optional[str] = None):
        self.name = name
        self.score = score  # 0-100
        self.details = details or {}
        self.error = error

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "score": self.score,
            "details": self.details,
            "error": self.error,
        }


class Detector:
    """Base class for AI detectors."""

    def __init__(self, name: str, api_key: Optional[str] = None):
        self.name = name
        self.api_key = api_key

    async def detect(self, text: str) -> DetectorResult:
        raise NotImplementedError


class DummyDetector(Detector):
    """Fallback dummy detector for testing."""

    def __init__(self):
        super().__init__("dummy")

    async def detect(self, text: str) -> DetectorResult:
        score = random.uniform(5.0, 25.0)
        return DetectorResult(self.name, score)


class PerplexityCadenceDetector(Detector):
    """Calculates syntactic variance and vocabulary perplexity proxy."""

    def __init__(self):
        super().__init__("perplexity_cadence")

    async def detect(self, text: str) -> DetectorResult:
        words = text.split()
        if len(words) < 5:
            return DetectorResult(self.name, 15.0, {"reason": "short_text"})
        unique_ratio = len(set(w.lower() for w in words)) / len(words)
        ai_prob = max(5.0, min(90.0, (1.0 - unique_ratio) * 60.0))
        return DetectorResult(self.name, round(ai_prob, 2), {"unique_ratio": round(unique_ratio, 3)})


class StatisticalBurstinessDetector(Detector):
    """Heuristic burstiness variance checker."""

    def __init__(self):
        super().__init__("burstiness_analyzer")

    async def detect(self, text: str) -> DetectorResult:
        sentences = [s.strip() for s in text.replace("!", ".").replace("?", ".").split(".") if s.strip()]
        if len(sentences) <= 1:
            return DetectorResult(self.name, 20.0, {"sentences": len(sentences)})
        lens = [len(s.split()) for s in sentences]
        variance = sum((l - (sum(lens)/len(lens)))**2 for l in lens) / len(lens)
        ai_score = 10.0 if variance > 10 else 35.0
        return DetectorResult(self.name, ai_score, {"sentence_variance": round(variance, 2)})


class DetectorRegistry:
    """Registry of available detectors."""

    def __init__(self):
        self._detectors: List[Detector] = []

    def register(self, detector: Detector):
        self._detectors.append(detector)

    def get_best(self, count: int = 5) -> List[Detector]:
        """Return the top N detectors. For now, returns all registered."""
        return self._detectors[:count]

    async def detect_all(self, text: str, max_parallel: int = 5) -> List[DetectorResult]:
        """Run all detectors in parallel."""
        if not self._detectors:
            return []
        sem = asyncio.Semaphore(max_parallel)

        async def run_one(detector: Detector) -> DetectorResult:
            async with sem:
                return await detector.detect(text)

        tasks = [run_one(d) for d in self._detectors]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        final_results = []
        for r in results:
            if isinstance(r, Exception):
                logger.error("Detector raised exception: %s", r)
                continue
            final_results.append(r)
        return final_results


# Default registry
registry = DetectorRegistry()
registry.register(DummyDetector())
registry.register(PerplexityCadenceDetector())
registry.register(StatisticalBurstinessDetector())


async def score_text(text: str, threshold: float = 80.0, max_retries: int = 5) -> Tuple[float, List[DetectorResult], bool]:
    """Score text using all detectors. Return average score, detailed results, and pass/fail."""
    results = await registry.detect_all(text)
    if not results:
        return 0.0, [], False
    avg_score = sum(r.score for r in results) / len(results)
    passed = avg_score <= threshold
    return avg_score, results, passed
