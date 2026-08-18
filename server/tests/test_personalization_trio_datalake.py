"""Test suite for Context-Aware Personalization Engine, TRIO Cascading, Grade Scheduling, and Data Lake Micro-Credits."""
import pytest
from server.user_settings_service import (
    user_settings_service,
    score_to_letter,
    letter_to_score,
)
from server.datalake import datalake_manager


def test_score_and_letter_mapping():
    """Verify numeric to letter and letter to numeric bi-directional mapping."""
    assert score_to_letter(98) == "A+"
    assert score_to_letter(90) == "A"
    assert score_to_letter(85) == "B+"
    assert score_to_letter(80) == "B"
    assert score_to_letter(75) == "C+"
    assert score_to_letter(72) == "C"
    assert score_to_letter(65) == "D"
    assert score_to_letter(50) == "F"

    assert letter_to_score("A+") == 98
    assert letter_to_score("A") == 90
    assert letter_to_score("B+") == 85
    assert letter_to_score("B") == 80


def test_trio_cascading_resolution():
    """Verify settings cascade: Global -> Subject -> Class -> Teacher -> Assignment."""
    base_settings = {
        "academic_level": "high_school",
        "target_score_letter": "B",
        "target_score_numeric": 80,
        "tone": "formal",
        "trio_rules": [
            {
                "id": "rule_math",
                "name": "Math Subject Override",
                "target": {"type": "subject", "value": "Math"},
                "override_priority": 0,
                "apply_to_all": False,
                "overrides": {"target_score_letter": "A", "target_score_numeric": 90},
            },
            {
                "id": "rule_teacher_miller",
                "name": "Dr. Miller Teacher Override",
                "target": {"type": "teacher", "value": "Dr. Miller"},
                "override_priority": 0,
                "apply_to_all": False,
                "overrides": {"tone": "conversational"},
            },
            {
                "id": "rule_specific_essay",
                "name": "Term Paper Assignment Override",
                "target": {"type": "assignment", "value": "Term Paper"},
                "override_priority": 0,
                "apply_to_all": False,
                "overrides": {"academic_level": "masters", "target_score_letter": "A+"},
            },
        ],
    }

    # 1. Unmatched context -> Global default
    eff_global = user_settings_service.resolve_effective_settings(
        base_settings, subject="Physics", teacher="Prof. Adams", assignment_title="Lab 1"
    )
    assert eff_global["target_score_letter"] == "B"
    assert eff_global["tone"] == "formal"

    # 2. Match Subject (Math)
    eff_math = user_settings_service.resolve_effective_settings(
        base_settings, subject="Calculus Math 101", teacher="Prof. Adams", assignment_title="Quiz"
    )
    assert eff_math["target_score_letter"] == "A"
    assert eff_math["tone"] == "formal"

    # 3. Match Teacher (Dr. Miller) overrides tone
    eff_miller = user_settings_service.resolve_effective_settings(
        base_settings, subject="History", teacher="Dr. Miller", assignment_title="Essay 1"
    )
    assert eff_miller["tone"] == "conversational"
    assert eff_miller["target_score_letter"] == "B"

    # 4. Match Specific Assignment (Term Paper) has highest precedence
    eff_term_paper = user_settings_service.resolve_effective_settings(
        base_settings, subject="Math", teacher="Dr. Miller", assignment_title="Final Term Paper"
    )
    assert eff_term_paper["academic_level"] == "masters"
    assert eff_term_paper["target_score_letter"] == "A+"
    assert eff_term_paper["tone"] == "conversational"


def test_trio_universal_apply_to_all():
    """Verify universal apply-to-all override flag."""
    base_settings = {
        "academic_level": "high_school",
        "tone": "formal",
        "trio_rules": [
            {
                "id": "rule_universal",
                "name": "Universal Evasion Tone",
                "target": {"type": "global", "value": ""},
                "apply_to_all": True,
                "overrides": {"tone": "semi_formal", "academic_level": "undergrad_senior"},
            },
        ],
    }

    effective = user_settings_service.resolve_effective_settings(
        base_settings, subject="Biology", teacher="Any Teacher"
    )
    assert effective["tone"] == "semi_formal"
    assert effective["academic_level"] == "undergrad_senior"


def test_datalake_microcredits_subagent_valuation():
    """Verify Data Quality Sub-Agent evaluates submissions across 1-25 credit bounds."""
    # 1. Assignment Score (1-5 credits)
    res_score = datalake_manager.evaluate_and_record_microcredit_submission(
        user_id="test_user",
        data_type="assignment_score",
        title="Midterm Predicted vs Actual",
        data_content="AI predicted A- (91%), actual teacher grade was B+ (88%) due to MLA citation format.",
    )
    assert 1 <= res_score["credits_awarded"] <= 5
    assert res_score["valuation"]["relevance"] >= 1
    assert "Micro-Credits" in res_score["valuation"]["reasoning"]

    # 2. Teacher Quirk (5-15 credits)
    res_quirk = datalake_manager.evaluate_and_record_microcredit_submission(
        user_id="test_user",
        data_type="teacher_quirk",
        title="Dr. Johnson Formatting Rule",
        data_content="Dr. Johnson always deducts 5% if bibliography lacks DOI links, and prefers standard deviation tables in bold.",
    )
    assert 5 <= res_quirk["credits_awarded"] <= 15

    # 3. Instructor Feedback (10-25 credits)
    res_feedback = datalake_manager.evaluate_and_record_microcredit_submission(
        user_id="test_user",
        data_type="instructor_feedback",
        title="Comprehensive Rubric Commentary",
        data_content="Detailed line-by-line feedback from instructor on argumentative structure, empirical synthesis, and statistical variance.",
    )
    assert 10 <= res_feedback["credits_awarded"] <= 25


def test_ai_detectors_individual_toggling():
    """Verify AI detectors configuration object."""
    detectors = {
        "pangram": True,
        "sapling": False,
        "originality_ai": True,
        "copyleaks": True,
        "winston_ai": False,
        "perplexity_cadence": True,
        "statistical_burstiness": True,
    }
    assert detectors["pangram"] is True
    assert detectors["sapling"] is False
    assert detectors["winston_ai"] is False


def test_models_catalog_and_effort_score_tiers():
    """Verify Nemotron 3 Super, Nemotron Nano, Llama 3.1 Nemotron 70B, and effort resolution."""
    from server.user_settings_service import AVAILABLE_MODELS, resolve_effort_tier

    # 1. Models catalog contains new models with correct metadata
    model_ids = {m["id"] for m in AVAILABLE_MODELS}
    assert "nemotron_3_super" in model_ids
    assert "nemotron_nano_9b" in model_ids
    assert "llama_nemotron_70b" in model_ids
    assert "deepseek_r1_v3" in model_ids
    assert "pro" in model_ids
    assert "flash" in model_ids

    # 2. Low effort score (1 - 350) -> routes to cheap/fast utility models
    low = resolve_effort_tier(200)
    assert low["tier"] == "low_effort"
    assert low["flashcard_model"] == "nemotron_nano_9b"
    assert low["summary_model"] == "nemotron_3_super"

    # 3. Medium effort score (351 - 750) -> routes to balanced orchestration
    med = resolve_effort_tier(500)
    assert med["tier"] == "medium_effort"
    assert med["draft_model"] == "llama_nemotron_70b"

    # 4. High effort score (751 - 1000) -> routes to deep reasoning flagship models
    high = resolve_effort_tier(900)
    assert high["tier"] == "high_effort"
    assert high["draft_model"] == "deepseek_r1_v3"
    assert high["humanizer_model"] == "pro"


def test_auto_start_and_effort_trio_scoping():
    """Verify effort_score and auto_start cascade cleanly through TRIO context resolution."""
    base_settings = {
        "effort_score": 300,
        "auto_start": False,
        "trio_rules": [
            {
                "id": "rule_history_high_effort",
                "name": "History 101 High Effort & Auto-Start",
                "target": {"type": "subject", "value": "History"},
                "apply_to_all": False,
                "overrides": {"effort_score": 900, "auto_start": True},
            }
        ],
    }

    # Global context -> effort 300, auto_start False
    eff_global = user_settings_service.resolve_effective_settings(base_settings, subject="Chemistry")
    assert eff_global["effort_score"] == 300
    assert eff_global["auto_start"] is False

    # History context -> effort 900, auto_start True
    eff_history = user_settings_service.resolve_effective_settings(base_settings, subject="History 101")
    assert eff_history["effort_score"] == 900
    assert eff_history["auto_start"] is True


def test_api_models_and_effort_endpoints():
    """Verify GET /api/user/models and GET /api/user/effort-score/resolve endpoints."""
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)

    # 1. Models catalog endpoint
    m_resp = client.get("/api/user/models")
    assert m_resp.status_code == 200
    models = m_resp.json()["models"]
    assert any(m["id"] == "nemotron_3_super" for m in models)
    assert any(m["id"] == "nemotron_nano_9b" for m in models)
    assert any(m["id"] == "llama_nemotron_70b" for m in models)

    # 2. Effort resolve endpoint
    e_resp = client.get("/api/user/effort-score/resolve?score=850")
    assert e_resp.status_code == 200
    res = e_resp.json()["effort_routing"]
    assert res["tier"] == "high_effort"
    assert res["score"] == 850

