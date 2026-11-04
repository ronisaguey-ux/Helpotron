"""Audit V5-A4-16: the dashboard payload is a fixed 5-query read.

Measured before this test existed (no code change needed): /api/dashboard's
_build_dashboard_payload issues exactly 5 SELECTs regardless of how many
assignments/materials/ledger rows the user has — assignments page, materials
page, ledger page, the ledger SUM for the displayed balance, and the
ApiUsageLog token SUM. Nothing is aggregated per row in Python. This test pins
that so a future "count per assignment" cannot slip in unnoticed.
"""
import uuid

from sqlalchemy import event, text

from server.database import (
    ApiUsageLog,
    Assignment,
    CreditTransaction,
    SessionLocal,
    StudyMaterial,
    User,
    engine,
    init_db,
)
from server.main import _build_dashboard_payload

init_db()


def _seed(db, n):
    tag = uuid.uuid4().hex[:8]
    u = User(public_id=f"test_dash_{tag}", plan="pro", role="user", settings={})
    db.add(u)
    db.commit()
    for i in range(n):
        db.add(Assignment(user_id=u.id, title=f"A{i}", prompt="p"))
        db.add(StudyMaterial(user_id=u.id, kind="flashcards" if i % 2 else "quiz", content="[]"))
        db.add(CreditTransaction(user_id=u.id, delta=-1.0, reason="test"))
    db.add(ApiUsageLog(user_id=u.id, public_id=u.public_id, tool_or_model="t",
                       input_tokens=10, output_tokens=5,
                       base_cost_usd=0.001, charged_cost_usd=0.001))
    db.commit()
    return u


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


def test_dashboard_query_count_is_constant():
    db = SessionLocal()
    try:
        small = _seed(db, 1)
        _, hits_small = _count_selects(lambda: _build_dashboard_payload(small, db))
        big = _seed(db, 40)
        payload, hits_big = _count_selects(lambda: _build_dashboard_payload(big, db))

        assert len(hits_small) == 5, [s[:60] for s in hits_small]
        assert len(hits_big) == len(hits_small), [s[:60] for s in hits_big]
        # every read is a page/sum, never a per-row aggregate
        joined = " ".join(hits_big).lower()
        assert joined.count("sum(") == 2
        assert "credit_transactions" in joined and "api_usage_logs" in joined
        assert payload["status"] == "success"
        assert payload["user"]["tokens_processed"] == 15
        assert len(payload["assignments"]) == 40
        assert len(payload["recent_transactions"]) == 20  # capped, not the full ledger
    finally:
        db.rollback()
        db.close()


def test_dashboard_hot_queries_use_indexes():
    plans = {
        "assignments": "SELECT * FROM assignments WHERE user_id=1 ORDER BY id DESC LIMIT 50",
        "materials": "SELECT * FROM study_materials WHERE user_id=1 ORDER BY id DESC LIMIT 50",
        "ledger_page": "SELECT * FROM credit_transactions WHERE user_id=1 ORDER BY id DESC LIMIT 20",
        "ledger_sum": "SELECT coalesce(sum(delta),0) FROM credit_transactions WHERE user_id=1",
        "usage_sum": "SELECT coalesce(sum(input_tokens+output_tokens),0) FROM api_usage_logs WHERE public_id='x'",
    }
    with engine.connect() as conn:
        for name, sql in plans.items():
            plan = " ".join(str(r[3]) for r in conn.execute(text("EXPLAIN QUERY PLAN " + sql)))
            assert "SCAN" not in plan.upper(), f"{name}: {plan}"
            assert "ix_" in plan, f"{name}: {plan}"
