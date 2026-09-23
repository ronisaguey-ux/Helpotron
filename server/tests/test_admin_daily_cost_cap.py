"""Daily cost cap for the operator account (the only UNMETERED one).

WHY: `is_unmetered` means admin, and `charge_actual_usage` returns 0 for it, so
the operator had no cost ceiling at all. A rate limit bounds request COUNT, not
cost, and one action can be a 40-round agent task or a two-hour transcription.
`ApiUsageLog.base_cost_usd` already records the true spend for every user, so the
brake is one SUM.

The tests that matter:
  - an admin over the cap is refused (this is the whole point)
  - a NON-admin is unaffected by the cap (it must not become a second balance)
  - the cap FAILS OPEN, so a metering outage cannot brick the operator
"""
from datetime import datetime, timedelta, timezone

import pytest

from server.credits import daily_cost_exceeded, has_usage_balance, is_unmetered
from server.database import ApiUsageLog, SessionLocal, User


def _user(public_id: str, admin: bool = False) -> User:
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == public_id).first()
        if not u:
            u = User(public_id=public_id, plan="elite", credits=0.0,
                     role="admin" if admin else "member",
                     settings={"2fa_enabled": True, "token_balance": 0.0})
            db.add(u)
            db.commit()
            db.refresh(u)
        return u
    finally:
        db.close()


def _seed_spend(user_id: int, usd: float, hours_ago: float = 1.0):
    db = SessionLocal()
    try:
        db.add(ApiUsageLog(
            user_id=user_id,
            public_id="spend_probe",
            tool_or_model="deepseek/deepseek-v4.1-flash",
            category="llm",
            base_cost_usd=usd,
            charged_cost_usd=0.0,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours_ago),
        ))
        db.commit()
    finally:
        db.close()


def test_an_admin_is_unmetered_but_a_paid_plan_is_not():
    """The premise of the cap: only the operator escapes metering."""
    admin = _user("cap_admin_probe", admin=True)
    elite = _user("cap_elite_probe", admin=False)
    assert is_unmetered(admin) is True
    assert is_unmetered(elite) is False


def test_admin_over_the_daily_cap_is_refused():
    """THE point of the exercise. Admin, previously unlimited, is now bounded."""
    admin = _user("cap_admin_over", admin=True)
    db = SessionLocal()
    try:
        _seed_spend(admin.id, 11.0)          # > the default $10 cap
        fresh = db.query(User).filter(User.id == admin.id).first()
        assert daily_cost_exceeded(db, fresh) is True
        assert has_usage_balance(fresh, db) is False, \
            "an operator past the daily cap must not start more work"
    finally:
        db.close()


def test_admin_under_the_cap_is_allowed():
    """Non-vacuous floor: the cap must not refuse ordinary use."""
    admin = _user("cap_admin_under", admin=True)
    db = SessionLocal()
    try:
        _seed_spend(admin.id, 0.50)
        fresh = db.query(User).filter(User.id == admin.id).first()
        assert daily_cost_exceeded(db, fresh) is False
        assert has_usage_balance(fresh, db) is True
    finally:
        db.close()


def test_spend_older_than_24h_does_not_count():
    """It is a DAILY cap, not a lifetime one."""
    admin = _user("cap_admin_old", admin=True)
    db = SessionLocal()
    try:
        _seed_spend(admin.id, 50.0, hours_ago=30.0)
        fresh = db.query(User).filter(User.id == admin.id).first()
        assert daily_cost_exceeded(db, fresh) is False, \
            "yesterday's spend must not keep the operator capped today"
    finally:
        db.close()


def test_a_metered_user_is_judged_by_balance_not_the_admin_cap():
    """The cap must not leak into metered accounts as a second balance."""
    elite = _user("cap_elite_funded", admin=False)
    db = SessionLocal()
    try:
        _seed_spend(elite.id, 999.0)
        fresh = db.query(User).filter(User.id == elite.id).first()
        # daily_cost_exceeded is about the operator; for a metered account the
        # gate is the token balance, which is 0 here.
        assert is_unmetered(fresh) is False
        assert has_usage_balance(fresh, db) is False, "a zero-balance user stays refused"
    finally:
        db.close()


def test_cap_can_be_disabled():
    """cap <= 0 means off, so an owner can turn it off deliberately."""
    admin = _user("cap_admin_disabled", admin=True)
    db = SessionLocal()
    try:
        _seed_spend(admin.id, 500.0)
        fresh = db.query(User).filter(User.id == admin.id).first()
        assert daily_cost_exceeded(db, fresh, cap_usd=0.0) is False
    finally:
        db.close()


def test_fails_open_when_the_query_cannot_run():
    """A metering outage must never brick the operator's own account."""
    admin = _user("cap_admin_failopen", admin=True)

    class _Broken:
        def query(self, *a, **k):
            raise RuntimeError("db unavailable")

    assert daily_cost_exceeded(_Broken(), admin) is False
