#!/usr/bin/env python3
# Verification script for BATCH-07 (Insights, Study Activity & Cost Attribution)
import os as _os, sys as _sys, traceback as _tb

def _main():
    from fastapi.testclient import TestClient
    from server.main import app
    client = TestClient(app)

    # 1. Verify Insights Snapshot endpoint exists and enforces auth/contract
    resp = client.get("/api/insights/snapshot", headers={"Authorization": "Bearer test_token"})
    assert resp.status_code in [200, 401], f"Unexpected status {resp.status_code}"

    # 2. Verify Study Activity function is callable
    from server.analytics import get_study_activity_summary
    assert callable(get_study_activity_summary)
    summary_study = get_study_activity_summary()
    assert "total_active_minutes" in summary_study
    assert "next_best_action" in summary_study

    # 3. Verify Cost Attribution & Grunt Savings tracking
    from server.cost_tracking import get_cost_intelligence_summary
    summary_cost = get_cost_intelligence_summary()
    assert "grunt_savings_usd" in summary_cost
    assert "escalation_events_count" in summary_cost

    print("✓ PASS: Batch 07 Insights, Study Activity & Cost Attribution Verified")

try:
    _main()
except AssertionError:
    _tb.print_exc()
    _os._exit(1)
except SystemExit as e:
    _os._exit(int(e.code or 0))
_os._exit(0)
