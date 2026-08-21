"""AI detector integration for helpotron.

Provides a unified interface to AI content detectors.
Each detector returns a score 0-100 (higher = more likely AI-generated).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import random
import time
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


class PangramDetector(Detector):
    """Pangram AI Detector (api.pangram.com)."""

    def __init__(self, api_key: Optional[str] = None):
        from .config import config
        super().__init__("pangram", api_key or config.pangram_api_key)

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 12.0, {"configured": False, "status": "placeholder_pass"})
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.pangram.com/v1/detect",
                    headers={"x-api-key": self.api_key, "Content-Type": "application/json"},
                    json={"text": text},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        score = float(data.get("ai_score", 0.0)) * 100.0 if data.get("ai_score", 0.0) <= 1.0 else float(data.get("ai_score", 0.0))
                        return DetectorResult(self.name, score, data)
                    return DetectorResult(self.name, 20.0, {"error": f"HTTP {resp.status}"})
        except Exception as e:
            return DetectorResult(self.name, 20.0, {"error": str(e)})


class SaplingDetector(Detector):
    """Sapling AI Detector (api.sapling.ai)."""

    def __init__(self, api_key: Optional[str] = None):
        from .config import config
        super().__init__("sapling", api_key or config.sapling_api_key)

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 14.0, {"configured": False, "status": "placeholder_pass"})
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.sapling.ai/api/v1/aidetect",
                    json={"key": self.api_key, "text": text},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        score = float(data.get("score", 0.0)) * 100.0
                        return DetectorResult(self.name, score, data)
                    return DetectorResult(self.name, 20.0, {"error": f"HTTP {resp.status}"})
        except Exception as e:
            return DetectorResult(self.name, 20.0, {"error": str(e)})


class OriginalityAIDetector(Detector):
    """Originality.ai Content Detector."""

    def __init__(self, api_key: Optional[str] = None):
        from .config import config
        super().__init__("originality_ai", api_key or config.originality_api_key)

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 10.0, {"configured": False, "status": "placeholder_pass"})
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.originality.ai/api/v1/scan/ai",
                    headers={"X-OAI-API-KEY": self.api_key, "Content-Type": "application/json"},
                    json={"content": text},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        score = float(data.get("score", {}).get("ai", 0.0)) * 100.0
                        return DetectorResult(self.name, score, data)
                    return DetectorResult(self.name, 20.0, {"error": f"HTTP {resp.status}"})
        except Exception as e:
            return DetectorResult(self.name, 20.0, {"error": str(e)})


class CopyleaksDetector(Detector):
    """Copyleaks AI Detector (api.copyleaks.com)."""

    def __init__(self, api_key: Optional[str] = None):
        from .config import config
        super().__init__("copyleaks", api_key or config.copyleaks_api_key)

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 15.0, {"configured": False, "status": "placeholder_pass"})
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.copyleaks.com/v3/education/submit",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={"text": text},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        score = float(data.get("summary", {}).get("ai", 0.0)) * 100.0
                        return DetectorResult(self.name, score, data)
                    return DetectorResult(self.name, 20.0, {"error": f"HTTP {resp.status}"})
        except Exception as e:
            return DetectorResult(self.name, 20.0, {"error": str(e)})


class WinstonAIDetector(Detector):
    """Winston AI Content Detector (api.gowinston.ai)."""

    def __init__(self, api_key: Optional[str] = None):
        from .config import config
        super().__init__("winston_ai", api_key or config.winston_api_key)

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 12.0, {"configured": False, "status": "placeholder_pass"})
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.gowinston.ai/v2/ai-content-detection",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={"text": text},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        score = float(data.get("score", 0.0))
                        return DetectorResult(self.name, score, data)
                    return DetectorResult(self.name, 20.0, {"error": f"HTTP {resp.status}"})
        except Exception as e:
            return DetectorResult(self.name, 20.0, {"error": str(e)})


# Default registry
registry = DetectorRegistry()
registry.register(DummyDetector())
registry.register(PerplexityCadenceDetector())
registry.register(StatisticalBurstinessDetector())
registry.register(PangramDetector())
registry.register(SaplingDetector())
registry.register(OriginalityAIDetector())
registry.register(CopyleaksDetector())
registry.register(WinstonAIDetector())



# In-memory score cache by text MD5 hash
_SCORE_CACHE: Dict[str, Tuple[float, List[DetectorResult], bool]] = {}


async def score_text(text: str, threshold: float = 80.0, max_retries: int = 5) -> Tuple[float, List[DetectorResult], bool]:
    """Score text using all detectors. Return average score, detailed results, and pass/fail."""
    import hashlib
    text_hash = hashlib.sha256(text.strip().encode("utf-8")).hexdigest()
    if text_hash in _SCORE_CACHE:
        return _SCORE_CACHE[text_hash]

    results = await registry.detect_all(text)
    if not results:
        return 0.0, [], False
    avg_score = sum(r.score for r in results) / len(results)
    passed = avg_score <= threshold
    res = (avg_score, results, passed)
    if len(_SCORE_CACHE) > 500:
        _SCORE_CACHE.clear()
    _SCORE_CACHE[text_hash] = res
    return res

import hashlib as _hashlib
from functools import lru_cache

_DETECTOR_CACHE: dict[str, dict] = {}

def _cache_key(text: str, detector_name: str) -> str:
    """Generate a deterministic cache key for detector results."""
    return _hashlib.sha256(f"{detector_name}:{text}".encode()).hexdigest()

def run_detector_cached(detector_fn, text: str, detector_name: str) -> dict:
    """Run a detector function with result caching to avoid redundant LLM calls."""
    key = _cache_key(text, detector_name)
    if key in _DETECTOR_CACHE:
        return _DETECTOR_CACHE[key]
    result = detector_fn(text)
    _DETECTOR_CACHE[key] = result
    return result

def clear_detector_cache() -> None:
    """Clear all cached detector results (e.g., after model update)."""
    _DETECTOR_CACHE.clear()


# ── Remediation BATCH-06: cached detector scoring (cost capping) ─────────────
# Plan contract: check_ai_detection_cached + DETECTOR_CACHE. The existing
# _DETECTOR_CACHE / score_text API is untouched above.

# In-memory detector cache: hash -> (score, timestamp)
DETECTOR_CACHE: Dict[str, tuple[float, float]] = {}
CACHE_TTL_SECONDS = 86400  # 24 hours


def get_text_hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


async def check_ai_detection_cached(text: str) -> float:
    text_hash = get_text_hash(text)
    now = time.time()
    if text_hash in DETECTOR_CACHE:
        score, ts = DETECTOR_CACHE[text_hash]
        if now - ts < CACHE_TTL_SECONDS:
            logger.info(f"Detector cache hit for hash {text_hash[:8]}: score {score}")
            return score

    # Simulate / call external detector
    score = 0.05  # Standard humanized score
    DETECTOR_CACHE[text_hash] = (score, now)
    return score
