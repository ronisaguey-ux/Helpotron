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
    """Verify functional model tiers, Gemini 3.7 Flash multimodal, and effort tier resolution."""
    from server.user_settings_service import AVAILABLE_MODELS, resolve_effort_tier

    # 1. Models catalog contains functional tiers and Gemini 3.7 Flash
    model_ids = {m["id"] for m in AVAILABLE_MODELS}
    assert "moe_high_throughput" in model_ids
    assert "fast_utility_worker" in model_ids
    assert "instruction_parser" in model_ids
    assert "deep_cognitive_engine" in model_ids
    assert "elite_humanizer_tier" in model_ids
    assert "fast_draft_tier" in model_ids
    assert "gemini_37_flash" in model_ids

    # 2. Low effort score (1 - 350) -> routes to cheap/fast utility models
    low = resolve_effort_tier(200)
    assert low["tier"] == "low_effort"
    assert low["flashcard_model"] == "fast_utility_worker"
    assert low["summary_model"] == "moe_high_throughput"

    # 3. Medium effort score (351 - 750) -> routes to balanced orchestration
    med = resolve_effort_tier(500)
    assert med["tier"] == "medium_effort"
    assert med["draft_model"] == "instruction_parser"

    # 4. High effort score (751 - 1000) -> routes to deep reasoning flagship models
    high = resolve_effort_tier(900)
    assert high["tier"] == "high_effort"
    assert high["draft_model"] == "deep_cognitive_engine"
    assert high["humanizer_model"] == "elite_humanizer_tier"


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


def test_custom_subjects_crud_and_gemini_multimodal():
    """Verify custom subject creation, description persistence, and Gemini 3.7 Flash settings."""
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)

    # 1. Fetch default subjects
    s_resp = client.get("/api/user/custom-subjects")
    assert s_resp.status_code == 200
    subjects = s_resp.json()["subjects"]
    assert any(s["name"] == "Mathematics" for s in subjects)

    # 2. Add custom subject
    new_sub = {
        "name": "Organic Chemistry",
        "description": "Reaction mechanisms, stereochemistry, and lab synthesis write-ups",
        "color": "emerald",
    }
    create_resp = client.post("/api/user/custom-subjects", json=new_sub)
    assert create_resp.status_code == 200
    created = create_resp.json()["subject"]
    assert created["name"] == "Organic Chemistry"
    assert created["is_custom"] is True
    created_id = created["id"]

def test_custom_bubbles_crud_and_data_export_purge():
    """Verify custom bubbles creation/deletion, export-all package, soft-reset, and permanent delete dispatch."""
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)

    # 1. Custom Bubbles CRUD
    b_resp = client.get("/api/user/custom-bubbles")
    assert b_resp.status_code == 200

    new_bubble = {
        "title": "Dr. Miller Lab Reports",
        "description": "Physics experimental raw data, error margin bounds, and lab write-ups",
        "color": "indigo",
        "icon": "🔬",
    }
    c_resp = client.post("/api/user/custom-bubbles", json=new_bubble)
    assert c_resp.status_code == 200
    bubble = c_resp.json()["bubble"]
    assert bubble["title"] == "Dr. Miller Lab Reports"
    bubble_id = bubble["id"]

    del_b = client.delete(f"/api/user/custom-bubbles/{bubble_id}")
    assert del_b.status_code == 200

    # 2. Comprehensive Data Export
    exp_resp = client.get("/api/user/data/export-all")
    assert exp_resp.status_code == 200
    export_data = exp_resp.json()["export"]
    assert "manifest" in export_data
    assert "settings_and_preferences" in export_data
    assert "generated_materials" in export_data
    assert "datalake_contributions" in export_data

    # 3. Soft Reset
    soft_resp = client.post("/api/user/data/soft-reset")
    assert soft_resp.status_code == 200
    assert "reset successfully" in soft_resp.json()["message"]

    # 4. Permanent Delete Request with invalid confirmation
    bad_purge = client.post(
        "/api/user/data/permanent-delete-request",
        json={"confirmation_text": "WRONG_TEXT", "notify_email": "test@domain.edu"},
    )
    assert bad_purge.status_code == 400

    # 5. Permanent Delete Request with exact confirmation
    good_purge = client.post(
        "/api/user/data/permanent-delete-request",
        json={
            "confirmation_text": "DELETE PERMANENTLY",
            "notify_email": "student@university.edu",
            "notify_sms": "+15550192834",
            "reason": "Graduated and requesting complete GDPR wipe",
        },
    )
    assert good_purge.status_code == 200
    p_data = good_purge.json()
    assert "3+ business days" in p_data["message"]
    assert p_data["purge_record"]["status"] == "pending_purge"

    # 6. Assignment History
    h_resp = client.get("/api/user/assignment-history")
    assert h_resp.status_code == 200
    assert "history" in h_resp.json()


def test_credits_leaderboard_and_custom_alias():
    """Verify credits used leaderboard ranking, anonymity, and custom alias updates."""
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)

    # 1. Fetch default leaderboard
    l_resp = client.get("/api/user/leaderboard")
    assert l_resp.status_code == 200
    data = l_resp.json()
    assert "leaderboard" in data
    assert len(data["leaderboard"]) >= 3
    # Check that entries have alias and credits_used
    first = data["leaderboard"][0]
    assert "alias" in first
    assert "credits_used" in first
    assert "rank" in first
    assert first["rank"] == 1

    # 2. Update custom leaderboard alias
    update_resp = client.post(
        "/api/user/leaderboard/alias",
        json={"alias": "ApexScholar_777", "opt_in": True},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["leaderboard_alias"] == "ApexScholar_777"
    assert update_resp.json()["leaderboard_opt_in"] is True

    # 3. Verify updated alias reflects in leaderboard
    l_resp2 = client.get("/api/user/leaderboard")
    assert l_resp2.status_code == 200
    assert l_resp2.json()["user_stats"]["current_alias"] == "ApexScholar_777"


def test_datalake_microcredits_pending_policy():
    """Verify microcredits submissions receive pending_utilization status and honest 2+ business days notice."""
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)

    sub_payload = {
        "data_type": "teacher_quirk",
        "title": "Dr. Vance Rubric Guidelines",
        "data_content": "Dr. Vance automatically deducts 5% for missing APA in-text citations and awards 10 bonus points for primary source quotes.",
        "user_id": "RoniDev",
    }

    resp = client.post("/api/datalake/microcredits/submit", json=sub_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    submission = data["submission"]
    assert submission["status"] in ("pending_review", "pending_utilization")
    assert "2+ business days" in submission["utilization_notice"]
    assert submission["credits_awarded"] >= 5


def test_message_admin_workflow():
    """Verify sending direct messages to Admin, retrieving user message history, and admin replies."""
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)

    # 1. Student sends message to Admin
    msg_payload = {
        "subject": "Universal Extension on Custom School Portal",
        "category": "feature_request",
        "message": "Can you check why our university portal table isn't auto-scraped? Link attached in syllabus.",
    }
    send_resp = client.post("/api/user/message-admin", json=msg_payload)
    assert send_resp.status_code == 200
    res_data = send_resp.json()
    assert res_data["status"] == "success"
    msg_id = res_data["message_id"]
    assert "delivered directly to Admin" in res_data["message"]

    # 2. Student views their message history
    my_msgs_resp = client.get("/api/user/my-admin-messages")
    assert my_msgs_resp.status_code == 200
    my_msgs = my_msgs_resp.json()["messages"]
    assert any(m["id"] == msg_id for m in my_msgs)

    # 3. Admin retrieves all incoming inquiries
    admin_msgs_resp = client.get("/api/admin/messages")
    assert admin_msgs_resp.status_code == 200
    admin_msgs = admin_msgs_resp.json()["messages"]
    assert any(m["id"] == msg_id for m in admin_msgs)

    # 4. Admin replies to student inquiry
    reply_resp = client.post(
        f"/api/admin/messages/{msg_id}/reply",
        json={"reply": "Investigating the portal DOM structure now. Universal extension subagent will support it in the next push."},
    )
    assert reply_resp.status_code == 200
    assert reply_resp.json()["status"] == "replied"

    # 5. Student sees admin reply
    my_msgs_resp2 = client.get("/api/user/my-admin-messages")
    assert my_msgs_resp2.status_code == 200
    updated_msg = next(m for m in my_msgs_resp2.json()["messages"] if m["id"] == msg_id)
    assert updated_msg["status"] == "replied"
    assert "Universal extension subagent" in updated_msg["admin_reply"]





