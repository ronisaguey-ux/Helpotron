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
    """Pangram AI Detector (text.external-api.pangram.com)."""

    def __init__(self, api_key: Optional[str] = None):
        from .config import config
        super().__init__("pangram", api_key or getattr(config, "pangram_api_key", "") or os.getenv("PANGRAM_API_KEY", ""))

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 0.0, {"configured": False, "unavailable": True, "reason": "API key not configured"})
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://text.external-api.pangram.com/task",
                    headers={"x-api-key": self.api_key, "Content-Type": "application/json"},
                    json={"text": text, "public_dashboard_link": False},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        task_id = data.get("task_id")
                        if not task_id:
                            return DetectorResult(self.name, 10.0, data)
                        # Poll for result
                        for _ in range(5):
                            await asyncio.sleep(1.0)
                            async with session.get(
                                f"https://text.external-api.pangram.com/task/{task_id}",
                                headers={"x-api-key": self.api_key},
                                timeout=aiohttp.ClientTimeout(total=5)
                            ) as poll_resp:
                                if poll_resp.status == 200:
                                    pdata = await poll_resp.json()
                                    if pdata.get("stage") == "STAGE_SUCCESS":
                                        fraction_ai = float(pdata.get("fraction_ai", 0.0))
                                        return DetectorResult(self.name, fraction_ai * 100.0, pdata)
                                    elif pdata.get("stage") == "STAGE_FAILED":
                                        return DetectorResult(self.name, 20.0, pdata)
                        return DetectorResult(self.name, 15.0, {"task_id": task_id, "status": "in_progress"})
                    return DetectorResult(self.name, 20.0, {"error": f"HTTP {resp.status}"})
        except Exception as e:
            return DetectorResult(self.name, 20.0, {"error": str(e)})


class SaplingDetector(Detector):
    """Sapling AI Detector (api.sapling.ai)."""

    def __init__(self, api_key: Optional[str] = None):
        from .config import config
        super().__init__("sapling", api_key or getattr(config, "sapling_api_key", "") or os.getenv("SAPLING_API_KEY", ""))

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 0.0, {"configured": False, "unavailable": True, "reason": "API key not configured"})
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
        super().__init__("originality_ai", api_key or getattr(config, "originality_api_key", "") or os.getenv("ORIGINALITY_API_KEY", ""))

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 0.0, {"configured": False, "unavailable": True, "reason": "API key not configured"})
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
        super().__init__("copyleaks", api_key or getattr(config, "copyleaks_api_key", "") or os.getenv("COPYLEAKS_API_KEY", ""))

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 0.0, {"configured": False, "unavailable": True, "reason": "API key not configured"})
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
        super().__init__("winston_ai", api_key or getattr(config, "winston_api_key", "") or os.getenv("WINSTON_API_KEY", ""))

    async def detect(self, text: str) -> DetectorResult:
        if not self.api_key or self.api_key.startswith("your_"):
            return DetectorResult(self.name, 0.0, {"configured": False, "unavailable": True, "reason": "API key not configured"})
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.gowinston.ai/v2/ai-content-detection",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={"text": text, "sentences": True, "language": "auto"},
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
# 08-28 BUG-4 fix: DummyDetector was registered BY DEFAULT and returned a
# random score (uniform(5,25)) — averaged into every real score_text result,
# so detector_risk was ~always "safe" regardless of the actual text and the
# UI's AI-risk meter was fiction. The dummy class is kept for tests, but the
# default registry is REAL detectors only: perplexity + burstiness heuristics
# (always run, deterministic, free), plus the gated API detectors below.
registry = DetectorRegistry()
registry.register(PerplexityCadenceDetector())
registry.register(StatisticalBurstinessDetector())

# Only the fetched detectors are available (owner 08-26). Heuristic detectors
# always run; API-backed detectors are gated on their API key being present.
_cfg = __import__('server.config', fromlist=['config']).config
if getattr(_cfg, 'pangram_api_key', ''):
    registry.register(PangramDetector())
if getattr(_cfg, 'sapling_api_key', ''):
    registry.register(SaplingDetector())
if getattr(_cfg, 'winston_api_key', ''):
    registry.register(WinstonAIDetector())

# Originality.ai and Copyleaks are intentionally not registered when no key is
# fetched (owner 08-26 directive: only the fetched detectors are available).
if getattr(_cfg, 'originality_api_key', ''):
    registry.register(OriginalityAIDetector())
if getattr(_cfg, 'copyleaks_api_key', ''):
    registry.register(CopyleaksDetector())
# In-memory score cache by text SHA256 hash with 24h TTL (plan contract:
# detectors must not re-run on identical text within a day — repeated
# humanizer/verification passes on the same draft hit this, not the LLM).
_SCORE_CACHE: Dict[str, Tuple[float, float, List[DetectorResult], bool]] = {}
CACHE_TTL_SECONDS = 86400  # 24 hours


async def score_text(text: str, threshold: float = 80.0, max_retries: int = 5,
                     detectors: Optional[List[str]] = None) -> Tuple[float, List[DetectorResult], bool]:
    """Score text using all detectors. Return average score, detailed results, and pass/fail.

    detectors: optional allow-list of registry names (operator 08-31, the AI
    Detection Standard setting). The two in-process heuristic scorers always
    run; API detectors outside the allow-list are skipped. None = all
    registered detectors (existing behavior). The score cache keys on the
    selection too, so toggling a detector never reuses a stale average.
    """
    import hashlib
    allowed = {str(n).lower() for n in detectors} if detectors is not None else None
    select_tag = "|".join(sorted(allowed)) if allowed else ""
    text_hash = hashlib.sha256(f"{text.strip()}|{select_tag}".encode("utf-8")).hexdigest()
    cached = _SCORE_CACHE.get(text_hash)
    if cached is not None:
        avg_score, ts, results, passed = cached
        if time.time() - ts < CACHE_TTL_SECONDS:
            return avg_score, results, passed
        del _SCORE_CACHE[text_hash]  # stale — recompute below

    results = await registry.detect_all(text)
    if allowed is not None:
        results = [r for r in results
                   if r.name in allowed or r.name in ("perplexity_cadence", "burstiness_analyzer")]
    if not results:
        return 0.0, [], False
    avg_score = sum(r.score for r in results) / len(results)
    passed = avg_score <= threshold
    if len(_SCORE_CACHE) > 500:
        _SCORE_CACHE.clear()
    _SCORE_CACHE[text_hash] = (avg_score, time.time(), results, passed)
    return avg_score, results, passed

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

# Lowercase export (plan contract) — the subsystem is the same object.
detector_cache = DETECTOR_CACHE


def get_text_hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


async def check_ai_detection_cached(text: str) -> float:
    """Real AI-detection risk (0.0-1.0) for ``text``, cached 24h by exact hash.

    08-28 BUG-4 fix: this used to return a hardcoded ``score = 0.05``
    ("Simulate / call external detector") no matter what the text was — the
    dashboard/cards read `progress.detector_risk` (multiplied by 100) and this
    stub meant the value was always a fiction, and worse, ALWAYS "humanized".
    It now runs the REAL registry via :func:`score_text` — the exact engine
    draft.py / humanizer.py / gdocs_exporter.py already use: perplexity +
    burstiness heuristics always (free, deterministic), Pangram/Sapling/
    Originality/Copyleaks/Winston when their keys are configured. Result is
    still 0-1 so every existing reader (progress.detector_risk, dashboard
    ai_risk, settings detector_score) works unchanged.

    Args:
        text: text to score; empty/short text returns 0.0 (nothing to flag).

    Returns:
        float: average detector score as a 0.0-1.0 fraction.
    """
    text = (text or "").strip()
    if not text or len(text) < 20:
        return 0.0
    text_hash = get_text_hash(text)
    now = time.time()
    if text_hash in DETECTOR_CACHE:
        score, ts = DETECTOR_CACHE[text_hash]
        if now - ts < CACHE_TTL_SECONDS:
            logger.info("Detector cache hit for hash %s: score %s", text_hash[:8], score)
            return score

    try:
        avg_score, _results, _passed = await score_text(text, threshold=80.0)
        score = round(max(0.0, min(1.0, avg_score / 100.0)), 4)
    except Exception as e:  # noqa: BLE001 — detection is never fatal
        logger.warning("AI detection failed (%s) — returning neutral 0.0", e)
        score = 0.0
    DETECTOR_CACHE[text_hash] = (score, now)
    if len(DETECTOR_CACHE) > 2000:
        for k in list(DETECTOR_CACHE.keys())[:1000]:
            DETECTOR_CACHE.pop(k, None)
    return score
