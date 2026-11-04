"""Audit V5-A4-17: GET /api/admin/users is the admin.py handler, and it must
not query per user.

Starlette serves server/admin.py's list_users for /api/admin/users (the router
is included before main.py's same-path route is registered), so the earlier
N+1 fix on main.get_admin_users never applied to the live endpoint. Measured
before this test: 1 + 4N statements (a balance SUM plus three lazy relationship
loads per user) with every assignment/material/transcript row hydrated.
"""
import asyncio
import uuid

from sqlalchemy import event

from server.admin import list_users
from server.database import (
    Assignment,
    CreditTransaction,
    SessionLocal,
    StudyMaterial,
    Transcript,
    User,
    engine,
    init_db,
)
from server.security import create_jwt_token

init_db()


class _Req:
    def __init__(self, token):
        self.headers = {"Authorization": f"Bearer {token}"}
        self.cookies = {}


def _seed(db, n_users=5, per=3):
    tag = uuid.uuid4().hex[:8]
    users = []
    for i in range(n_users):
        u = User(public_id=f"test_au_{tag}_{i}", plan="pro", role="user", settings={})
        db.add(u)
        users.append(u)
    db.commit()
    for i, u in enumerate(users):
        for k in range(per):
            db.add(Assignment(user_id=u.id, title=f"A{k}", prompt="p"))
            db.add(StudyMaterial(user_id=u.id, kind="quiz", content="[]"))
            db.add(Transcript(user_id=u.id, text="hello", source="upload"))
        db.add(CreditTransaction(user_id=u.id, delta=2.0, reason="test"))
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


def test_admin_users_query_count_is_constant():
    db = SessionLocal()
    try:
        users = _seed(db, 6, 3)
        admin = User(public_id=f"test_au_admin_{uuid.uuid4().hex[:6]}", plan="elite", role="admin")
        db.add(admin)
        db.commit()
        req = _Req(create_jwt_token(user_id=admin.id, role="admin"))

        rows, selects = _count_selects(lambda: asyncio.run(list_users(request=req, db=db)))

        assert len(rows) >= len(users)
        # 1 user page + 1 grouped ledger + 3 grouped counts (+ require_admin's
        # own session lookups, which run on a separate SessionLocal).
        assert len(selects) <= 7, [s[:70] for s in selects]
        joined = " ".join(selects).lower()
        ledger_stmts = [s for s in selects if "credit_transactions" in s.lower()]
        assert len(ledger_stmts) == 1, [s[:70] for s in ledger_stmts]
        assert "group by" in ledger_stmts[0].lower()
        assert "group by" in joined

        by_pid = {r["public_id"]: r for r in rows}
        for u in users:
            r = by_pid[u.public_id]
            assert r["assignment_count"] == 3
            assert r["material_count"] == 3
            assert r["transcript_count"] == 3
            assert r["credits"] == 2.0
    finally:
        db.rollback()
        db.close()


def test_admin_users_counts_match_relationship_lengths():
    """The grouped counts must agree with what len(relationship) used to say."""
    db = SessionLocal()
    try:
        users = _seed(db, 3, 2)
        admin = User(public_id=f"test_au_admin2_{uuid.uuid4().hex[:6]}", plan="elite", role="admin")
        db.add(admin)
        db.commit()
        req = _Req(create_jwt_token(user_id=admin.id, role="admin"))
        rows = asyncio.run(list_users(request=req, db=db))
        by_pid = {r["public_id"]: r for r in rows}
        for u in users:
            fresh = db.get(User, u.id)
            assert by_pid[u.public_id]["assignment_count"] == len(fresh.assignments)
            assert by_pid[u.public_id]["material_count"] == len(fresh.materials)
            assert by_pid[u.public_id]["transcript_count"] == len(fresh.transcripts)
    finally:
        db.rollback()
        db.close()
