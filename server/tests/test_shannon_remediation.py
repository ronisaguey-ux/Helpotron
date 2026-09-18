"""Automated verification suite for Shannon pentest remediation findings.
"""
import pytest
from server.database import User, SessionLocal, Organization
from server.security import SessionStore, SESSION_COOKIE_NAME, is_admin_user


def test_authz_01_org_creation_does_not_grant_admin(client):
    """AUTHZ-01: POST /api/organizations/create must NOT grant platform admin."""
    db = SessionLocal()
    pid = "test_org_user_no_admin"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={})
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        u.role = "member"
        u.organization_id = None
        db.commit()

    token = SessionStore.create_session(u.id, u.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    csrf_resp = client.get("/api/csrf")
    csrf_token = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_token}

    resp = client.post(
        "/api/organizations/create",
        json={"name": "TestNonAdminOrg", "plan": "team", "seat_count": 5},
        headers=headers,
    )
    assert resp.status_code == 200

    db.refresh(u)
    assert u.role != "admin"
    assert is_admin_user(u) is False

    # Verify user is still forbidden from admin endpoints
    admin_resp = client.get("/api/admin/users", headers=headers)
    assert admin_resp.status_code == 403


def test_misc_13_banned_user_blocked_on_org_route(client):
    """MISC-13: Banned user cookie cannot call /api/organizations/create."""
    db = SessionLocal()
    pid = "test_banned_org_caller"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={"banned": True})
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        s = dict(u.settings or {})
        s["banned"] = True
        u.settings = s
        db.commit()

    token = SessionStore.create_session(u.id, u.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    csrf_resp = client.get("/api/csrf")
    csrf_token = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_token}

    resp = client.post(
        "/api/organizations/create",
        json={"name": "BannedOrgAttempt", "plan": "team", "seat_count": 5},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "suspended" in resp.text.lower()


def test_inj_01_sympify_command_injection_blocked():
    """INJ-01: sympy.sympify and eval-capable code in run_shell must be rejected."""
    from server.overlord_agent import _is_safe_compute_code, _validated_argv

    # Shannon exploit payload 1
    p1 = "from sympy import sympify; sympify('__import__(+chr(39)+os+chr(39)+).system(+chr(39)+id+chr(39)+)')"
    assert _is_safe_compute_code(p1) is False
    assert _validated_argv(f"python3 -c '{p1}'") is None

    # Shannon exploit payload 2 (base64 exec)
    p2 = "from sympy import sympify; sympify('exec(__import__(+chr(39)+base64+chr(39)+).b64decode(+chr(39)+aWQ=+chr(39)+).decode())')"
    assert _is_safe_compute_code(p2) is False
    assert _validated_argv(f"python3 -c '{p2}'") is None

    # Direct import of sympify or dangerous methods
    assert _is_safe_compute_code("import sympy; sympy.sympify('1+1')") is False
    assert _is_safe_compute_code("import sympy; sympy.parse_expr('1+1')") is False

    # Safe math expressions must still be allowed
    assert _is_safe_compute_code("import math; print(2+2)") is True
    assert _is_safe_compute_code("import sympy; print(sympy.simplify('1/2+1/3'))") is True


def test_inj_02_and_04_sandbox_script_never_auto_approved(client):
    """INJ-02 & INJ-04: run_sandbox_script must NEVER auto-approve via yolo override."""
    from server.overlord_agent import PermissionEngine

    # Direct permission engine check
    settings = {"operation_mode": "auto"}
    approved, reason = PermissionEngine.evaluate_action_permission(
        settings, "run_sandbox_script", session_mode_override="yolo"
    )
    assert approved is False
    assert "requires explicit" in reason.lower()

    # Even if operation_mode is yolo, script execution requires approval
    settings_yolo = {"operation_mode": "yolo"}
    approved_yolo, _ = PermissionEngine.evaluate_action_permission(
        settings_yolo, "run_sandbox_script"
    )
    assert approved_yolo is False

    # HTTP endpoint check via POST /api/agent/task
    db = SessionLocal()
    pid = "test_sandbox_inj_user"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={"operation_mode": "auto"})
        db.add(u)
        db.commit()
        db.refresh(u)

    token = SessionStore.create_session(u.id, u.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    csrf_resp = client.get("/api/csrf")
    csrf_token = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_token}

    resp = client.post(
        "/api/agent/task",
        headers=headers,
        json={
            "action_type": "run_sandbox_script",
            "session_mode_override": "yolo",
            "payload": {
                "language": "python",
                "script": "print('exploit')",
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "permission_required"
    assert "paused awaiting user confirmation" in data.get("message", "")
