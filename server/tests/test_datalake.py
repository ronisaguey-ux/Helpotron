import asyncio
import os
import shutil
import pytest
from fastapi.testclient import TestClient
from server.main import app
from server.datalake import DataLakeManager, DataLakeIntelligenceAgent, _anonymize_id

client = TestClient(app)


def test_anonymization_id():
    h1 = _anonymize_id("user_12345")
    h2 = _anonymize_id("user_12345")
    assert h1 == h2
    assert h1.startswith("usr_")
    assert "user_12345" not in h1


def test_record_and_list_feedback():
    mgr = DataLakeManager()
    entry = mgr.record_feedback(
        category="feature_request",
        urgency="high",
        message="Please add direct LaTeX export formatting.",
        user_id="test_user_88",
        feature_tag="latex_export",
    )
    assert "feedback_id" in entry
    assert entry["category"] == "feature_request"
    assert entry["urgency"] == "high"

    items = mgr.list_feedback(category="feature_request")
    assert any(i["feedback_id"] == entry["feedback_id"] for i in items)

    # Test update status
    ok = mgr.update_feedback_status(entry["feedback_id"], "planned")
    assert ok is True


def test_log_telemetry_and_agent_analysis():
    mgr = DataLakeManager()
    mgr.log_assignment_evasion_event(
        user_id="user_test_99",
        word_count=550,
        initial_ai_score=82.0,
        final_ai_score=12.0,
        burstiness=34.5,
        lexical_diversity=48.2,
        passes_used=2,
        passed=True,
    )
    mgr.log_gdocs_export_event(
        user_id="user_test_99",
        document_id="doc_xyz_777",
        total_events=120,
        revisions_count=45,
        checkpoints_verified=10,
        retries_used=0,
        status="success",
    )

    agent = DataLakeIntelligenceAgent(mgr)
    insights = asyncio.run(agent.analyze_lake())
    assert "telemetry_summary" in insights
    assert "feedback_summary" in insights
    assert "actionable_insights" in insights
    assert insights["telemetry_summary"]["total_events_collected"] >= 2


def test_microcredit_record_carries_raw_user_id(tmp_path):
    """08-31 fix: the implement route pays the author via raw_user_id. The
    newer record format dropped it (118 older records carry it), which would
    credit the operator instead of the author on implement — assert new
    records keep it."""
    from server.datalake import DataLakeManager
    mgr = DataLakeManager(tmp_path)
    rec = mgr.evaluate_and_record_microcredit_submission(
        user_id="masonx_test",
        data_type="Lecture Notes & Audio Transcripts",
        title="test slide deck",
        data_content="photosynthesis converts light into chemical energy.",
        metadata={},
    )
    assert rec["user_hash"].startswith("usr_")
    assert rec["raw_user_id"] == "masonx_test"
    assert rec["status"] == "pending_review"


def test_api_feedback_and_datalake_routes():
    from server.database import SessionLocal, User
    from server.security import create_jwt_token

    # 1. Verify unauthenticated requests are rejected
    unauth_resp = client.post(
        "/api/feedback/submit",
        json={"category": "praise", "urgency": "low", "message": "Test message", "feature_tag": "gdocs_export"},
    )
    assert unauth_resp.status_code == 401

    unauth_list = client.get("/api/feedback/list")
    assert unauth_list.status_code == 401

    # 2. Authenticate as admin user
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "RoniDev").first()
        if not user:
            user = User(public_id="RoniDev", plan="elite", credits=1000)
            db.add(user)
            db.commit()
            db.refresh(user)
        admin_token = create_jwt_token({"sub": user.id, "public_id": user.public_id})
    finally:
        db.close()

    headers = {"Authorization": f"Bearer {admin_token}"}

    # Submit feedback (authenticated)
    resp = client.post(
        "/api/feedback/submit",
        headers=headers,
        json={
            "category": "praise",
            "urgency": "low",
            "message": "The humanized typing feature worked brilliantly on my chemistry report.",
            "feature_tag": "gdocs_export",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    fb_id = data["feedback"]["feedback_id"]

    # List feedback (admin authenticated)
    list_resp = client.get("/api/feedback/list", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["status"] == "success"

    # Patch feedback
    patch_resp = client.patch(f"/api/feedback/{fb_id}", headers=headers, json={"status": "resolved"})
    assert patch_resp.status_code == 200

    # Get insights
    insights_resp = client.get("/api/datalake/insights", headers=headers)
    assert insights_resp.status_code == 200
    assert insights_resp.json()["status"] == "success"

    # Get stats
    stats_resp = client.get("/api/datalake/stats", headers=headers)
    assert stats_resp.status_code == 200
    assert stats_resp.json()["status"] == "success"


# ── Data-lake delete route: the identifier and the ownership guard ──────────
#
# Regression cover for two defects measured live on 2026-09-23:
#
#  1. The route declared `entry_id: int`, but the id the UI holds is the JSONL
#     record's `submission_id` (`mc_e9f6a3df`). FastAPI rejected every real id
#     with a 422 `int_parsing` before the handler ran — surfaced to the user as
#     the literal body `{"type":"int_parsing","loc":["path","entry_id"],...}`.
#  2. The route deleted a `DataSubmission` DB row, but micro-credit submissions
#     are written ONLY to `microcredit_submissions.jsonl`, so even a numeric id
#     would have left the entry on screen at the next refresh.

def _submit(client, headers, title="delete-route probe"):
    """Submits one micro-credit entry and returns its submission_id."""
    resp = client.post(
        "/api/datalake/microcredits/submit",
        headers=headers,
        json={
            "data_type": "Academic Dataset & General Notes",
            "title": title,
            "data_content": "probe body used to exercise the delete route",
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["submission"]["submission_id"]


def test_datalake_delete_accepts_a_string_submission_id(client, auth_headers):
    """The id the UI actually sends must be accepted, not rejected as a non-int."""
    sid = _submit(client, auth_headers)
    assert sid.startswith("mc_")

    resp = client.delete(f"/api/datalake/{sid}", headers=auth_headers)
    assert resp.status_code == 200, (
        f"string submission ids must be accepted; got {resp.status_code}: {resp.text}"
    )

    # The entry must be gone from the STORE, not just reported as deleted — the
    # whole defect was a delete that touched the wrong backend.
    from server.datalake import datalake_manager
    assert datalake_manager.get_microcredit_submission(sid) is None


def test_datalake_delete_is_not_a_422_when_the_id_is_unknown(client, auth_headers):
    """An unknown id is a 404. A 422 here is the int_parsing bug returning."""
    resp = client.delete("/api/datalake/mc_doesnotexist", headers=auth_headers)
    assert resp.status_code == 404, resp.text


def test_datalake_delete_requires_authentication(client, auth_headers):
    """Anonymous deletes must be refused — this is an ownership-guarded route."""
    sid = _submit(client, auth_headers)
    resp = client.delete(f"/api/datalake/{sid}")
    assert resp.status_code in (401, 403), resp.text


def test_datalake_delete_refuses_another_users_entry(client, auth_headers_factory):
    """The IDOR guard: a non-owner must not be able to delete a foreign entry.

    Both users are created through the real signup/login path, so the only
    difference between the request that succeeds above and this one is who is
    asking.
    """
    victim = auth_headers_factory("delete-victim-" + os.urandom(4).hex())
    attacker = auth_headers_factory("delete-attacker-" + os.urandom(4).hex())

    sid = _submit(client, victim, title="owned by the victim")

    # The attacker is authenticated and is not an admin: must be refused.
    resp = client.delete(f"/api/datalake/{sid}", headers=attacker)
    assert resp.status_code == 403, (
        f"a non-owner delete must be 403, got {resp.status_code}: {resp.text}"
    )

    # And it must still be there afterwards — a 403 that still deleted would be
    # the worst of both.
    from server.datalake import datalake_manager
    assert datalake_manager.get_microcredit_submission(sid) is not None


def test_stored_hash_resolves_under_the_current_salt(client, auth_headers, unique_user):
    """A user's own history must be resolvable by the hash on their record.

    This is the invariant that silently broke when the salt was derived from a
    rotating secret: `user_hash` is the only key the history filter and the
    ownership check can match on, so an unresolvable hash means the user cannot
    see or delete their own submissions. `DATALAKE_SALT` must therefore be a
    dedicated, stable value.
    """
    sid = _submit(client, auth_headers, title="hash resolvability probe")

    from server.datalake import datalake_manager
    rec = datalake_manager.get_microcredit_submission(sid)
    assert rec is not None
    assert rec.get("user_hash") == _anonymize_id(unique_user), (
        "the stored hash must re-derive from the current salt; a mismatch means "
        "the salt moved and this user's history is now orphaned"
    )

    # ...and the history filter must therefore find it.
    listed = datalake_manager.list_microcredit_submissions(user_id=unique_user, limit=10**6)
    assert any(r.get("submission_id") == sid for r in listed), (
        "the per-user history filter must return the entry the user just created"
    )


def test_anonymization_uses_a_dedicated_salt_not_a_rotatable_secret(monkeypatch):
    """The salt must not fall back to `SECRET_KEY`.

    `SECRET_KEY` is rotated as routine security hygiene. When the salt followed
    it, every stored `user_hash` became unresolvable at the next rotation:
    measured 2026-09-23, 118 of 123 attributable records were orphaned, and the
    users could neither see nor delete their own submissions. A dedicated
    `DATALAKE_SALT` is the fix, and `SECRET_KEY` must never be its source.
    """
    from server import datalake

    # With a dedicated salt present it must be the one used, regardless of what
    # SECRET_KEY says.
    monkeypatch.setenv("DATALAKE_SALT", "dedicated-salt-value")
    monkeypatch.setenv("SECRET_KEY", "rotated-secret-value")
    with_dedicated = datalake._anonymize_id("someone")

    monkeypatch.setenv("DATALAKE_SALT", "dedicated-salt-value")
    monkeypatch.setenv("SECRET_KEY", "a-completely-different-rotated-secret")
    still_same = datalake._anonymize_id("someone")

    assert with_dedicated == still_same, (
        "rotating SECRET_KEY must NOT change the data-lake hash; if it does, "
        "every stored submission is orphaned by the next rotation"
    )

    # Show the failure mode explicitly, so the reason for the assertion is
    # legible to whoever breaks this next: with no dedicated salt the hash DOES
    # follow SECRET_KEY, and that is exactly the bug.
    monkeypatch.delenv("DATALAKE_SALT", raising=False)
    monkeypatch.setenv("SECRET_KEY", "rotated-secret-value")
    follows_secret = datalake._anonymize_id("someone")
    monkeypatch.setenv("SECRET_KEY", "a-completely-different-rotated-secret")
    assert datalake._anonymize_id("someone") != follows_secret, (
        "this assertion documents the original defect: without DATALAKE_SALT the "
        "hash tracks SECRET_KEY"
    )
