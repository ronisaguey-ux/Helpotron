import pytest
from fastapi.testclient import TestClient

from server.database import init_db, SessionLocal, User, Assignment
from server.main import app
from server.overlord_agent import permission_engine, overlord_agent

init_db()
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_overlord_data():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "test_overlord_user").first()
        if not user:
            user = User(
                public_id="test_overlord_user",
                plan="pro",
                credits=50.0,
                settings={
                    "operation_mode": "auto",
                    "auto_approved_actions": ["humanize", "analyze_rubric"],
                },
            )
            db.add(user)
        else:
            user.settings = {
                "operation_mode": "auto",
                "auto_approved_actions": ["humanize", "analyze_rubric"],
            }
        db.commit()

        # Add mock assignment
        assign = db.query(Assignment).filter(Assignment.user_id == user.id).first()
        if not assign:
            assign = Assignment(
                user_id=user.id,
                title="Comparative Analysis of Neural Semantic Representations",
                prompt="Write a 1500-word research essay evaluating deep neural models.",
                due_date="2026-08-25",
                status="in_progress",
                progress={
                    "subject": "Computer Science & AI",
                    "course_code": "CS-482",
                    "teacher_name": "Dr. Aris",
                    "estimated_time": "1.5 hours",
                    "rubric": "Thesis (25%), Analysis (25%), Structure (25%), Sources (25%)",
                    "attached_files": ["lecture_notes.pdf", "dataset_spec.csv"],
                },
            )
            db.add(assign)
            db.commit()
    finally:
        db.close()


def test_permission_engine_modes():
    # 1. Manual Mode: All actions require approval
    settings_manual = {"operation_mode": "manual", "auto_approved_actions": []}
    approved, _ = permission_engine.evaluate_action_permission(settings_manual, "draft_section")
    assert approved is False

    # 2. YOLO Mode: All actions auto-approved
    settings_yolo = {"operation_mode": "yolo", "auto_approved_actions": []}
    approved, reason = permission_engine.evaluate_action_permission(settings_yolo, "submit_assignment")
    assert approved is True
    assert "YOLO" in reason

    # 3. Auto Mode: Routine is approved, Critical is rejected
    settings_auto = {"operation_mode": "auto", "auto_approved_actions": []}
    app_routine, _ = permission_engine.evaluate_action_permission(settings_auto, "draft_section")
    assert app_routine is True

    app_critical, _ = permission_engine.evaluate_action_permission(settings_auto, "submit_assignment")
    assert app_critical is False

    # 4. Auto-Approved persistent rules override
    settings_rules = {"operation_mode": "manual", "auto_approved_actions": ["humanize"]}
    app_rule, _ = permission_engine.evaluate_action_permission(settings_rules, "humanize_text")
    assert app_rule is True


def test_assignment_cards_and_full_view():
    headers = {"X-Public-ID": "test_overlord_user"}
    # 1. Get Cards
    cards_resp = client.get("/api/assignments/cards", headers=headers)
    assert cards_resp.status_code == 200
    cards = cards_resp.json()["cards"]
    assert len(cards) >= 1
    c = cards[0]
    assert "name" in c
    assert "subject" in c
    assert "class_code" in c
    assert "teacher_name" in c
    assert "estimated_time" in c
    assert "status" in c

    # 2. Get Full View
    assign_id = c["id"]
    fv_resp = client.get(f"/api/assignment/{assign_id}/full-view", headers=headers)
    assert fv_resp.status_code == 200
    full_data = fv_resp.json()
    assert "assignment" in full_data
    assert "rubric" in full_data["assignment"]
    assert "attached_files" in full_data["assignment"]
    assert "chat_history" in full_data


def test_overlord_chat_and_permissions_workflow():
    headers = {"X-Public-ID": "test_overlord_user"}
    # Get user assignment
    cards_resp = client.get("/api/assignments/cards", headers=headers)
    assign_id = cards_resp.json()["cards"][0]["id"]

    # 1. Send chat message (routine task in Auto mode -> executed immediately)
    chat_resp = client.post(
        "/api/agent/chat",
        json={
            "assignment_id": assign_id,
            "text": "Please analyze the rubric and draft section.",
        },
        headers=headers,
    )
    assert chat_resp.status_code == 200
    assert chat_resp.json()["status"] == "success"

    # 2. Send critical task in Auto mode (requires permission)
    crit_resp = client.post(
        "/api/agent/chat",
        json={
            "assignment_id": assign_id,
            "text": "Submit assignment immediately to professor.",
        },
        headers=headers,
    )
    assert crit_resp.status_code == 200
    assert crit_resp.json()["status"] == "permission_required"
    perm_id = crit_resp.json()["permission_request"]["id"]

    # 3. Fetch pending permissions
    pending_resp = client.get("/api/agent/permissions/pending", headers=headers)
    assert pending_resp.status_code == 200
    assert pending_resp.json()["count"] >= 1

    # 4. Approve permission with comment
    appr_resp = client.post(
        "/api/agent/permission/respond",
        json={"permission_id": perm_id, "decision": "approve", "comment": "Ensure citations format"},
        headers=headers,
    )
    assert appr_resp.status_code == 200
    assert appr_resp.json()["status"] == "success"
    assert appr_resp.json()["comment"] == "Ensure citations format"


def test_permission_rejection_and_write_something_else():
    headers = {"X-Public-ID": "test_overlord_user"}
    cards_resp = client.get("/api/assignments/cards", headers=headers)
    assign_id = cards_resp.json()["cards"][0]["id"]

    # 1. Trigger permission request
    crit_resp = client.post(
        "/api/agent/chat",
        json={"assignment_id": assign_id, "text": "Submit assignment."},
        headers=headers,
    )
    perm_id1 = crit_resp.json()["permission_request"]["id"]

    # 2. Reject with reason comment
    rej_resp = client.post(
        "/api/agent/permission/respond",
        json={"permission_id": perm_id1, "decision": "reject", "comment": "Need to add bibliography first"},
        headers=headers,
    )
    assert rej_resp.status_code == 200
    assert rej_resp.json()["status"] == "rejected"
    assert rej_resp.json()["note"] == "Need to add bibliography first"

    # 3. Trigger second permission request
    crit_resp2 = client.post(
        "/api/agent/chat",
        json={"assignment_id": assign_id, "text": "Submit assignment."},
        headers=headers,
    )
    perm_id2 = crit_resp2.json()["permission_request"]["id"]

    # 4. Write Something Else (Neutral cancel & new instruction)
    wse_resp = client.post(
        "/api/agent/permission/respond",
        json={"permission_id": perm_id2, "decision": "write_something_else", "replacement_text": "Please summarize key findings first"},
        headers=headers,
    )
    assert wse_resp.status_code == 200
    assert wse_resp.json()["status"] == "cancelled"
    assert wse_resp.json()["message"] == "Please summarize key findings first"



def test_auto_approved_rules_management():
    headers = {"X-Public-ID": "test_overlord_user"}
    # 1. Add custom rule
    add_resp = client.post(
        "/api/agent/permissions/rules",
        json={"rule": "check_citations"},
        headers=headers,
    )
    assert add_resp.status_code == 200
    assert "check_citations" in add_resp.json()["rules"]

    # 2. List rules
    list_resp = client.get("/api/agent/permissions/rules", headers=headers)
    assert list_resp.status_code == 200
    assert "check_citations" in list_resp.json()["rules"]

    # 3. Delete rule
    del_resp = client.delete("/api/agent/permissions/rules/check_citations", headers=headers)
    assert del_resp.status_code == 200
    assert "check_citations" not in del_resp.json()["rules"]


def test_operation_mode_toggle_and_yolo_warning():
    headers = {"X-Public-ID": "test_overlord_user"}
    # 1. Get mode
    m_resp = client.get("/api/agent/mode", headers=headers)
    assert m_resp.status_code == 200
    assert "yolo_warning" in m_resp.json()

    # 2. Set mode to YOLO
    set_resp = client.post(
        "/api/agent/mode",
        json={"mode": "yolo", "is_session_override": True},
        headers=headers,
    )
    assert set_resp.status_code == 200
    assert set_resp.json()["operation_mode"] == "yolo"
