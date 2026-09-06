"""Self-hosted detector tier (owner 09-06): ZipPy twin-prelude heuristic,
INT8 ONNX RoBERTa classifier, and the local-clear funnel.

The funnel contract: with paid API detectors registered and the funnel on, a
CLEAR local verdict (<= FUNNEL_CLEAR_LOW = human, >= FUNNEL_CLEAR_HIGH = AI)
must short-circuit the paid detectors (no call; skipped names annotated in
the deciding local result's details["triage"]). Only the ambiguous middle
band escalates to the paid tier.
"""
import asyncio
import sys
from pathlib import Path

import pytest

from server import detectors

PRELUDE = Path(__file__).resolve().parent.parent / "detector_models" / "human_prelude.txt"


def _ai_sample() -> str:
    pytest.importorskip("zippy", reason="thinkst-zippy not installed")
    from importlib.resources import files as _files
    return _files("zippy").joinpath("ai-generated.txt").read_text(encoding="utf-8")


def _human_sample() -> str:
    return PRELUDE.read_text(encoding="utf-8")


class _FakeDetector(detectors.Detector):
    """Deterministic stand-in for registry units; records calls."""

    def __init__(self, name: str, score: float, error: str = ""):
        super().__init__(name)
        self._score = score
        self._error = error
        self.calls = 0

    async def detect(self, text: str) -> detectors.DetectorResult:
        self.calls += 1
        return detectors.DetectorResult(
            self.name, self._score,
            {} if not self._error else {"error": self._error},
        )


@pytest.fixture(autouse=True)
def _fresh_cache():
    detectors._SCORE_CACHE.clear()
    detectors.DETECTOR_CACHE.clear()
    yield
    detectors._SCORE_CACHE.clear()
    detectors.DETECTOR_CACHE.clear()


# ── ZipPy twin-prelude direction ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_zippy_direction_human_vs_ai():
    """Human corpus must score clearly human; AI corpus clearly AI."""
    pytest.importorskip("zippy", reason="thinkst-zippy not installed")
    det = detectors.ZipPyDetector(str(PRELUDE))
    human = await det.detect(_human_sample())
    ai = await det.detect(_ai_sample())
    assert human.error is None, human.error
    assert ai.error is None, ai.error
    assert human.score < 40, f"human sample scored AI-ish: {human.score} ({human.details})"
    assert ai.score > 60, f"AI sample scored human-ish: {ai.score} ({ai.details})"
    assert ai.score > human.score


@pytest.mark.asyncio
async def test_zippy_short_text_is_neutral():
    pytest.importorskip("zippy", reason="thinkst-zippy not installed")
    det = detectors.ZipPyDetector(str(PRELUDE))
    r = await det.detect("hi")
    assert r.details.get("reason") == "short_text"
    assert r.score == 15.0


# ── Funnel: clear local verdict skips paid tier ──────────────────────────────

@pytest.mark.asyncio
async def test_funnel_skips_paid_on_clear_human(monkeypatch):
    registry = detectors.DetectorRegistry()
    zippy_d = _FakeDetector("zippy", 5.0)            # clearly human
    onnx_d = _FakeDetector("roberta_onnx", 3.0)
    pangram_d = _FakeDetector("pangram", 10.0)
    sapling_d = _FakeDetector("sapling", 10.0)
    registry.register(zippy_d)
    registry.register(onnx_d)
    registry.register(pangram_d)
    registry.register(sapling_d)
    monkeypatch.setattr(detectors, "registry", registry)
    _patch_cfg(monkeypatch, funnel=True)

    avg, results, passed = await detectors.score_text("a" * 300, threshold=80.0)
    assert [r.name for r in results] == ["zippy"], results
    assert pangram_d.calls == 0 and sapling_d.calls == 0, "funnel must skip paid tier"
    assert onnx_d.calls == 0, "tier-1 clear verdict must also skip tier 2"
    assert results[0].details["triage"]["funnel"] == "clear_local_verdict"
    assert results[0].details["triage"]["api_skipped"] == ["pangram", "sapling"]
    assert avg == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_funnel_skips_paid_on_clear_ai(monkeypatch):
    registry = detectors.DetectorRegistry()
    registry.register(_FakeDetector("zippy", 95.0))  # blatant raw AI
    pangram_d = _FakeDetector("pangram", 99.0)
    registry.register(pangram_d)
    monkeypatch.setattr(detectors, "registry", registry)
    _patch_cfg(monkeypatch, funnel=True)

    avg, results, passed = await detectors.score_text("b" * 300, threshold=80.0)
    assert pangram_d.calls == 0
    assert avg == pytest.approx(95.0)
    assert passed is False


@pytest.mark.asyncio
async def test_funnel_escalates_on_ambiguous(monkeypatch):
    registry = detectors.DetectorRegistry()
    zippy_d = _FakeDetector("zippy", 50.0)           # ambiguous
    pangram_d = _FakeDetector("pangram", 88.0)
    registry.register(zippy_d)
    registry.register(pangram_d)
    monkeypatch.setattr(detectors, "registry", registry)
    _patch_cfg(monkeypatch, funnel=True)

    _avg, results, _passed = await detectors.score_text("c" * 300, threshold=80.0)
    assert pangram_d.calls == 1, "ambiguous verdict must escalate to paid tier"
    assert {r.name for r in results} == {"zippy", "pangram"}


@pytest.mark.asyncio
async def test_funnel_uses_onnx_second_stage(monkeypatch):
    """Tier-2 (roberta_onnx) decides when tier-1 alone is not unequivocal."""
    registry = detectors.DetectorRegistry()
    registry.register(_FakeDetector("zippy", 20.0))
    onnx_d = _FakeDetector("roberta_onnx", 5.0)      # fused = 12.5 → human
    pangram_d = _FakeDetector("pangram", 7.0)
    registry.register(onnx_d)
    registry.register(pangram_d)
    monkeypatch.setattr(detectors, "registry", registry)
    _patch_cfg(monkeypatch, funnel=True)

    avg, results, _passed = await detectors.score_text("d" * 300, threshold=80.0)
    assert pangram_d.calls == 0, "fused local verdict is clear — paid tier skipped"
    assert {r.name for r in results} == {"zippy", "roberta_onnx"}
    assert avg == pytest.approx((20.0 + 5.0) / 2.0)


@pytest.mark.asyncio
async def test_funnel_off_runs_paid_regardless(monkeypatch):
    registry = detectors.DetectorRegistry()
    registry.register(_FakeDetector("zippy", 5.0))
    pangram_d = _FakeDetector("pangram", 11.0)
    registry.register(pangram_d)
    monkeypatch.setattr(detectors, "registry", registry)
    _patch_cfg(monkeypatch, funnel=False)

    _avg, results, _passed = await detectors.score_text("e" * 300, threshold=80.0)
    assert pangram_d.calls == 1, "funnel off = legacy behavior (all run)"
    assert {r.name for r in results} == {"zippy", "pangram"}


@pytest.mark.asyncio
async def test_funnel_respects_allow_list(monkeypatch):
    """Operator allow-list (e.g. sapling-only) still filters — after funnel."""
    registry = detectors.DetectorRegistry()
    registry.register(_FakeDetector("zippy", 50.0))
    registry.register(_FakeDetector("pangram", 88.0))
    sapling_d = _FakeDetector("sapling", 70.0)
    registry.register(sapling_d)
    monkeypatch.setattr(detectors, "registry", registry)
    _patch_cfg(monkeypatch, funnel=True)

    _avg, results, _passed = await detectors.score_text("f" * 300, detectors=["sapling"])
    assert sapling_d.calls == 1
    assert {r.name for r in results} == {"zippy", "sapling"}


# ── ONNX detector (guarded on model presence) ───────────────────────────────

@pytest.mark.asyncio
async def test_onnx_direction_when_model_present(monkeypatch):
    model_dir = str(Path(__file__).resolve().parent.parent / "detector_models" / "onnx")
    if not Path(model_dir, "model_int8.onnx").exists():
        pytest.skip("model not fetched (scripts/fetch_detector_model.sh)")
    det = detectors.OnnxAIDetector(model_dir)
    human = await det.detect(_human_sample()[:2500])
    ai = await det.detect(_ai_sample()[:2500])
    assert human.error is None, human.error
    assert ai.error is None, ai.error
    assert human.score < 30, f"human classified AI: {human.score}"
    assert ai.score > 50, f"AI classified human: {ai.score}"
    assert ai.score > human.score


def _patch_cfg(monkeypatch, funnel: bool):
    class _Cfg:
        detector_funnel_enabled = funnel
        detector_zippy_enabled = True
        detector_model_dir = ""
    monkeypatch.setattr(detectors, "_cfg", _Cfg())
