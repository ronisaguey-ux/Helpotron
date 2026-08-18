"""Unit tests for Cost Tracking, Universal Assignment Dump, and Model Tiering."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, User, Assignment, UniversalDumpItem, ApiUsageLog
from server.cost_tracking import CostEngine, cost_engine
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
    # Base calculation for Gemini 3.1 Flash-Lite (1M input = $0.50)
    cost = CostEngine.calculate_base_cost(
        tool_or_model="gemini-3.1-flash-lite",
        input_tokens=10000,
        output_tokens=2000,
    )
    assert cost > 0.001
    assert isinstance(cost, float)

    # Audio transcription rate test (60 seconds)
    audio_cost = CostEngine.calculate_base_cost(
        tool_or_model="whisper",
        duration_seconds=60.0,
    )
    assert round(audio_cost, 4) == 0.0060


def test_user_token_multiplier_and_logging(db_session):
    user = User(public_id="TesterRoni", plan="pro", token_cost_multiplier=1.5)
    db_session.add(user)
    db_session.commit()

    entry = CostEngine.log_api_call(
        db=db_session,
        public_id="TesterRoni",
        tool_or_model="gemini-3.1-flash-lite",
        category="transcription",
        input_tokens=5000,
        output_tokens=1000,
    )
    assert entry.user_multiplier == 1.5
    assert entry.charged_cost_usd > entry.base_cost_usd
    assert abs(entry.charged_cost_usd - round(entry.base_cost_usd * 1.5, 6)) < 0.00001


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
