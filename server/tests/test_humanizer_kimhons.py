"""Unit tests for Helpotron Humanizer Stack & Kimhons 38-pattern integration."""
import pytest
from server.humanizer import (
    KimhonsHumanizeEngine,
    AIHumanizerPipeline,
    PATTERNS_38,
    FUNCTION_WORDS,
)
from server.default_styles import SELECTED_BOOK_STYLES, get_default_style


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
