"""AI detector integration for helpotron.

Provides a unified interface to AI content detectors.
Each detector returns a score 0-100 (higher = more likely AI-generated).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import random
import threading
import time
from pathlib import Path
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


# ── Self-hosted tier (owner 09-06): ZipPy + INT8 RoBERTa-ONNX ───────────────
# Bob's directive: "research and integrate these free AI detectors" — the
# 16 GB box cannot host Binoculars/Fast-DetectGPT-class LLMs, so the two
# viable open-source paths are wired in process-local, free (no API key, no
# outbound call):
#   Tier 1  ZipPy — compression heuristic (thinkst/zippy, BROTLI engine),
#            twin-prelude (AI corpus + committed public-domain human corpus).
#   Tier 2  RoBERTa openai-detector exported to INT8 ONNX (~126 MB model).
# Both are gated on config; scoring order + the naive funnel are in
# score_text(): a CLEAR local verdict short-circuits paid API detectors.
LOCAL_DETECTOR_NAMES = ("zippy", "roberta_onnx")

# Funnel bounds (owner spec 09-06): 0.15/0.90 on the 0-100 local scale.
# Below → clearly human, above → blatant raw AI; the middle band is the only
# case that escalates (deeper local tier, then the paid API tier).
FUNNEL_CLEAR_LOW = 15.0
FUNNEL_CLEAR_HIGH = 90.0

HUMAN_PRELUDE_PATH = str(Path(__file__).resolve().parent / "detector_models" / "human_prelude.txt")


def _softmax(x) -> "Any":
    import numpy as np  # lazy — optional dep at import time
    e = np.exp(x - x.max())
    return e / e.sum()


class ZipPyDetector(Detector):
    """Twin-prelude compression heuristic (thinkst/zippy, BROTLI engine).

    09-06 finding: stock ZipPy seeds its compressor on an AI-ONLY prelude,
    which one-sided labeling flags EVERYTHING as 'AI' (Pride & Prejudice →
    ('AI', 0.0)). Fix: TWO detectors — one seeded on the bundled AI prelude
    and one on the committed public-domain human corpus — and the verdict is
    the stronger delta. Measured on this box: human→HUMAN / AI→AI, 8-15 ms,
    ~55 MB RSS. BROTLI engine (fastest; LZMA is 4x slower and the ZLIB
    engine crashes on empty prelude chunks in zippy 0.1.3).
    """

    def __init__(self, human_prelude_path: str = HUMAN_PRELUDE_PATH):
        super().__init__("zippy")
        self._human_prelude = human_prelude_path
        self._ai_det = None
        self._hum_det = None

    def _pair(self):
        """Lazy brolti engines — construction computes prelude ratios once."""
        if self._ai_det is None:
            from zippy import zippy as _zz  # optional dep; graceful degradation
            engine = _zz.CompressionEngine.BROTLI
            if self._human_prelude and not os.path.exists(self._human_prelude):
                raise FileNotFoundError(self._human_prelude)
            self._ai_det = _zz.Zippy(engine=engine)
            self._hum_det = _zz.Zippy(engine=engine, prelude_file=self._human_prelude)
        return self._ai_det, self._hum_det

    async def detect(self, text: str) -> DetectorResult:
        try:
            return await asyncio.to_thread(self._detect_sync, text)
        except Exception as e:  # detection is never fatal
            logger.warning("zipPy detector failed (%s)", e)
            return DetectorResult(self.name, 0.0, {"error": str(e)})

    def _detect_sync(self, text: str) -> DetectorResult:
        text = (text or "").strip()
        if len(text) < 20:
            return DetectorResult(self.name, 15.0, {"reason": "short_text"})
        ai_det, hum_det = self._pair()
        r_ai = ai_det.detector.score_text(text)
        r_hum = hum_det.detector.score_text(text)
        ai_conf = r_ai[1] if r_ai else 0.0
        hum_conf = r_hum[1] if r_hum else 0.0
        # Higher = more AI-likely: the AI-seeded delta's share of the total.
        score = 100.0 * ai_conf / (ai_conf + hum_conf + 1e-9)
        return DetectorResult(self.name, round(score, 2), {
            "engine": "brotli",
            "verdict": "AI" if score >= 50.0 else "HUMAN",
            "ai_delta": round(ai_conf, 4),
            "human_delta": round(hum_conf, 4),
            "scored_chars": len(text),
        })


class OnnxAIDetector(Detector):
    """INT8 ONNX RoBERTa classifier (onnx-community export of
    openai-community/roberta-base-openai-detector — labels 0='Fake' (=AI),
    1='Real' (=human), same head as the original weights).

    Registered ONLY when HELPOTRON_DETECTOR_MODEL_DIR contains
    model_int8.onnx + tokenizer.json (populate via
    scripts/fetch_detector_model.sh). Runtime deps: onnxruntime + tokenizers
    ONLY — no torch/transformers, the model is pre-exported. Measured:
    ~126 MB model, ~345 MB RSS, 0.7-0.85 s CPU on 512-truncated input.
    Load is lazy; inference is lock-serialized (the tokenizers crate is not
    thread-safe and detections are rare + 24h-cached).
    """

    def __init__(self, model_dir: str):
        super().__init__("roberta_onnx")
        self._dir = model_dir
        self._tokenizer = None
        self._session = None
        self._lock = threading.Lock()

    def _get(self):
        with self._lock:  # load once; duplicate loads are wasted RAM
            if self._session is None:
                from tokenizers import Tokenizer  # lazy — optional dep
                import onnxruntime as ort
                tokenizer = Tokenizer.from_file(os.path.join(self._dir, "tokenizer.json"))
                tokenizer.enable_truncation(max_length=512)
                tokenizer.enable_padding(pad_id=1)  # RoBERTa PAD = 1
                session = ort.InferenceSession(
                    os.path.join(self._dir, "model_int8.onnx"),
                    providers=["CPUExecutionProvider"],
                )
                self._tokenizer, self._session = tokenizer, session
        return self._tokenizer, self._session

    async def detect(self, text: str) -> DetectorResult:
        try:
            return await asyncio.to_thread(self._detect_sync, text)
        except Exception as e:  # detection is never fatal
            logger.warning("roberta_onnx detector failed (%s)", e)
            return DetectorResult(self.name, 0.0, {"error": str(e)})

    def _detect_sync(self, text: str) -> DetectorResult:
        import numpy as np
        tokenizer, session = self._get()
        with self._lock:  # tokenizers encode is not thread-safe
            enc = tokenizer.encode((text or "")[:20000])
            logits = session.run(None, {
                "input_ids": np.array([enc.ids], dtype=np.int64),
                "attention_mask": np.array([enc.attention_mask], dtype=np.int64),
            })[0][0]
        probs = _softmax(logits.astype(np.float32))
        ai_prob = float(probs[0])  # 'Fake' = AI (original label mapping)
        return DetectorResult(self.name, round(ai_prob * 100.0, 2), {
            "model": "roberta-base-openai-detector",
            "quant": "int8",
            "ai_probability": round(ai_prob, 4),
            "tokens": len(enc.ids),
        })


def is_onnx_model_present(model_dir: Optional[str] = None) -> bool:
    """True when the model dir holds a servable model + tokenizer."""
    d = model_dir or getattr(_cfg_global(), "detector_model_dir", "")
    if not d:
        return False
    return bool(os.path.exists(os.path.join(d, "model_int8.onnx"))
                and os.path.exists(os.path.join(d, "tokenizer.json")))


def _cfg_global() -> "Any":
    return __import__("server.config", fromlist=["config"]).config


async def _run_detector_group(detectors_list: List[Detector], text: str,
                              max_parallel: int = 5) -> List[DetectorResult]:
    """Run a subset of the registry in parallel (funnel staging — same shape
    as DetectorRegistry.detect_all but over an explicit list)."""
    sem = asyncio.Semaphore(max_parallel)

    async def run_one(detector: Detector) -> DetectorResult:
        async with sem:
            return await detector.detect(text)

    tasks = [run_one(d) for d in detectors_list]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out: List[DetectorResult] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning("detector %s raised: %s", detectors_list[i].name, r)
            out.append(DetectorResult(detectors_list[i].name, 0.0, {"error": str(r)}))
        else:
            out.append(r)
    return out


def _annotate_triage(local_results: List[DetectorResult], local_score: float,
                     api_dets: List[Detector]) -> None:
    """Stash the funnel decision on the free-local result that decided it."""
    for r in local_results:
        if r.name not in LOCAL_DETECTOR_NAMES:
            continue
        r.details = dict(r.details or {})
        r.details["triage"] = {
            "funnel": "clear_local_verdict",
            "local_average": round(local_score, 2),
            "api_skipped": [d.name for d in api_dets],
        }
        return


def _local_verdict_is_clear(local_results: List[DetectorResult]) -> Tuple[bool, float]:
    """Funnel cascade over the free local tier.

    Tier 1 (ZipPy) decides alone when it is unequivocal; Tier 2
    (roberta_onnx, only present when the model dir is populated) is only
    consulted in the ambiguous band and the fused (mean) verdict then decides.
    Heuristics (perplexity/burstiness) are not part of the funnel ladder —
    they only feed the final average. Returns (clear?, local_score).
    """
    zippy = [r for r in local_results if r.name == "zippy"]
    if not zippy or zippy[0].error:
        return False, 0.0
    z = zippy[0]
    if z.score <= FUNNEL_CLEAR_LOW or z.score >= FUNNEL_CLEAR_HIGH:
        return True, z.score
    onnx = [r for r in local_results if r.name == "roberta_onnx" and not r.error]
    if onnx:
        fused = (z.score + onnx[0].score) / 2.0
        if fused <= FUNNEL_CLEAR_LOW or fused >= FUNNEL_CLEAR_HIGH:
            return True, fused
    return False, z.score


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

# Only the fetched detectors are available (owner 08-26; 09-04 A8 purge: Pangram + Sapling only).
# Heuristic detectors always run; API-backed detectors are gated on their API key being present.
_cfg = __import__('server.config', fromlist=['config']).config

# Self-hosted free tier (owner 09-06) — registered BEFORE the API tier so the
# funnel in score_text() can short-circuit paid calls on clear local verdicts.
if getattr(_cfg, 'detector_zippy_enabled', True):
    registry.register(ZipPyDetector())
if is_onnx_model_present(getattr(_cfg, 'detector_model_dir', '')):
    registry.register(OnnxAIDetector(getattr(_cfg, 'detector_model_dir', '')))
if getattr(_cfg, 'pangram_api_key', ''):
    registry.register(PangramDetector())
if getattr(_cfg, 'sapling_api_key', ''):
    registry.register(SaplingDetector())

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

    Self-hosted funnel (owner 09-06): when paid API detectors are registered
    AND detector_funnel_enabled, the free local tier (ZipPy → RoBERTa-ONNX
    on top of the heuristics) is given the text first. A CLEAR local
    verdict (≤ FUNNEL_CLEAR_LOW = human, ≥ FUNNEL_CLEAR_HIGH = blatant AI)
    short-circuits the paid detectors entirely — the skipped paid detectors
    are NOT in the returned results, and the local result that decided the
    verdict carries details["triage"] = {"funnel": "clear_local_verdict", ...}.
    Only the ambiguous middle band runs the paid tier (its scores join the
    average as today).
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

    # ── Self-hosted funnel (owner 09-06) ────────────────────────────────────
    # Free local tier runs FIRST; a clear local verdict skips the paid tier
    # BEFORE any outbound call (cost-saving triage — Bob spec 09-06:
    # 0.15/0.90 band). The in-process heuristics always run — they are free.
    HEURISTIC_NAMES = ("perplexity_cadence", "burstiness_analyzer")
    all_dets = list(getattr(registry, "_detectors", []))
    always_dets = [d for d in all_dets if d.name in HEURISTIC_NAMES]
    local_dets = [d for d in all_dets if d.name in LOCAL_DETECTOR_NAMES]
    api_dets = [d for d in all_dets
                if d.name not in LOCAL_DETECTOR_NAMES and d.name not in HEURISTIC_NAMES]
    if api_dets and getattr(_cfg, "detector_funnel_enabled", True):
        # Tier 1: ZipPy alone decides when unequivocal (skips tier 2 + paid).
        tier1 = ([d for d in local_dets if d.name == "zippy"]
                 or local_dets[:1])
        t1_results = await _run_detector_group(tier1 + always_dets, text)
        clear, local_score = _local_verdict_is_clear(t1_results)
        if clear:
            results = t1_results  # tier 2 + paid tier never called
            _annotate_triage(t1_results, local_score, api_dets)
            logger.info(
                "detector funnel: tier-1 local verdict %.2f clear — skipping "
                "tier 2 + paid tier %s", local_score, [d.name for d in api_dets],
            )
        else:
            # Tier 2: ONNX classifier — only the ambiguous band reaches it.
            t2 = [d for d in local_dets if d.name not in {d.name for d in tier1}]
            t2_results = await _run_detector_group(t2, text) if t2 else []
            all_local = t1_results + t2_results
            clear2, local_score2 = _local_verdict_is_clear(all_local)
            if clear2:
                results = all_local  # paid tier never called
                _annotate_triage(all_local, local_score2, api_dets)
                logger.info(
                    "detector funnel: fused local verdict %.2f clear — skipping "
                    "paid tier %s", local_score2, [d.name for d in api_dets],
                )
            else:
                api_results = await _run_detector_group(api_dets, text)
                results = all_local + api_results
    else:
        results = await registry.detect_all(text)
    if allowed is not None:
        results = [r for r in results
                   if r.name in allowed
                   or r.name in ("perplexity_cadence", "burstiness_analyzer")
                   or r.name in LOCAL_DETECTOR_NAMES]
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
