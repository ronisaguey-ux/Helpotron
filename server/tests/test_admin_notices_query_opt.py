import uuid
from unittest.mock import MagicMock
import pytest
from server.database import SessionLocal, User, AdminNotice, AdminNoticeRead
from server.routes_user_settings import get_my_admin_notices_route


@pytest.mark.asyncio
async def test_admin_notices_sql_filtering():
    db = SessionLocal()
    user_pid = f"test_notice_{uuid.uuid4().hex[:8]}"
    try:
        user = User(public_id=user_pid, plan="free", role="user")
        db.add(user)
        db.commit()

        # Direct unread notice
        n1 = AdminNotice(user_id=user.public_id, subject="Direct Unread", message="Msg 1", broadcast=False)
        # Direct read notice (should NOT be returned)
        from datetime import datetime, timezone
        n2 = AdminNotice(user_id=user.public_id, subject="Direct Read", message="Msg 2", broadcast=False, read_at=datetime.now(timezone.utc))
        # Broadcast notice (unread)
        n3 = AdminNotice(user_id="*", subject="Broadcast Unread", message="Msg 3", broadcast=True)
        # Broadcast notice (read)
        n4 = AdminNotice(user_id="*", subject="Broadcast Read", message="Msg 4", broadcast=True)
        db.add_all([n1, n2, n3, n4])
        db.commit()

        # Mark n4 as read by this user
        r4 = AdminNoticeRead(notice_id=n4.id, user_id=user.public_id)
        db.add(r4)
        db.commit()

        # Mock request to return our user
        req = MagicMock()
        req.cookies = {}
        req.headers = {"Authorization": f"Bearer token_{user.id}"}

        # Mock _get_current_user in routes_user_settings
        from unittest.mock import patch
        with patch("server.routes_user_settings._get_current_user", return_value=user):
            resp = await get_my_admin_notices_route(request=req, db=db)

        assert resp["status"] == "success"
        unread_subjects = [n["subject"] for n in resp["unread"]]
        assert "Direct Unread" in unread_subjects
        assert "Broadcast Unread" in unread_subjects
        assert "Direct Read" not in unread_subjects
        assert "Broadcast Read" not in unread_subjects
    finally:
        db.rollback()
        db.close()
