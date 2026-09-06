"""Tests for notifications routes (/api/notifications)."""
import pytest
from server.database import AdminNotice, AdminNoticeRead, SessionLocal


def test_notifications_endpoints(client, auth_headers, unique_user):
    """Test getting notifications feed and marking items read."""
    db = SessionLocal()
    try:
        # 1. Create a direct admin notice
        notice = AdminNotice(
            user_id=unique_user,
            subject="Welcome Test Notice",
            message="This is a test notification for you.",
            broadcast=False,
        )
        db.add(notice)

        # 2. Create a broadcast admin notice
        b_notice = AdminNotice(
            user_id="*",
            subject="System Maintenance",
            message="Scheduled maintenance window at midnight.",
            broadcast=True,
        )
        db.add(b_notice)
        db.commit()
        db.refresh(notice)
        db.refresh(b_notice)
        notice_id = notice.id
        b_notice_id = b_notice.id
    finally:
        db.close()

    # Query notifications
    res = client.get("/api/notifications", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "notifications" in data
    assert data["total"] >= 2
    assert any(n["title"] == "Welcome Test Notice" for n in data["notifications"])
    assert any(n["title"] == "System Maintenance" for n in data["notifications"])

    # Mark direct notice as read
    read_res = client.post(
        "/api/notifications/read",
        json={"ids": [f"notice_{notice_id}", f"notice_{b_notice_id}"]},
        headers=auth_headers,
    )
    assert read_res.status_code == 200
    assert f"notice_{notice_id}" in read_res.json()["read_ids"]

    # Verify notice is marked read in DB
    db = SessionLocal()
    try:
        n = db.query(AdminNotice).filter(AdminNotice.id == notice_id).first()
        assert n is not None
        assert n.read_at is not None

        # Verify broadcast read receipt recorded
        b_read = (
            db.query(AdminNoticeRead)
            .filter(
                AdminNoticeRead.notice_id == b_notice_id,
                AdminNoticeRead.user_id == unique_user,
            )
            .first()
        )
        assert b_read is not None
    finally:
        db.close()
