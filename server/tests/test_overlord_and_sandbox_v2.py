"""Comprehensive tests for Virtual Subagent Sandbox and Overlord Ecosystem Control."""
import pytest
from fastapi.testclient import TestClient
from server.main import app
from server.database import Base, User, engine, get_db
from server.engine.sandbox import SandboxManager, VirtualSubagentSandbox, sandbox_manager
from server.overlord_agent import OverlordAgent, PermissionEngine, overlord_agent

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    test_user = db.query(User).filter(User.public_id == "test_overlord_user").first()
    if not test_user:
        test_user = User(
            public_id="test_overlord_user",
            email="overlord_test@helpotron.example",
            credits=100.0,
            plan="elite",
            settings={
                "operation_mode": "auto",
                "reading_level": "college-freshman",
                "auto_approved_actions": ["generate_flashcards"],
            },
        )
        db.add(test_user)
        db.commit()
    yield
    db.close()


def test_sandbox_isolated_execution():
    """Verify virtual sandbox creates isolated workspace, runs script, and captures output."""
    mgr = SandboxManager()
    sbx = mgr.create_sandbox(subagent_name="test_worker", user_id="test_overlord_user", timeout_seconds=10.0)
    assert sbx.is_active is True
    assert sbx.workspace_dir.exists()

    # Write file into sandbox
    sbx.write_file("input.txt", "Data payload for subagent processing")
    assert sbx.read_file("input.txt") == "Data payload for subagent processing"

    # Strict path traversal security check
    with pytest.raises(ValueError):
        sbx.write_file("../../../evil.sh", "malicious payload")

    # Destroy sandbox
    mgr.cleanup_sandbox(sbx.sandbox_id)
    assert sbx.is_active is False
    assert not sbx.workspace_dir.exists()


def test_sandbox_python_script_execution():
    """Verify executing Python code inside virtual sandbox."""
    import asyncio
    res = asyncio.run(
        sandbox_manager.execute_subagent_task(
            subagent_name="calc_worker",
            user_id="test_overlord_user",
            script_code="import sys\nprint('Computed value:', 42 * 2)",
            language="python",
            auto_cleanup=True,
        )
    )
    assert res["success"] is True
    assert "Computed value: 84" in res["stdout"]
    assert res["exit_code"] == 0


def test_permission_engine_modes():
    """Test Manual, Auto, and YOLO permission behavior."""
    settings = {"operation_mode": "auto", "auto_approved_actions": ["custom_action"]}

    # Auto mode: routine vs critical
    app_routine, _ = PermissionEngine.evaluate_action_permission(settings, "analyze_rubric")
    assert app_routine is True

    app_critical, _ = PermissionEngine.evaluate_action_permission(settings, "submit_assignment")
    assert app_critical is False

    # Manual mode: all require approval
    app_manual, _ = PermissionEngine.evaluate_action_permission(settings, "analyze_rubric", session_mode_override="manual")
    assert app_manual is False

    # YOLO mode: all auto-approved
    app_yolo, _ = PermissionEngine.evaluate_action_permission(settings, "submit_assignment", session_mode_override="yolo")
    assert app_yolo is True

    # Custom rule list
    app_custom, _ = PermissionEngine.evaluate_action_permission(settings, "custom_action", session_mode_override="manual")
    assert app_custom is True


def test_api_overlord_nlp_settings_update():
    """Test updating user reading level and mode via natural language."""
    # 1. Update reading level via NLP
    res = client.post(
        "/api/agent/command",
        headers=_auth_headers("test_overlord_user"),
        json={"text": "Please change my reading level to sophomore"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "sophomore" in data["reply"].lower()

    # 2. Update operation mode via NLP
    res2 = client.post(
        "/api/agent/command",
        headers=_auth_headers("test_overlord_user"),
        json={"text": "Switch operation mode to YOLO"},
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "success"
    assert data2["mode"] == "yolo"


def test_api_sandbox_execution_and_listing():
    """Test the /api/agent/sandbox/execute and /api/agent/sandbox/active endpoints."""
    res = client.post(
        "/api/agent/sandbox/execute",
        headers=_auth_headers("test_overlord_user"),
        json={
            "script_code": "import os\nprint('Sandbox Python test success')",
            "language": "python",
            "subagent_name": "api_test_worker",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "Sandbox Python test success" in data["sandbox_result"]["stdout"]

    # Active sandboxes endpoint
    res_active = client.get(
        "/api/agent/sandbox/active",
        headers=_auth_headers("test_overlord_user"),
    )
    assert res_active.status_code == 200
    assert "sandboxes" in res_active.json()


def _auth_headers(public_id: str) -> dict:
    """Real auth for the hardened overlord/simulation surface (BATCH-11): a
    valid Bearer token for an existing user — X-Public-ID is never identity."""
    from server.security import create_jwt_token
    from server.database import SessionLocal, User

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
