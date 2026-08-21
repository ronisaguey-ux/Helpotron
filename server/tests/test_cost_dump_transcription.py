"""Unit tests for Cost Tracking, Universal Assignment Dump, and Model Tiering."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, User, Assignment, UniversalDumpItem, ApiUsageLog
from server.cost_tracking import CostEngine, cost_engine, log_api_cost
from server.assignment_dump import AssignmentDumpManager, assignment_dump_manager
from server.model_tiering import ModelTieringEngine, model_tiering_engine


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_cost_engine_calculation():
    # deepseek/deepseek-chat: $0.0001 per 1K input tokens, $0.0002 per 1K output
    cost = CostEngine().log_cost("u1", "/api/x", "deepseek/deepseek-chat", 1000, 500)
    assert isinstance(cost, float)
    assert abs(cost - (0.0001 + 0.0002 * 0.5)) < 1e-9

    # Unknown models fall back to default rates ($0.001 input, $0.002 output)
    fallback = CostEngine().log_cost("u1", "/api/x", "unknown-model", 1000, 1000)
    assert abs(fallback - (0.001 + 0.002)) < 1e-9


def test_user_token_multiplier_and_logging(db_session):
    user = User(public_id="TesterRoni", plan="pro", token_cost_multiplier=1.5)
    db_session.add(user)
    db_session.commit()

    # Engine singleton and module-level helper produce identical math
    direct = cost_engine.log_cost(
        "TesterRoni", "/api/transcribe", "deepseek/deepseek-chat", 5000, 1000)
    helper = log_api_cost(
        "TesterRoni", "/api/transcribe", "deepseek/deepseek-chat", 5000, 1000)
    assert abs(direct - helper) < 1e-9
    assert helper > 0


def test_model_tiering_effort_levels():
    # Low effort (1-4) -> Gemini 3.1 Flash-Lite
    model_low = ModelTieringEngine.resolve_model_for_task("draft", effort_level=3)
    assert model_low == "gemini-3.1-flash-lite"

    # Medium effort (5-7) -> Balanced (Flash-Lite for draft, 3.7 for humanization)
    model_med_draft = ModelTieringEngine.resolve_model_for_task("draft", effort_level=6)
    assert model_med_draft == "gemini-3.1-flash-lite"

    model_med_humanize = ModelTieringEngine.resolve_model_for_task("humanization", effort_level=6)
    assert model_med_humanize == "gemini-3.7-flash"

    # High effort (8-10) -> Gemini 3.7 Flash
    model_high = ModelTieringEngine.resolve_model_for_task("draft", effort_level=9)
    assert model_high == "gemini-3.7-flash"


def test_assignment_dump_nlp_matching(db_session):
    user = User(public_id="StudentA", plan="basic")
    db_session.add(user)
    db_session.commit()

    a1 = Assignment(
        user_id=user.id,
        title="Calculus Differential Equations Problem Set 4",
        prompt="Solve differential equations and harmonic oscillators",
        status="active",
    )
    a2 = Assignment(
        user_id=user.id,
        title="World History Essay on Industrial Revolution",
        prompt="Analyze steam engine impact on urban labor",
        status="active",
    )
    db_session.add_all([a1, a2])
    db_session.commit()

    # Dumped text about Calculus
    calc_lecture_text = "Today we discuss differential equations and harmonic oscillator solutions in Calculus Problem Set 4."
    matched_id, conf, reason = AssignmentDumpManager.match_assignment_nlp(calc_lecture_text, [a1, a2])
    assert matched_id == a1.id
    assert conf >= 0.60
    assert "Calculus" in reason

    # Dumped text about History
    hist_text = "The Industrial Revolution urban labor transformed British manufacturing and steam engines."
    matched_id_h, conf_h, _ = AssignmentDumpManager.match_assignment_nlp(hist_text, [a1, a2])
    assert matched_id_h == a2.id
    assert conf_h >= 0.50


def test_file_category_detection():
    assert AssignmentDumpManager.detect_file_category("syllabus.pdf") == "document"
    assert AssignmentDumpManager.detect_file_category("lecture.mp3") == "audio"
    assert AssignmentDumpManager.detect_file_category("recording.m4a") == "audio"
    assert AssignmentDumpManager.detect_file_category("board_photo.png") == "image"
    assert AssignmentDumpManager.detect_file_category("screen_rec.mp4") == "video"
    assert AssignmentDumpManager.detect_file_category("quarterly_report.pptx") == "presentation"
    assert AssignmentDumpManager.detect_file_category("deck.gslides") == "presentation"


def test_presentation_pure_gemini_split():
    # PowerPoint task detection
    is_pres = ModelTieringEngine.is_presentation_task(
        prompt="Create a 10-slide PowerPoint presentation on Climate Change",
        file_name="deck.pptx",
    )
    assert is_pres is True

    # Pure-Gemini model split resolution (e.g. 70% Flash-Lite / 30% 3.7 Flash)
    res = ModelTieringEngine.resolve_presentation_gemini_models(flash_lite_percent=70)
    assert res["engine_mode"] == "pure_gemini"
    assert "nemotron-3-super" in res["bypassed_subagents"]
    assert "deepseek-v4-flash" in res["bypassed_subagents"]
    assert res["active_models"]["gemini-3.1-flash-lite"]["percentage"] == 70
    assert res["active_models"]["gemini-3.7-flash"]["percentage"] == 30


def test_fake_writing_history_generation():
    text = "The Industrial Revolution catalyzed unprecedented urban migration and transformed European manufacturing infrastructure."
    history = ModelTieringEngine.generate_fake_writing_history(
        content=text,
        wpm=60,
        version_count=5,
        burstiness="natural_academic",
    )
    assert history["enabled"] is True
    assert history["audit_trail_ready"] is True
    assert history["simulated_versions_count"] == 5
    assert len(history["versions"]) == 5
    assert history["versions"][0]["version_number"] == 1
    assert history["versions"][-1]["version_number"] == 5

