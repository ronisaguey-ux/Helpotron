import json

import pytest
from fastapi.testclient import TestClient

from server.database import init_db, SessionLocal, User, Assignment, Referral
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
                    # Token gate (operator 08-27): the agent chat requires a
                    # granted token_balance — fixtures must budget for it.
                    "token_balance": 500,
                },
            )
            db.add(user)
        else:
            user.settings = {
                "operation_mode": "auto",
                "auto_approved_actions": ["humanize", "analyze_rubric"],
                "token_balance": 500,
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
    headers = _auth_headers("test_overlord_user")
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
    headers = _auth_headers("test_overlord_user")
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
    headers = _auth_headers("test_overlord_user")
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
    headers = _auth_headers("test_overlord_user")
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
    headers = _auth_headers("test_overlord_user")
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


def test_overlord_omnipresent_actions_and_permissions():
    """Verify Overlord can change settings, create assignments, message teams, and respect permission controls."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "test_overlord_user").first()
        user.settings = {"operation_mode": "auto", "auto_approved_actions": ["create_assignment", "change_settings"]}
        db.commit()

        import asyncio

        # 1. Overlord changes effort score
        res1 = asyncio.run(overlord_agent.parse_and_execute_command(
            db, user, "set effort score to 875"
        ))
        assert res1["status"] == "success"
        assert res1["effort_score"] == 875
        assert user.settings["effort_score"] == 875

        # 2. Overlord enables auto-start
        res2 = asyncio.run(overlord_agent.parse_and_execute_command(
            db, user, "enable auto-start"
        ))
        assert res2["status"] == "success"
        assert res2["auto_start"] is True

        # 3. Overlord updates target grade
        res3 = asyncio.run(overlord_agent.parse_and_execute_command(
            db, user, "set target grade to A+ with score 98"
        ))
        assert res3["status"] == "success"
        assert res3["grade"] == "A+"
        assert res3["score"] == 98

        # 4. Overlord creates assignment (auto-approved via rule)
        res4 = asyncio.run(overlord_agent.parse_and_execute_command(
            db, user, "create assignment 'Quantum Computing Algorithms' for course Physics"
        ))
        assert res4["status"] == "success"
        assert "Quantum Computing Algorithms" in res4["title"]
        assign_id = res4["assignment_id"]

        # 5. Overlord messages specific assignment team
        res5 = asyncio.run(overlord_agent.parse_and_execute_command(
            db, user, f"message team for assignment {assign_id}: calibrate thesis and citation style to IEEE"
        ))
        assert res5["status"] == "success"
        assert res5["assignment_id"] == assign_id

        # Verify chat message reached assignment team feed
        chat = overlord_agent.get_chat_history(assign_id)
        assert any("IEEE" in m["text"] for m in chat)

        # 6. Manual mode without rule requires permission
        user.settings = {"operation_mode": "manual", "auto_approved_actions": []}
        db.commit()

        res6 = asyncio.run(overlord_agent.parse_and_execute_command(
            db, user, "create assignment 'Astrophysics Simulation'"
        ))
        assert res6["status"] == "pending_permission"
        assert "permission_id" in res6

    finally:
        db.close()



def _auth_headers(public_id: str) -> dict:
    """Real auth for the hardened overlord/simulation surface (BATCH-11): a
    valid Bearer token for an existing user — X-Public-ID is never identity."""
    from server.security import create_jwt_token

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user is None:
            user = User(public_id=public_id, plan="basic", credits=50.0, settings={})
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_jwt_token(user_id=user.id, role="user")
    finally:
        db.close()
    return {"Authorization": f"Bearer {token}"}


def test_degenerate_reply_guard():
    """Operator 08-27: the claude bridge (and local LLM) can hand back a lone
    '👍' or other emoji-only text — that must be treated as NO reply so the
    pipeline falls back to a real answer instead of sending a bare reaction."""
    from server.routes_overlord import _is_degenerate_reply

    # degenerate: empty / pure emoji / punctuation only
    for bad in ("", "   ", "\U0001f44d", "\U0001f44d\U0001f3fd", "❤️", "✅",
                "\U0001f525", "⚠️", "🤷***", "!!", "..."):
        assert _is_degenerate_reply(bad) is True, repr(bad)
    # fine: any reply containing even one word character
    for good in ("ok", "Alright \U0001f939", "✅ Done.", "Thanks!", "你好",
                 "привет", "a", "Can you try that again?"):
        assert _is_degenerate_reply(good) is False, repr(good)


def test_readonly_actions_never_require_approval():
    """Operator 08-31 (Bob, My Agent full-capability): pure reads (wallet,
    library, referrals, datalake list, progress) must NOT be gated by any
    mode — manual mode is for WORK actions, not for asking your balance."""
    settings_manual = {"operation_mode": "manual", "auto_approved_actions": []}
    for action in ("get_wallet", "list_library", "list_referrals",
                   "list_datalake_entries", "get_progress", "read_assignment"):
        approved, reason = permission_engine.evaluate_action_permission(settings_manual, action)
        assert approved is True, f"{action} should be read-only-approved: {reason}"
    # Work actions in manual still ask:
    approved, _ = permission_engine.evaluate_action_permission(settings_manual, "change_settings")
    assert approved is False


def test_surface_read_actions():
    """08-31: the agent's website-surface actions return real row data:
    wallet from settings, library from study_materials, referrals from the
    referrals table, progress from assignments, datalake from the JSONL."""
    import asyncio
    from server.database import StudyMaterial

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "test_overlord_user").first()
        assert user is not None
        user.settings = {**(user.settings or {}), "token_balance": 123.0, "micro_credits_balance": 2500}
        user.credits = 7.5
        db.commit()
        db.refresh(user)

        # Library: seed one material file under the test user's assignment.
        assign = db.query(Assignment).filter(Assignment.user_id == user.id).first()
        mat_present = db.query(StudyMaterial).filter(StudyMaterial.user_id == user.id).first()
        if not mat_present:
            db.add(StudyMaterial(
                user_id=user.id, assignment_id=assign.id if assign else None,
                kind="flashcards", content=json.dumps([{"q": "Q1", "a": "A1"}]),
            ))
            db.commit()

        # Referrals: the fixture user is on plan pro, so a code can be issued.
        from server.referral import create_new_referral_code
        has_ref = db.query(Referral).filter(Referral.referrer_id == user.id).first()
        if not has_ref:
            create_new_referral_code(db, user)
        db.commit()

        wallet = asyncio.run(overlord_agent.execute_task_action(db, user, "get_wallet", {}))
        assert wallet["status"] == "completed"
        assert wallet["wallet"]["tokens"] == 123.0
        assert wallet["wallet"]["credits"] == 7.5
        assert wallet["wallet"]["micro_credits"] == 2500.0
        assert "123" in wallet["message"]

        lib = asyncio.run(overlord_agent.execute_task_action(db, user, "list_library", {}))
        assert lib["status"] == "completed"
        assert "flashcards" in lib["message"]

        refs = asyncio.run(overlord_agent.execute_task_action(db, user, "list_referrals", {}))
        assert refs["status"] == "completed"
        assert "unused" in refs["message"]

        prog = asyncio.run(overlord_agent.execute_task_action(db, user, "get_progress", {}))
        assert prog["status"] == "completed"
        assert "assignments" in prog["message"]

        dl = asyncio.run(overlord_agent.execute_task_action(db, user, "list_datalake_entries", {}))
        assert dl["status"] == "completed"
    finally:
        db.close()


def test_compact_chat_history_chronology(monkeypatch):
    """Proves V2-C4-03: compact_chat_history prepends summary so newest messages follow."""
    import asyncio
    from server.overlord_agent import overlord_agent
    from server.database import User

    test_user = User(public_id="usr_compactor_test", plan="basic", settings={})
    target_key = "thread_test_compaction"
    overlord_agent.forget_chat_history(target_key, user_id=test_user.id)

    # Add 45 messages to exceed max_messages
    for i in range(45):
        overlord_agent.add_chat_message(
            target_key,
            sender="user" if i % 2 == 0 else "overlord",
            text=f"Turn message {i}",
            user_id=test_user.id,
        )

    # Mock call_llm so compaction produces a summary
    async def mock_call_llm(*args, **kwargs):
        return "Compacted key facts from early turns."

    monkeypatch.setattr("server.llm.call_llm", mock_call_llm)

    res = asyncio.run(overlord_agent.compact_chat_history(user=test_user, target_key=target_key, max_messages=40))
    assert res is not None
    assert "Compacted" in res

    history = overlord_agent.get_chat_history(target_key, user=test_user)
    # The summary MUST be the first message (index 0)
    assert len(history) == 11  # 1 summary + 10 newest
    assert history[0]["metadata"].get("compacted") is True
    assert "Earlier context compacted" in history[0]["text"]
    # The last message MUST be Turn 44 (the newest turn)
    assert history[-1]["text"] == "Turn message 44"
