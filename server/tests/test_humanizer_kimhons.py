"""Unit tests for Helpotron Humanizer Stack, Kimhons 38-pattern integration,
Jalaalrd Anti-AI-Slop directives, and Deterministic Python Math Execution.
"""
import pytest
from server.humanizer import (
    KimhonsHumanizeEngine,
    AIHumanizerPipeline,
    FUNCTION_WORDS,
)
from server.default_styles import SELECTED_BOOK_STYLES, get_default_style
from server.math_executor import (
    run_python_math_bash,
    solve_deterministic_math,
    sanitize_math_hallucinations_in_text,
)


def test_kimhons_38_patterns_audit():
    """Verify 38 AI cliché patterns are detected and scored."""
    ai_heavy_text = (
        "This pivotal discovery stands as a testament to human innovation. "
        "Furthermore, by delving into the intricate landscape of thermodynamic systems, "
        "researchers were highlighting new avenues, fostering collaboration, and cultivating growth. "
        "It is not just a tool, but also a beacon of hope for future generations. "
        "In order to navigate these challenges, experts believe that data-driven approaches will prevail."
    )
    audit = KimhonsHumanizeEngine.audit_38_patterns(ai_heavy_text)
    assert audit["cliche_score"] > 25.0
    assert audit["total_hits"] >= 3
    pattern_names = [f["name"] for f in audit["findings"]]
    assert "significance_inflation" in pattern_names or "overused_ai_vocabulary" in pattern_names


def test_jalaalrd_anti_slop_openers_and_parataxis():
    """Verify Jalaalrd banned opener detection and anti-parataxis checks."""
    opener_slop = "In today's fast-paced digital world, technology is evolving rapidly."
    cleaned = KimhonsHumanizeEngine.sanitize_obvious_slop(opener_slop)
    assert "In today's" not in cleaned

    # Test parataxis detection (chain of short 3-5 word sentences)
    parataxis_text = "The cat ran. The dog barked. The bird flew. The sun shone."
    metrics = KimhonsHumanizeEngine.calculate_burstiness_metrics(parataxis_text)
    assert metrics["parataxis_detected"] is True


def test_burstiness_and_perplexity_metrics():
    """Verify sentence length CV, TTR lexical diversity, and function word ratio."""
    sample_text = (
        "Call me Ishmael. Some years ago, having little or no money in my purse, and nothing "
        "particular to interest me on shore, I thought I would sail about a little and see the watery "
        "part of the world. It is a way I have of driving off the spleen. Whenever I find myself growing "
        "grim about the mouth, I account it high time to get to sea as soon as I can."
    )
    metrics = KimhonsHumanizeEngine.calculate_burstiness_metrics(sample_text)
    assert metrics["sentence_count"] >= 3
    assert metrics["sentence_cv"] > 0.30
    assert 0.30 <= metrics["lexical_diversity_ttr"] <= 0.90
    assert metrics["function_word_ratio"] > 0.20


def test_sanitize_obvious_slop():
    """Verify deterministic removal of em-dashes, non-header bolding, emojis, and AI conversational markers."""
    raw_text = "In this essay, I will explore the topic 🚀. The **economic** model — which was proposed in 2020 — serves as a testament to progress."
    cleaned = KimhonsHumanizeEngine.sanitize_obvious_slop(raw_text)
    assert "🚀" not in cleaned
    assert "—" not in cleaned
    assert "In this essay, I will explore" not in cleaned
    assert "**economic**" not in cleaned
    assert "economic" in cleaned


def test_resolve_style_reference():
    """Verify style resolution from custom text, selected book, or academic grade level."""
    # 1. Custom text sample
    custom_sample = "This is my unique collegiate research sample written with distinct phrasing and empirical citations."
    ref, source = AIHumanizerPipeline.resolve_style_reference(style_sample=custom_sample)
    assert ref == custom_sample
    assert "Custom Style" in source

    # 2. Selected classic literature book
    ref_book, source_book = AIHumanizerPipeline.resolve_style_reference(book_style_id="book_great_gatsby")
    assert "vulnerable years" in ref_book
    assert "Great Gatsby" in source_book

    # 3. Selected classic 1984
    ref_1984, source_1984 = AIHumanizerPipeline.resolve_style_reference(book_style_id="book_1984")
    assert "bright cold day" in ref_1984
    assert "1984" in source_1984

    # 4. Default grade level
    ref_grade, source_grade = AIHumanizerPipeline.resolve_style_reference(reading_level="11th_grade")
    assert len(ref_grade) > 20
    assert "Academic Benchmark" in source_grade


def test_deterministic_python_math_execution():
    """Verify deterministic math execution via Python bash subcommands."""
    # 1. Direct Python bash command
    ok, out = run_python_math_bash("import math; print(math.sqrt(625) * 4)")
    assert ok is True
    assert out.strip() == "100.0"

    # 2. Symbolic & Algebraic solving
    res_eq = solve_deterministic_math("2*x + 10 = 50")
    assert res_eq["success"] is True
    assert "[20]" in str(res_eq["primary_result"])

    # 3. Calculus / Derivatives
    res_diff = solve_deterministic_math("diff(x**3 + 5*x, x)")
    assert res_diff["success"] is True
    assert "3*x**2 + 5" in str(res_diff["primary_result"])

    # 4. Correcting math arithmetic in text
    flawed_text = "The laboratory tested 25 samples across 14 batches, yielding 25 * 14 = 300 total observations."
    corrected = sanitize_math_hallucinations_in_text(flawed_text)
    assert "25 * 14 = 350" in corrected


@pytest.mark.anyio
async def test_humanizer_pipeline_execution():
    """Verify full end-to-end humanizer loop executes and yields detector breakdown."""
    pipeline = AIHumanizerPipeline(human_score_threshold=80.0, max_passes=2)
    draft = "The Industrial Revolution transformed manufacturing processes in Great Britain during the late eighteenth century."

    humanized, eval_meta = await pipeline.humanize_loop(
        draft_text=draft,
        book_style_id="book_pride_and_prejudice",
        reading_level="10th_grade",
        effort_level=500,
    )
    assert isinstance(humanized, str)
    assert len(humanized) > 10
    assert "human_confidence_score" in eval_meta
    assert "detector_details" in eval_meta
    assert "cliche_score" in eval_meta
    assert "target_style_source" in eval_meta


# ─── HIP toggle gate (owner 2026-09-17) ──────────────────────────────────────
# HIP is the base-model humanizer. It must run ONLY when the user turned the
# humanizer setting ON — never automatically on every LLM output.

@pytest.mark.anyio
async def test_hip_does_not_run_without_settings(monkeypatch):
    """No settings passed = the caller cannot prove the toggle is on, so HIP
    must stay out and the previous behaviour applies."""
    called = []

    async def fake_hip(text, rounds=None):
        called.append(text)
        return "hip output " * 10

    monkeypatch.setattr("server.hip_humanizer.hip_configured", lambda: True)
    monkeypatch.setattr("server.hip_humanizer.hip_humanize", fake_hip)

    pipeline = AIHumanizerPipeline(human_score_threshold=80.0, max_passes=2)
    await pipeline.humanize_loop(
        draft_text="The Industrial Revolution transformed manufacturing processes in Great Britain.",
        effort_level=500,
    )
    assert called == [], "HIP ran with no settings — it must not"


@pytest.mark.anyio
async def test_hip_does_not_run_when_humanizer_off(monkeypatch):
    """The toggle is OFF: HIP stays out even though the endpoint is configured."""
    called = []

    async def fake_hip(text, rounds=None):
        called.append(text)
        return "hip output " * 10

    monkeypatch.setattr("server.hip_humanizer.hip_configured", lambda: True)
    monkeypatch.setattr("server.hip_humanizer.hip_humanize", fake_hip)

    pipeline = AIHumanizerPipeline(human_score_threshold=80.0, max_passes=2)
    await pipeline.humanize_loop(
        draft_text="The Industrial Revolution transformed manufacturing processes in Great Britain.",
        effort_level=500,
        settings={"ai": {"humanizer": "off"}},
    )
    assert called == [], "HIP ran while the humanizer toggle was off"


@pytest.mark.anyio
async def test_hip_runs_when_humanizer_on(monkeypatch):
    """The toggle is ON: HIP is the engine that does the rewrite."""
    called = []

    async def fake_hip(text, rounds=None):
        called.append(text)
        return "hip rewrote this completely " * 8

    monkeypatch.setattr("server.hip_humanizer.hip_configured", lambda: True)
    monkeypatch.setattr("server.hip_humanizer.hip_humanize", fake_hip)

    pipeline = AIHumanizerPipeline(human_score_threshold=80.0, max_passes=2)
    humanized, _meta = await pipeline.humanize_loop(
        draft_text="The Industrial Revolution transformed manufacturing processes in Great Britain during the late eighteenth century. Furthermore, it reshaped society.",
        effort_level=500,
        settings={"ai": {"humanizer": "on"}},
    )
    assert called, "HIP did not run while the humanizer toggle was on"
    assert humanized.startswith("hip rewrote this")
