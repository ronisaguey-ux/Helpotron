"""Audit V5-A4-07: /api/admin/costs/users must not aggregate per user.

Before the fix the endpoint ran three aggregate statements for EVERY user row
(count + sum(base) + sum(charged)), so a 200-user box meant 601 SQLite
round trips for one admin page load. The grouped query below is constant-cost.
"""
import uuid

from sqlalchemy import event

from server.database import ApiUsageLog, SessionLocal, User, engine, init_db
from server.routes_admin_advanced import get_admin_users_costs
from server.security import create_jwt_token

init_db()


class _Req:
    """Minimal Request stand-in for require_admin (headers/cookies only)."""

    def __init__(self, token: str):
        self.headers = {"Authorization": f"Bearer {token}"}
        self.cookies = {}


def _seed(db, n=6, rows=3):
    tag = uuid.uuid4().hex[:8]
    users = []
    for i in range(n):
        u = User(public_id=f"test_cost_{tag}_{i}", plan="pro", role="user")
        db.add(u)
        users.append(u)
    db.commit()
    for i, u in enumerate(users):
        for r in range(rows):
            db.add(ApiUsageLog(
                user_id=u.id,
                public_id=u.public_id,
                tool_or_model="test/model",
                category="llm",
                input_tokens=100,
                output_tokens=50,
                base_cost_usd=0.01,
                user_multiplier=1.0,
                charged_cost_usd=0.01,
            ))
    db.commit()
    return users


def _count_selects(fn):
    hits = []

    def _on(conn, cursor, statement, *a, **kw):
        if statement.lstrip().upper().startswith("SELECT"):
            hits.append(statement)

    event.listen(engine, "before_cursor_execute", _on)
    try:
        result = fn()
    finally:
        event.remove(engine, "before_cursor_execute", _on)
    return result, hits


def test_costs_users_aggregates_once():
    db = SessionLocal()
    try:
        users = _seed(db)
        admin = User(public_id=f"test_cost_admin_{uuid.uuid4().hex[:6]}", plan="elite", role="admin")
        db.add(admin)
        db.commit()
        req = _Req(create_jwt_token(user_id=admin.id, role="admin"))

        payload, selects = _count_selects(lambda: _call(req, db))
        assert payload["status"] == "success"

        ledger_selects = [s for s in selects if "api_usage_logs" in s]
        assert len(ledger_selects) == 1, f"expected one ledger aggregate, got {len(ledger_selects)}"
        assert "GROUP BY" in ledger_selects[0].upper() or "group by" in ledger_selects[0]
        # 1 user list + 1 grouped ledger + require_admin's own session lookup(s)
        assert len(selects) <= 5, selects

        by_pid = {row["public_id"]: row for row in payload["users"]}
        for u in users:
            row = by_pid[u.public_id]
            assert row["total_calls"] == 3
            assert row["total_cost_usd"] == round(0.03, 6)
            assert row["total_charged_usd"] == round(0.03, 6)
            assert row["estimated_revenue_usd"] == 20.00
            assert row["estimated_profit_usd"] == round(20.00 - 0.03, 2)
    finally:
        db.rollback()
        db.close()


def test_costs_users_user_without_usage():
    db = SessionLocal()
    try:
        tag = uuid.uuid4().hex[:6]
        admin = User(public_id=f"test_cost_admin2_{tag}", plan="elite", role="admin")
        quiet = User(public_id=f"test_cost_quiet_{tag}", plan="free", role="user")
        db.add_all([admin, quiet])
        db.commit()
        req = _Req(create_jwt_token(user_id=admin.id, role="admin"))
        payload = _call(req, db)
        row = next(r for r in payload["users"] if r["public_id"] == quiet.public_id)
        assert row["total_calls"] == 0
        assert row["total_cost_usd"] == 0.0
        assert row["estimated_revenue_usd"] == 10.00
    finally:
        db.rollback()
        db.close()


def _call(req, db):
    import asyncio
    return asyncio.run(get_admin_users_costs(request=req, db=db))
