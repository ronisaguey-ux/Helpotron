"""The admin cost summary must aggregate in SQL, not load the whole ledger.

`get_cost_summary` is the admin Cost & Usage tab. It used to do
`db.query(ApiUsageLog).all()` twice — once for totals/breakdown, again for
`per_model` — and the ledger takes one row per billed call, so page load cost
grew with total history forever and held every ORM object at once.

These tests pin two things: the numbers are still right (including the 7-day
trend window boundary), and no statement issued by the summary returns the
whole table.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_cost_summary.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters!")

import pytest
from sqlalchemy import event

from server.cost_tracking import cost_engine
from server.database import ApiUsageLog, Base, SessionLocal, User, engine


@pytest.fixture()
def db():
    Base.metadata.create_all(engine)
    session = SessionLocal()
    public_id = f"costsum-{uuid.uuid4().hex[:10]}"
    session.add(User(public_id=public_id, plan="pro", credits=0.0, role="user", settings={}))
    session.commit()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # In-window rows and one well outside it, so the trend window is exercised.
    rows = [
        ("deepseek/deepseek-v4.1-flash", "llm", 1000, 200, 0.0003, 0.012, now),
        ("deepseek/deepseek-v4.1-flash", "llm", 2000, 400, 0.0006, 0.024, now - timedelta(days=1)),
        ("google/gemini-3.8-flash", "llm", 500, 100, 0.0020, 0.008, now - timedelta(days=2)),
        ("pangram", "detector", 0, 0, 0.0020, 0.0020, now - timedelta(days=20)),
    ]
    for model, cat, tin, tout, base, charged, ts in rows:
        session.add(ApiUsageLog(
            public_id=public_id, tool_or_model=model, category=cat,
            input_tokens=tin, output_tokens=tout,
            base_cost_usd=base, charged_cost_usd=charged,
            user_multiplier=1.0, metadata_={}, created_at=ts,
        ))
    session.commit()
    try:
        yield session, public_id, len(rows)
    finally:
        session.query(ApiUsageLog).filter(ApiUsageLog.public_id == public_id).delete()
        session.query(User).filter(User.public_id == public_id).delete()
        session.commit()
        session.close()


def _statements_issued(session, fn):
    """Run fn and return every SQL statement SQLAlchemy actually executed."""
    seen = []

    def _before(conn, cursor, statement, params, context, executemany):
        seen.append(statement)

    eng = session.get_bind()
    event.listen(eng, "before_cursor_execute", _before)
    try:
        result = fn()
    finally:
        event.remove(eng, "before_cursor_execute", _before)
    return result, seen


def test_summary_totals_and_breakdown_are_correct(db):
    session, public_id, expected_calls = db
    summary = cost_engine.get_cost_summary(session)

    assert summary["total_logs"] == expected_calls
    assert summary["total_cost_usd"] == pytest.approx(0.0049, abs=1e-9)
    assert summary["total_charged_usd"] == pytest.approx(0.046, abs=1e-9)
    assert summary["summary"]["total_input_tokens"] == 3500
    assert summary["summary"]["total_output_tokens"] == 700

    by_model = {r["tool_or_model"]: r for r in summary["tool_breakdown"]}
    assert set(by_model) == {"deepseek/deepseek-v4.1-flash", "google/gemini-3.8-flash", "pangram"}
    assert by_model["deepseek/deepseek-v4.1-flash"]["call_count"] == 2
    assert by_model["deepseek/deepseek-v4.1-flash"]["input_tokens"] == 3000
    # per_model is the same grouping and must agree row for row
    assert summary["per_model"]["pangram"]["calls"] == 1
    assert summary["per_model"]["pangram"]["cost_usd"] == pytest.approx(0.002, abs=1e-9)


def test_trend_window_excludes_older_rows_but_totals_keep_them(db):
    session, public_id, _ = db
    summary = cost_engine.get_cost_summary(session)
    assert sum(t["calls"] for t in summary["trends"]) == 3, (
        "the 20-day-old row must not appear in the 7-day trend, but must still "
        "count in total_logs"
    )
    assert summary["total_logs"] == 4


def test_summary_never_loads_the_whole_table(db):
    """No statement may select raw api_usage_logs ROWS without a bound.

    An aggregate-only SELECT (count/sum) is one row and is fine; selecting a
    bare column is what materialises every row, so that is what is forbidden
    without a WHERE or GROUP BY.
    """
    import re

    session, public_id, _ = db
    _summary, statements = _statements_issued(
        session, lambda: cost_engine.get_cost_summary(session)
    )
    offenders = []
    for stmt in statements:
        low = " ".join(stmt.lower().split())
        if "from api_usage_logs" not in low:
            continue
        if "group by" in low or "where" in low:
            continue
        # Bare (non-aggregated) column in the select list => row materialisation
        if re.search(r"select (distinct )?api_usage_logs\.", low):
            offenders.append(low[:160])
    assert not offenders, (
        "get_cost_summary issued an unbounded full-table scan of api_usage_logs: "
        f"{offenders}"
    )
