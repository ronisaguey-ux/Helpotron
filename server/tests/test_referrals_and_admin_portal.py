"""Unit tests for 40-digit single-use referrals, subscription gating, token/credit model, and admin portal."""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from server.database import get_db, User, Referral, SessionLocal
from server.referral import (
    generate_referral_code,
    check_user_subscription,
    create_new_referral_code,
    redeem_referral,
    get_referral_stats,
)


def test_40_digit_referral_code_format():
    """Verify generated referral code is exactly 40 characters and cryptographically random."""
    code1 = generate_referral_code()
    code2 = generate_referral_code()
    assert len(code1) == 40
    assert len(code2) == 40
    assert code1 != code2
    assert all(c in "0123456789abcdefABCDEF" for c in code1)


def test_referral_subscription_gating_and_attribution():
    """Verify only active subscribed users can generate codes, and codes reward the right user."""
    db_session = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        # 1. Unsubscribed / Free user tries to generate code -> Blocked (403)
        free_user = User(
            public_id=f"FreeStudent_{suffix}",
            plan="free",
            subscription_status="none",
            credits=0.0,
        )
        db_session.add(free_user)
        db_session.commit()
        db_session.refresh(free_user)

        with pytest.raises(Exception) as exc_info:
            create_new_referral_code(db_session, free_user)
        assert "Active subscription required" in str(exc_info.value)

        # 2. Active Pro subscriber generates 40-digit code -> Allowed
        pro_user = User(
            public_id=f"ProScholar_{suffix}",
            plan="pro",
            subscription_status="active",
            credits=50.0,
        )
        db_session.add(pro_user)
        db_session.commit()
        db_session.refresh(pro_user)

        ref = create_new_referral_code(db_session, pro_user)
        assert len(ref.referral_code) == 40
        assert ref.referrer_id == pro_user.id
        assert ref.referee_id is None

        # 3. New student redeems the 40-digit code -> Rewards given correctly
        new_student = User(
            public_id=f"NewStudent_{suffix}",
            plan="basic",
            credits=5.0,
        )
        db_session.add(new_student)
        db_session.commit()
        db_session.refresh(new_student)

        redeem_res = redeem_referral(db_session, ref.referral_code, new_student)
        assert redeem_res["status"] == "success"
        assert redeem_res["bonus_credits"] == 10

        # Check attribution and credit balances
        db_session.refresh(pro_user)
        db_session.refresh(new_student)
        assert pro_user.credits == 90.0  # 50 + 40
        assert new_student.credits == 15.0  # 5 + 10

        # 4. Attempt to reuse the same code -> Blocked (cannot be reused)
        third_student = User(
            public_id=f"ThirdStudent_{suffix}",
            plan="basic",
            credits=0.0,
        )
        db_session.add(third_student)
        db_session.commit()
        db_session.refresh(third_student)

        with pytest.raises(Exception) as exc_info2:
            redeem_referral(db_session, ref.referral_code, third_student)
        assert "already been redeemed and cannot be reused" in str(exc_info2.value)

        # 5. Check stats
        stats = get_referral_stats(db_session, pro_user)
        assert stats["total_issued"] == 1
        assert stats["total_completed"] == 1
        assert stats["is_subscribed"] is True
    finally:
        db_session.close()


def test_admin_endpoints_and_messages_inbox():
    """Verify admin endpoints function correctly with admin authorization."""
    from server.main import app
    client = TestClient(app)

    # Test admin check (BATCH-11: X-Public-ID is never identity — real token)
    from server.security import create_jwt_token
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.public_id == "RoniDev").first()
        if admin is None:
            admin = User(public_id="RoniDev", plan="elite", credits=100.0)
            db.add(admin)
            db.commit()
            db.refresh(admin)
        admin_token = create_jwt_token(user_id=admin.id, role="admin")
        student = db.query(User).filter(User.public_id == "Student_Alice").first()
        if student is None:
            student = User(public_id="Student_Alice", plan="basic", credits=5.0)
            db.add(student)
            db.commit()
            db.refresh(student)
        student_token = create_jwt_token(user_id=student.id, role="user")
    finally:
        db.close()
    res = client.get("/api/admin/check", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.json()["is_admin"] is True

    # Test user sends inquiry to admin
    msg_res = client.post(
        "/api/user/message-admin",
        json={"subject": "Question on tokens", "category": "billing", "message": "How many assignment tokens do I get?"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert msg_res.status_code == 200
    msg_id = msg_res.json()["message_id"]

    # Test admin fetches inquiries
    admin_inbox = client.get("/api/admin/messages", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_inbox.status_code == 200
    msgs = admin_inbox.json()["messages"]
    assert any(m["id"] == msg_id for m in msgs)

    # Test admin replies to inquiry
    reply_res = client.post(
        f"/api/admin/messages/{msg_id}/reply",
        json={"reply": "The Basic plan grants 30 full task tokens per month."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert reply_res.status_code == 200
    assert reply_res.json()["status"] == "replied"

    # Admin routes require JWT auth (hardened require_admin), so mint a token
    from server.security import create_jwt_token
    s = SessionLocal()
    roni = s.query(User).filter(User.public_id == "RoniDev").first()
    assert roni is not None
    admin_headers = {"Authorization": f"Bearer {create_jwt_token(user_id=roni.id, role='admin')}"}
    s.close()

    # Test admin token generation
    token_gen = client.post(
        "/api/admin/tokens/generate",
        json={"duration_days": 14, "max_uses": 5},
        headers=admin_headers,
    )
    assert token_gen.status_code == 200
    token_data = token_gen.json()["token"]
    assert token_data["max_uses"] == 5
    assert token_data["is_active"] is True
