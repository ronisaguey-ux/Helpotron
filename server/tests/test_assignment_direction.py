"""Assignment lifecycle tests (feature 09-01): pending_approval default,
direction picker, Data Lake fallback, mark-done, archive, bubble export.

Uses the repo conftest fixtures (client / auth_headers / unique_user): the DB
is pinned to an ephemeral SQLite file and the Data Lake manager is rebound to
a per-test temp dir, so production data is never touched.
"""
from server.assignment_direction import bucket_for, is_direction_achievable
from server.database import (
    AgentAction,
    AgentChatMessage,
    Assignment,
    SessionLocal,
    StudyMaterial,
    User,
)


def _create_assignment(client, headers, title="Direction demo assignment", **kw):
    body = {"title": title, "prompt": kw.pop("prompt", "Demo prompt"), **kw}
    res = client.post("/api/assignments", json=body, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


# ─── 1. new assignment defaults to pending_approval ──────────────────────────

def test_new_assignment_without_status_becomes_pending_approval(client, auth_headers):
    created = _create_assignment(client, auth_headers, due_date="2026-10-01")
    assert created["status"] == "pending_approval"

    db = SessionLocal()
    try:
        row = db.query(Assignment).filter(Assignment.id == created["assignment_id"]).first()
        assert row is not None
        assert row.status == "pending_approval"
    finally:
        db.close()


# ─── 2. choose-direction moves to in_progress with the chosen direction ───────

def test_choose_direction_study_guide_goes_in_progress(client, auth_headers):
    created = _create_assignment(client, auth_headers)
    aid = created["assignment_id"]

    res = client.post(
        f"/api/assignments/{aid}/choose-direction",
        json={"direction": "study_guide"},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["status"] == "in_progress"
    assert payload["datalake_requested"] is False
    assert payload["dispatch_note"]  # "dispatch pending" or a real note from assignment_team

    db = SessionLocal()
    try:
        row = db.query(Assignment).filter(Assignment.id == aid).first()
        assert row.status == "in_progress"
        assert row.progress["direction"] == "study_guide"
        assert row.progress.get("direction_chosen_at")
        assert row.progress.get("direction_text") is None
    finally:
        db.close()

    state = client.get(f"/api/assignments/{aid}/direction", headers=auth_headers).json()
    assert state["bucket"] == "in_progress"
    assert state["direction"] == "study_guide"
    assert "do_it_for_me" in state["options"]


# ─── 3. un-achievable custom direction lands in the Data Lake ─────────────────

def test_custom_direction_unachievable_goes_to_datalake(client, auth_headers, unique_user):
    created = _create_assignment(client, auth_headers, title="Sunrise alarm project")
    aid = created["assignment_id"]
    custom_text = "make it play sounds at sunrise"

    assert is_direction_achievable("custom", custom_text) is False

    res = client.post(
        f"/api/assignments/{aid}/choose-direction",
        json={"direction": "custom", "custom_text": custom_text},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["datalake_requested"] is True
    fb_id = payload.get("datalake_feedback_id")
    assert fb_id, f"expected a feedback id, got {payload}"

    from server.datalake import datalake_manager

    entries = datalake_manager.list_feedback(category="feature_request")
    ids = [e.get("feedback_id") for e in entries]
    assert fb_id in ids, f"feedback_id {fb_id} not in {ids}"
    entry = next(e for e in entries if e.get("feedback_id") == fb_id)
    assert custom_text in entry["message"]
    assert "Sunrise alarm project" in entry["message"]
    assert entry.get("category") == "feature_request"


# ─── 4. mark-done → completed ─────────────────────────────────────────────────

def test_mark_done_sets_completed(client, auth_headers):
    created = _create_assignment(client, auth_headers)
    aid = created["assignment_id"]
    res = client.post(f"/api/assignments/{aid}/mark-done", headers=auth_headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "completed"

    db = SessionLocal()
    try:
        row = db.query(Assignment).filter(Assignment.id == aid).first()
        assert row.status == "completed"
        assert bucket_for(row.status) == "completed"
        assert row.progress.get("completed_at")
    finally:
        db.close()


# ─── 5. archive → archived bucket ─────────────────────────────────────────────

def test_archive_sets_archived_bucket(client, auth_headers):
    created = _create_assignment(client, auth_headers)
    aid = created["assignment_id"]
    res = client.post(f"/api/assignments/{aid}/archive", headers=auth_headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "archived"

    state = client.get(f"/api/assignments/{aid}/direction", headers=auth_headers).json()
    assert state["status"] == "archived"
    assert state["bucket"] == "archived"
    assert bucket_for("archived") == "archived"

    db = SessionLocal()
    try:
        row = db.query(Assignment).filter(Assignment.id == aid).first()
        assert row.status == "archived"
        assert row.progress.get("archived_at")
    finally:
        db.close()


# ─── 6. export with assignment_id includes the assignment and related rows ────

def test_export_with_assignment_id_returns_assignment_and_rows(client, auth_headers, unique_user):
    # Build an assignment + one row per related table directly in the DB.
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == unique_user).first()
        assert user is not None

        a = Assignment(
            user_id=user.id,
            title="Exportable lab report",
            prompt="Write it up",
            status="in_progress",
            progress={"direction": "do_it_for_me", "subject": "Chemistry"},
        )
        db.add(a)
        db.flush()
        aid = a.id

        material = StudyMaterial(
            user_id=user.id, assignment_id=aid, kind="study_guide", content="guide text"
        )
        message = AgentChatMessage(
            user_id=user.id, target_key=str(aid), sender="agent", text="working on it"
        )
        action = AgentAction(
            user_id=user.id, assignment_id=aid, action_type="draft", summary="wrote a draft"
        )
        db.add_all([material, message, action])
        db.commit()
        material_id, message_id, action_id = material.id, message.id, action.id
    finally:
        db.close()

    res = client.get(f"/api/assignments/export?assignment_id={aid}", headers=auth_headers)
    assert res.status_code == 200, res.text
    assert "attachment" in res.headers.get("content-disposition", "")
    # 09-01: per-assignment exports carry an assignment-scoped filename.
    assert f'filename="helpotron-assignment-{aid}.json"' in res.headers["content-disposition"]

    data = res.json()
    assert data["user"]["public_id"] == unique_user
    assert len(data["assignments"]) == 1
    assert data["assignments"][0]["id"] == aid
    assert data["assignments"][0]["title"] == "Exportable lab report"
    assert any(m["id"] == material_id for m in data["materials"])
    assert any(m["id"] == message_id for m in data["messages"])
    assert any(a["id"] == action_id for a in data["agent_actions"])


# ─── 7. 404 on unknown assignment ─────────────────────────────────────────────

def test_unknown_assignment_404(client, auth_headers):
    res = client.get("/api/assignments/999999999/direction", headers=auth_headers)
    assert res.status_code == 404
    res = client.post(
        "/api/assignments/999999999/choose-direction",
        json={"direction": "study_guide"},
        headers=auth_headers,
    )
    assert res.status_code == 404
    res = client.get("/api/assignments/export?assignment_id=999999999", headers=auth_headers)
    assert res.status_code == 404


# ─── 8. 400 on an unknown direction ───────────────────────────────────────────

def test_choose_direction_rejects_unknown_direction(client, auth_headers):
    created = _create_assignment(client, auth_headers)
    res = client.post(
        f"/api/assignments/{created['assignment_id']}/choose-direction",
        json={"direction": "paint_me_a_mural"},
        headers=auth_headers,
    )
    assert res.status_code == 400


# ─── 9. 401 without auth ──────────────────────────────────────────────────────

def test_direction_routes_require_auth(client):
    assert client.get("/api/assignments/export").status_code == 401
    assert client.get("/api/assignments/1/direction").status_code == 401
    assert client.post("/api/assignments/1/choose-direction", json={"direction": "study_guide"}).status_code == 401
    assert client.post("/api/assignments/1/mark-done").status_code == 401
    assert client.post("/api/assignments/1/archive").status_code == 401
