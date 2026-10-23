"""Regression tests for the unauthenticated-route holes closed in the nuclear sweep.

Every case below was reproduced live against a running server before the fix:
each one returned 200 with real data (or mutated real state) with no session,
no bearer token and no CSRF header. They must stay 401/403 forever.
"""
import io
import uuid

import pytest
from fastapi.testclient import TestClient

from server.config import config
from server.database import SessionLocal, User, Assignment, AdminMessage
from server.main import app
from server.security import create_jwt_token


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _user(public_id: str, **kw) -> int:
    """Get-or-create a user, returning its id (detached from the session)."""
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == public_id).first()
        if u is None:
            u = User(public_id=public_id, plan=kw.pop("plan", "basic"),
                     credits=kw.pop("credits", 50.0), settings={}, **kw)
            db.add(u)
            db.commit()
            db.refresh(u)
        return u.id
    finally:
        db.close()


def _headers(public_id: str, role: str = "user") -> dict:
    return {"Authorization": f"Bearer {create_jwt_token(user_id=_user(public_id), role=role)}"}


@pytest.fixture(scope="module")
def admin_headers():
    return _headers(getattr(config, "admin_public_id", "RoniDev"), role="admin")


@pytest.fixture(scope="module")
def student_headers():
    return _headers("nuclear_student")


# ─── Admin inbox: read and reply were both wide open ──────────────────────────

def test_admin_inbox_rejects_anonymous_and_non_admin(client, student_headers):
    for path in ("/api/admin/messages", "/api/user/admin/messages"):
        assert client.get(path).status_code == 401, f"{path} readable anonymously"
        assert client.get(path, headers=student_headers).status_code == 403, \
            f"{path} readable by a plain student"


def test_admin_reply_cannot_be_forged(client, student_headers, admin_headers):
    """Anyone could previously POST a reply and have it render as the admin's."""
    db = SessionLocal()
    try:
        msg = AdminMessage(user_id="nuclear_student", subject="s", category="general",
                           message="m", status="open")
        db.add(msg)
        db.commit()
        msg_id = msg.id
    finally:
        db.close()

    body = {"reply": "forged"}
    assert client.post(f"/api/admin/messages/{msg_id}/reply", json=body).status_code == 401
    assert client.post(f"/api/admin/messages/{msg_id}/reply", json=body,
                       headers=student_headers).status_code == 403
    assert client.post(f"/api/user/admin/messages/{msg_id}/reply", json=body).status_code == 401

    ok = client.post(f"/api/admin/messages/{msg_id}/reply", json={"reply": "real"},
                     headers=admin_headers)
    assert ok.status_code == 200
    # The handler used to return "status" twice, so the success flag was shadowed.
    assert ok.json()["status"] == "success"
    assert ok.json()["message_status"] == "replied"


# ─── Cost/budget: anonymous read *and write* of any account's spend limits ────

def test_budget_endpoints_are_scoped_to_the_caller(client, student_headers, admin_headers):
    assert client.get("/api/admin/costs/budget").status_code == 401
    assert client.get("/api/admin/costs/budget?user_id=RoniDev").status_code == 401
    assert client.post("/api/admin/costs/budget?user_id=RoniDev",
                       json={"monthly_budget_usd": 4999}).status_code == 401

    # A signed-in student reads their own budget, never someone else's.
    mine = client.get("/api/admin/costs/budget", headers=student_headers)
    assert mine.status_code == 200
    assert mine.json()["public_id"] == "nuclear_student"

    assert client.get("/api/admin/costs/budget?user_id=RoniDev",
                      headers=student_headers).status_code == 403
    assert client.post("/api/admin/costs/budget?user_id=RoniDev",
                       json={"monthly_budget_usd": 4999},
                       headers=student_headers).status_code == 403

    # The admin may target another account explicitly.
    assert client.get("/api/admin/costs/budget?user_id=nuclear_student",
                      headers=admin_headers).json()["public_id"] == "nuclear_student"


def test_cost_estimate_requires_auth_and_no_longer_raises_nameerror(client, student_headers):
    payload = {"task_type": "summary", "word_count": 100, "effort_level": 5}
    assert client.post("/api/admin/costs/estimate", json=payload).status_code == 401
    # Previously raised `NameError: name 'config' is not defined` (a 500).
    res = client.post("/api/admin/costs/estimate", json=payload, headers=student_headers)
    assert res.status_code == 200
    assert "estimate" in res.json()


# ─── Overlord: agent chat leaked across users; sandboxes were public ──────────

def test_agent_chat_requires_ownership(client, student_headers):
    other_id = _user("nuclear_other")
    db = SessionLocal()
    try:
        a = Assignment(user_id=other_id, title="private", prompt="p")
        db.add(a)
        db.commit()
        assignment_id = a.id
    finally:
        db.close()

    assert client.get(f"/api/agent/chat/{assignment_id}").status_code == 401
    assert client.get(f"/api/agent/chat/{assignment_id}",
                      headers=student_headers).status_code == 404


def test_sandbox_routes_require_auth(client):
    assert client.get("/api/agent/sandbox/active").status_code == 401
    assert client.post("/api/agent/sandbox/cleanup", json={"sandbox_id": "x"}).status_code == 401


# ─── Avatar upload: anonymous writes into a statically served directory ──────

_PNG = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)


def test_avatar_upload_requires_auth(client):
    res = client.post("/api/uploads/avatar",
                      files={"file": ("a.png", io.BytesIO(_PNG), "image/png")})
    assert res.status_code == 401


def test_avatar_upload_rejects_mislabelled_bytes(client, student_headers):
    """content_type used to be trusted, so any payload could be stored as .png."""
    res = client.post("/api/uploads/avatar",
                      files={"file": ("a.png", io.BytesIO(b"<script>alert(1)</script>"),
                                      "image/png")},
                      headers=student_headers)
    assert res.status_code == 400

    ok = client.post("/api/uploads/avatar",
                     files={"file": ("a.png", io.BytesIO(_PNG), "image/png")},
                     headers=student_headers)
    assert ok.status_code == 200
    assert ok.json()["url"].startswith("/uploads/avatars/")


def test_writing_history_simulation_requires_auth(client):
    res = client.post("/api/user/fake-writing-history/simulate",
                      json={"content": "a" * 40, "wpm": 65, "version_count": 5})
    assert res.status_code == 401


# ─── V3-A2-02: server.auth utilities hardening ───────────────────────────────

def test_auth_module_verify_jwt_token_and_admin_gate():
    """V3-A2-02: verify_jwt_token and require_admin_user handle integer subs, revocations, and bans."""
    from fastapi import HTTPException
    from server.auth import verify_jwt_token, require_admin_user
    from server.security import create_jwt_token, revoke_user_jwts, SessionStore
    from server.database import SessionLocal, User

    db = SessionLocal()
    try:
        # Create an admin user and a student user
        admin_u = db.query(User).filter(User.public_id == "v3_admin_test").first()
        if not admin_u:
            admin_u = User(public_id="v3_admin_test", role="admin", plan="pro", settings={})
            db.add(admin_u)
            db.commit()
            db.refresh(admin_u)

        student_u = db.query(User).filter(User.public_id == "v3_student_test").first()
        if not student_u:
            student_u = User(public_id="v3_student_test", role="member", plan="basic", settings={})
            db.add(student_u)
            db.commit()
            db.refresh(student_u)

        # 1. Admin JWT with integer sub succeeds
        admin_token = create_jwt_token(admin_u.id, role="admin")
        payload = verify_jwt_token(admin_token)
        assert payload["sub"] == admin_u.id

        resolved_admin = require_admin_user(token=admin_token, db=db)
        assert resolved_admin.id == admin_u.id

        # 2. Admin via session token succeeds
        sess_token = SessionStore.create_session(admin_u.id, admin_u.public_id)
        resolved_sess = require_admin_user(token=sess_token, db=db)
        assert resolved_sess.id == admin_u.id
        SessionStore.delete_session(sess_token)

        # 3. Plain student JWT is rejected with 403
        student_token = create_jwt_token(student_u.id, role="user")
        with pytest.raises(HTTPException) as exc_info:
            require_admin_user(token=student_token, db=db)
        assert exc_info.value.status_code == 403

        # 4. Revoked admin JWT is rejected with 401
        revoke_user_jwts(admin_u.id)
        with pytest.raises(HTTPException) as exc_info:
            verify_jwt_token(admin_token)
        assert exc_info.value.status_code == 401

        with pytest.raises(HTTPException) as exc_info:
            require_admin_user(token=admin_token, db=db)
        assert exc_info.value.status_code == 401
    finally:
        db.close()
