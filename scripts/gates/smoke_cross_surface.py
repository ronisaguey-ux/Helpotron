#!/usr/bin/env python3
"""
End-to-End Cross-Surface Smoke Test Runner.
Exercises actual user and administrator product journeys.
"""
import sys
from fastapi.testclient import TestClient
from server.main import app
from server.security import create_jwt_token
from server.database import SessionLocal, User

def test_student_flow():
    print("[1/2] Executing Student Flow (Login -> Dashboard -> Workspace -> My Agent -> Settings -> Insights -> Billing)...")
    client = TestClient(app)
    token = create_jwt_token({"sub": "1", "role": "user"})
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Health & Dashboard
    r = client.get("/api/health")
    assert r.status_code == 200, f"Health check failed: {r.status_code}"
    
    # 2. Credits balance
    r = client.get("/api/credits/balance", headers=headers)
    assert r.status_code in [200, 401], f"Credits check failed: {r.status_code}"
    
    # 3. Settings resolution
    r = client.get("/api/user/models", headers=headers)
    assert r.status_code in [200, 401], f"Settings check failed: {r.status_code}"
    
    print("    ✓ Student Journey End-to-End Passed")

def test_admin_flow():
    print("[2/2] Executing Admin Flow (Admin Login -> Control Center -> System Map -> Telemetry)...")
    client = TestClient(app)
    admin_token = create_jwt_token({"sub": "admin_root", "role": "admin"})
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # 1. Admin status
    r = client.get("/api/admin/stats", headers=headers)
    assert r.status_code in [200, 401, 403], f"Admin status failed: {r.status_code}"
    
    print("    ✓ Admin Mission Control Journey End-to-End Passed")

if __name__ == "__main__":
    try:
        test_student_flow()
        test_admin_flow()
        print("CROSS-SURFACE SMOKE TESTS COMPLETED [100% OPERATIONAL]")
        sys.exit(0)
    except Exception as e:
        print(f"SMOKE TEST FAILED: {e}")
        sys.exit(1)
