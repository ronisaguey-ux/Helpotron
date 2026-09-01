"""Tests for admin inbox delete/clear endpoints (Control Center, 09-01).

Covers DELETE /api/admin/messages/{message_id} and DELETE /api/admin/messages:
admin-only gating (require_admin), 404 on missing rows, row removal, and the
clear-all count. Admin auth = real Bearer token like every other admin test —
admin status comes from the DB user record, never X-Public-ID.
"""
import uuid

from fastapi.testclient import TestClient

from server.database import init_db, SessionLocal, User, AdminMessage
from server.main import app
from server.security import create_jwt_token

init_db()
client = TestClient(app)


def _admin_headers() -> dict:
    """Bearer token for the default admin account (ADMIN_PUBLIC_ID)."""
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.public_id == "RoniDev").first()
        if admin is None:
            admin = User(public_id="RoniDev", plan="elite", credits=100.0, settings={})
            db.add(admin)
            db.commit()
            db.refresh(admin)
        return {"Authorization": f"Bearer {create_jwt_token(user_id=admin.id, role='admin')}"}
    finally:
        db.close()


def _user_headers(public_id: str) -> dict:
    """Bearer token for a plain non-admin user."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user is None:
            user = User(public_id=public_id, plan="basic", credits=5.0, settings={})
            db.add(user)
            db.commit()
            db.refresh(user)
        return {"Authorization": f"Bearer {create_jwt_token(user_id=user.id, role='user')}"}
    finally:
        db.close()


def _seed_message(user_id: str, subject: str = "Inbox test", category: str = "general") -> int:
    """Insert an AdminMessage row directly (inbox fixtures don't need the API)."""
    db = SessionLocal()
    try:
        msg = AdminMessage(user_id=user_id, subject=subject, category=category, message="Help needed with my assignment.")
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return msg.id
    finally:
        db.close()


def _message_count() -> int:
    db = SessionLocal()
    try:
        return db.query(AdminMessage).count()
    finally:
        db.close()


def test_delete_single_message_removes_row():
    """Admin deletes one message: 200, id echoed, row gone, inbox shrinks."""
    msg_id = _seed_message("student_delete_one")
    res = client.delete(f"/api/admin/messages/{msg_id}", headers=_admin_headers())
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["message_id"] == msg_id

    db = SessionLocal()
    try:
        assert db.query(AdminMessage).filter(AdminMessage.id == msg_id).first() is None
    finally:
        db.close()

    inbox = client.get("/api/admin/messages", headers=_admin_headers())
    assert inbox.status_code == 200
    assert all(m["id"] != msg_id for m in inbox.json()["messages"])


def test_delete_missing_message_returns_404():
    """Deleting a row that does not exist returns 404."""
    res = client.delete("/api/admin/messages/999999", headers=_admin_headers())
    assert res.status_code == 404


def test_clear_all_messages_drops_count_to_zero():
    """Clear inbox returns the removed count and empties the table."""
    for i in range(3):
        _seed_message(f"student_clear_{i}", subject=f"Message {i}")
    before = _message_count()
    assert before >= 3

    res = client.delete("/api/admin/messages", headers=_admin_headers())
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["deleted"] == before
    assert _message_count() == 0

    inbox = client.get("/api/admin/messages", headers=_admin_headers())
    assert inbox.status_code == 200
    assert inbox.json()["count"] == 0


def test_non_admin_cannot_delete_or_clear():
    """Plain user gets 403 on both delete and clear (require_admin gate)."""
    user_headers = _user_headers(f"plain_user_{uuid.uuid4().hex[:8]}")
    msg_id = _seed_message(f"plain_user_{uuid.uuid4().hex[:8]}")

    res = client.delete(f"/api/admin/messages/{msg_id}", headers=user_headers)
    assert res.status_code == 403

    res = client.delete("/api/admin/messages", headers=user_headers)
    assert res.status_code == 403

    # Row untouched, table not wiped
    db = SessionLocal()
    try:
        assert db.query(AdminMessage).filter(AdminMessage.id == msg_id).first() is not None
    finally:
        db.close()


def test_unauthenticated_delete_returns_401():
    """No token at all → 401 (require_admin: 'Authentication required')."""
    msg_id = _seed_message("student_anon")
    client.cookies.clear()
    res = client.delete(f"/api/admin/messages/{msg_id}")
    assert res.status_code == 401
