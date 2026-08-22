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


def test_api_feedback_and_datalake_routes():
    # Submit feedback
    resp = client.post(
        "/api/feedback/submit",
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

    # List feedback
    list_resp = client.get("/api/feedback/list")
    assert list_resp.status_code == 200
    assert list_resp.json()["status"] == "success"

    # Patch feedback
    patch_resp = client.patch(f"/api/feedback/{fb_id}", json={"status": "resolved"})
    assert patch_resp.status_code == 200

    # Get insights
    insights_resp = client.get("/api/datalake/insights")
    assert insights_resp.status_code == 200
    assert insights_resp.json()["status"] == "success"

    # Get stats
    stats_resp = client.get("/api/datalake/stats")
    assert stats_resp.status_code == 200
    assert stats_resp.json()["status"] == "success"
