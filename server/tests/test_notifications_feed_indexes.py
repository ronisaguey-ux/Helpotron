"""Audit V5-A4-08: notification-feed queries must be index-ordered.

The feed (GET /api/notifications, polled by every open tab) runs three
`ORDER BY <time> DESC LIMIT n` reads. With only single-column user_id indexes
SQLite answered each with a full scan of that user's rows plus a temp B-tree
sort — the whole history, sorted, to return 50 items.

These tests assert the composite indexes exist on a migrated DB and that the
planner stops sorting.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from server.database import AdminNotice, AgentAction, Draft, SessionLocal, User, engine, init_db

init_db()


PLANS = {
    "drafts": "SELECT * FROM drafts WHERE user_id=1 ORDER BY updated_at DESC LIMIT 25",
    "agent_actions": (
        "SELECT * FROM agent_actions WHERE user_id=1 AND status='done' "
        "ORDER BY created_at DESC LIMIT 25"
    ),
    "notices_direct": (
        "SELECT * FROM admin_notices WHERE user_id='x' AND broadcast=0 "
        "ORDER BY created_at DESC LIMIT 50"
    ),
    "notices_broadcast": (
        "SELECT * FROM admin_notices WHERE broadcast=1 ORDER BY created_at DESC LIMIT 50"
    ),
}


def _plan(sql):
    with engine.connect() as conn:
        rows = conn.execute(text("EXPLAIN QUERY PLAN " + sql)).fetchall()
    return " | ".join(str(r[3]) for r in rows)


def test_feed_indexes_exist():
    with engine.connect() as conn:
        names = {
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='index'")
            ).fetchall()
        }
    for expected in (
        "ix_drafts_user_updated",
        "ix_agent_actions_user_status_created",
        "ix_admin_notices_user_broadcast_created",
        "ix_admin_notices_broadcast_created",
    ):
        assert expected in names, expected


def test_feed_queries_do_not_sort():
    for name, sql in PLANS.items():
        plan = _plan(sql)
        assert "TEMP B-TREE FOR ORDER BY" not in plan.upper(), f"{name}: {plan}"
        assert "ix_" in plan, f"{name} fell back to a scan: {plan}"


def test_feed_returns_newest_first_across_all_three_sources():
    """Behavioural check: the new indexes must not change feed ordering."""
    from server.routes_notifications import get_notifications
    import asyncio

    db = SessionLocal()
    try:
        tag = uuid.uuid4().hex[:8]
        u = User(public_id=f"test_feed_{tag}", plan="free", role="user")
        db.add(u)
        db.commit()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add_all([
            Draft(user_id=u.id, assignment_id=1, status="ready",
                  created_at=now - timedelta(hours=3), updated_at=now - timedelta(hours=3)),
            AgentAction(user_id=u.id, action_type="create_assignment", summary="did a thing",
                        status="done", created_at=now - timedelta(hours=2)),
            AdminNotice(user_id=u.public_id, subject="Hi", message="direct",
                        broadcast=False, created_at=now - timedelta(hours=1)),
        ])
        db.commit()

        feed = asyncio.run(get_notifications(limit=50, user=u, db=db))
        stamps = [n["created_at"] for n in feed["notifications"] if n["created_at"]]
        own = [n for n in feed["notifications"] if n["type"] in ("draft", "agent", "notice", "broadcast")]
        assert own, feed
        assert stamps == sorted(stamps, reverse=True)
        assert feed["total"] >= 3
    finally:
        db.rollback()
        db.close()
