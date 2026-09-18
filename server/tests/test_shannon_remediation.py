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
