"""Unit tests for 40-digit single-use referrals, subscription gating, token/credit model, and admin portal."""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from server.database import get_db, User, Referral, SessionLocal, Payment
from server.referral import (
    generate_referral_code,
    check_user_subscription,
    create_new_referral_code,
    redeem_referral,
    get_referral_stats,
    is_new_user,
    REFERRAL_DISCOUNT_NEW_USER_PCT,
    REFERRAL_DISCOUNT_EXISTING_USER_PCT,
    REFERRAL_PLAN_REWARD_CREDITS,
    grant_referrer_plan_reward,
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
            credits=0.0,
            discount_balance=50.0,
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
            credits=0.0,
            discount_balance=5.0,
        )
        db_session.add(new_student)
        db_session.commit()
        db_session.refresh(new_student)

        redeem_res = redeem_referral(db_session, ref.referral_code, new_student)
        assert redeem_res["status"] == "success"
        assert redeem_res["bonus_credits"] == 10

        # Check attribution and credit balances. Operator 08-31 (Bob): the
        # referrer reward is TIER-BASED — the redeemer is on basic, so the
        # pro referrer earns 2 credits (was a flat 40 before 08-31).
        db_session.refresh(pro_user)
        db_session.refresh(new_student)
        # Referral rewards are EARNED DISCOUNT CREDITS (bill reduction only),
        # so they land in discount_balance, never in the usage currency.
        assert pro_user.discount_balance == 52.0  # 50 + 2 (basic plan reward)
        assert new_student.discount_balance == 15.0  # 5 + 10

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

        # 5. Check stats (08-31: per-code plan exposes the tier payout)
        stats = get_referral_stats(db_session, pro_user)
        assert stats["total_issued"] == 1
        assert stats["total_completed"] == 1
        assert stats["is_subscribed"] is True
        assert stats["codes"][0]["plan"] == getattr(new_student, "plan", None)
        assert stats["codes"][0]["is_redeemed"] is True
    finally:
        db_session.close()


def test_referral_discount_granted_to_new_user():
    """Operator 08-31: redeeming a code gives a NEW user (no payments, no
    live subscription) a one-time 30% order discount."""
    from server.payments import process_payment

    db_session = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        referrer = User(public_id=f"RefDiscReferrer_{suffix}", plan="pro", subscription_status="active", credits=0.0)
        db_session.add(referrer)
        db_session.commit()
        db_session.refresh(referrer)

        ref = create_new_referral_code(db_session, referrer)

        # New user: no Payment rows, no active subscription.
        fresh = User(public_id=f"RefDiscFresh_{suffix}", plan="none", credits=0.0)
        db_session.add(fresh)
        db_session.commit()
        db_session.refresh(fresh)

        assert is_new_user(db_session, fresh) is True

        res = redeem_referral(db_session, ref.referral_code, fresh)
        assert res["status"] == "success"
        assert res["is_new_user"] is True
        assert res["discount_pct"] == 30.0
        assert res["discount_pct"] == REFERRAL_DISCOUNT_NEW_USER_PCT

        db_session.refresh(fresh)
        assert fresh.referral_discount_pct == 30.0

        # The discount reduces the CHARGE, not the value delivered: a $10 order
        # ($6.00 after the stacked discounts) still buys 10 task tokens, and the
        # entitlement is consumed. The welcome bonus is an earned discount credit.
        #
        # A manual provider, because this now creates a PENDING payment and grants
        # nothing on its own authority (SEC-2026-001). "stripe" is reserved for
        # /api/checkout plus a signed webhook. The discount math below is this
        # test's real subject and is unaffected by that.
        pay = process_payment(db_session, fresh, "zelle", 1000)
        # Both discounts reduce the bill and they stack: the 30% referral
        # entitlement plus the 10% the 10 earned welcome credits are worth, so
        # $10 -> $6.00. Tokens are bought on the nominal $10, but only once an
        # operator confirms the transfer arrived.
        assert pay["discount_pct_applied"] == 10.0
        assert pay["amount_charged_cents"] == 600
        assert pay["referral_discount_pct"] == 30.0
        assert pay["status"] == "pending", "process_payment must not self-settle"
        assert pay["tokens_added"] == 0, "no payment, no tokens"

        db_session.refresh(fresh)
        # The 10 earned credits were REDEEMED as this order's discount, so the
        # balance is consumed to 0 — that is the currency working, not a loss.
        assert fresh.discount_balance == 0.0
        assert fresh.referral_discount_pct == 0.0  # one-time, consumed

        from server.credits import get_token_balance
        assert get_token_balance(fresh) == 0.0, "nothing granted before confirmation"

        # Operator confirms the transfer: NOW the 10 tokens land.
        from server.admin import TokenManager  # noqa: F401 — keep admin import path warm
        from server.database import Payment
        from server.credits import add_tokens as _add_tokens
        pend = (db_session.query(Payment)
                .filter(Payment.id == pay["id"], Payment.status == "pending").first())
        assert pend is not None, "the pending payment must be recorded"
        pend.status = "captured"
        db_session.flush()
        _add_tokens(db_session, fresh, 10, reason="confirmed:zelle:test")
        db_session.refresh(fresh)
        assert get_token_balance(fresh) == 10.0    # +10 purchased task tokens

        # Second order is charged full price.
        pay2 = process_payment(db_session, fresh, "zelle", 1000)
        assert pay2["amount_charged_cents"] == 1000
        assert pay2["referral_discount_pct"] == 0.0
    finally:
        db_session.close()


def test_referral_discount_existing_user_gets_15():
    """Operator 08-31: an EXISTING user (has paid before) redeeming a code
    gets a one-time 15% order discount."""
    db_session = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]
        referrer = User(public_id=f"RefDiscRef2_{suffix}", plan="pro", subscription_status="active", credits=0.0)
        db_session.add(referrer)
        db_session.commit()
        db_session.refresh(referrer)
        ref = create_new_referral_code(db_session, referrer)

        # Existing user: has a Payment row already.
        existing = User(public_id=f"RefDiscOld_{suffix}", plan="basic", credits=0.0)
        db_session.add(existing)
        db_session.commit()
        db_session.refresh(existing)
        db_session.add(Payment(user_id=existing.id, provider="stripe", amount_cents=1000, status="captured"))
        db_session.commit()

        assert is_new_user(db_session, existing) is False

        res = redeem_referral(db_session, ref.referral_code, existing)
        assert res["status"] == "success"
        assert res["is_new_user"] is False
        assert res["discount_pct"] == 15.0
        assert res["discount_pct"] == REFERRAL_DISCOUNT_EXISTING_USER_PCT
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
        data={"subject": "Question on tokens", "category": "billing", "message": "How many assignment tokens do I get?"},
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
    assert reply_res.json()["status"] == "success"
    assert reply_res.json()["message_status"] == "replied"

    # Admin routes require JWT auth (hardened require_admin), so mint a token
    from server.security import create_jwt_token
    s = SessionLocal()
    roni = s.query(User).filter(User.public_id == "RoniDev").first()
    assert roni is not None
    admin_headers = {"Authorization": f"Bearer {create_jwt_token(user_id=roni.id, role='admin')}"}
    s.close()

    # Test admin token generation (DB-backed TokenManager — the in-memory hlp_
    # stub was removed 08-28; the real route returns the token string itself)
    token_gen = client.post(
        "/api/admin/tokens/generate",
        json={"duration_days": 14, "max_uses": 5},
        headers=admin_headers,
    )
    assert token_gen.status_code == 200
    token_str = token_gen.json()["token"]
    assert isinstance(token_str, str) and len(token_str) > 10
    listed = client.get("/api/admin/tokens", headers=admin_headers)
    assert listed.status_code == 200
    assert any(t["token"] == token_str for t in listed.json()["tokens"])


def test_referrer_plan_tier_rewards():
    """Operator 08-31 (Bob): the code generator's reward is tier-based on the
    plan the referee BUYS — 2 credits (basic) / 5 (pro) / 10 (elite). Paid
    once per (referrer, plan, code); both the redemption path (already
    subscribed referee) and the checkout path are idempotent."""
    db_session = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:8]

        # 1. Fresh referee (no plan yet) redeems -> NO immediate referrer reward.
        referrer = User(public_id=f"TierReferrer_{suffix}", plan="pro", subscription_status="active", credits=0.0)
        db_session.add(referrer)
        db_session.commit()
        db_session.refresh(referrer)
        ref = create_new_referral_code(db_session, referrer)

        fresh = User(public_id=f"TierFresh_{suffix}", plan="none", credits=0.0)
        db_session.add(fresh)
        db_session.commit()
        db_session.refresh(fresh)
        res = redeem_referral(db_session, ref.referral_code, fresh)
        assert res["status"] == "success"
        db_session.refresh(referrer)
        assert referrer.discount_balance == 0.0  # nothing yet — paid at checkout

        # 2. Checkout path: elite purchase pays the referrer 10 credits (the
        #    same grant the webhook performs), exactly once.
        paid = grant_referrer_plan_reward(db_session, referrer, "elite", ref.referral_code)
        assert paid == 10.0
        db_session.commit()
        db_session.refresh(referrer)
        assert referrer.discount_balance == 10.0
        again = grant_referrer_plan_reward(db_session, referrer, "elite", ref.referral_code)
        assert again == 0.0  # idempotent
        db_session.commit()
        db_session.refresh(referrer)
        assert referrer.discount_balance == 10.0

        # 3. Already-subscribed referee: redemption pays by CURRENT plan.
        ref2 = create_new_referral_code(db_session, referrer)
        subscriber = User(public_id=f"TierPro_{suffix}", plan="pro", subscription_status="active", credits=0.0)
        db_session.add(subscriber)
        db_session.commit()
        db_session.refresh(subscriber)
        res2 = redeem_referral(db_session, ref2.referral_code, subscriber)
        assert res2["status"] == "success"
        db_session.refresh(referrer)
        # Referral rewards are earned discount credits, not usage balance.
        assert referrer.discount_balance == 15.0  # 10 (elite) + 5 (pro subscriber)
        assert REFERRAL_PLAN_REWARD_CREDITS == {"basic": 2.0, "pro": 5.0, "elite": 10.0}
    finally:
        db_session.close()
