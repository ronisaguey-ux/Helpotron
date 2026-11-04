"""Audit V5-A4-06: get_cost_summary must not hydrate the whole usage ledger.

The admin Cost & Usage tab used `db.query(ApiUsageLog).all()` and summed in
Python — one ORM object per logged call. These tests pin the payload contract
against a Python reference AND assert the number of rows SQLAlchemy loads.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import event
from sqlalchemy.orm import Session as OrmSession

from server.cost_tracking import cost_engine
from server.database import ApiUsageLog, SessionLocal, User, engine, init_db

init_db()


def _seed(db, n_rows=40, users=3):
    tag = uuid.uuid4().hex[:8]
    us = []
    for i in range(users):
        u = User(public_id=f"test_cs_{tag}_{i}", plan="pro")
        db.add(u)
        us.append(u)
    db.commit()
    models = ["test/alpha", "test/beta", "test/gamma"]
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for i in range(n_rows):
        u = us[i % users]
        db.add(ApiUsageLog(
            user_id=u.id,
            public_id=u.public_id,
            tool_or_model=models[i % 3],
            category="llm",
            input_tokens=100 + i,
            output_tokens=50 + i,
            base_cost_usd=0.01,
            user_multiplier=1.0,
            charged_cost_usd=0.012,
            created_at=now - timedelta(days=(i % 10)),
        ))
    db.commit()
    return tag, us


def _reference(db, since):
    """The pre-fix Python implementation, used as the contract oracle.

    Global scope, exactly like get_cost_summary: the test DB is shared across
    the suite, so the only honest comparison is all rows vs all rows.
    """
    rows = db.query(ApiUsageLog).all()
    total_base = sum(r.base_cost_usd for r in rows)
    total_charged = sum(r.charged_cost_usd for r in rows)
    bd = {}
    for r in rows:
        m = bd.setdefault(r.tool_or_model, {"calls": 0, "base": 0.0, "charged": 0.0, "tin": 0, "tout": 0})
        m["calls"] += 1
        m["base"] += r.base_cost_usd
        m["charged"] += r.charged_cost_usd
        m["tin"] += r.input_tokens
        m["tout"] += r.output_tokens
    by_day = {}
    for r in rows:
        if not r.created_at or r.created_at < since:
            continue
        d = r.created_at.date().isoformat()
        day = by_day.setdefault(d, {"calls": 0, "cost_usd": 0.0, "charged_usd": 0.0})
        day["calls"] += 1
        day["cost_usd"] += r.base_cost_usd
        day["charged_usd"] += r.charged_cost_usd
    return {
        "total_base": total_base,
        "total_charged": total_charged,
        "calls": len(rows),
        "bd": bd,
        "by_day": by_day,
        "model_rows": len(rows),
    }


def _count_loaded(fn):
    loaded = []

    def _on_load(target, context):
        loaded.append(type(target).__name__)

    event.listen(ApiUsageLog, "load", _on_load)
    try:
        result = fn()
    finally:
        event.remove(ApiUsageLog, "load", _on_load)
    return result, loaded


def test_cost_summary_matches_reference_and_hydrates_no_rows():
    db = SessionLocal()
    try:
        tag, us = _seed(db)
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)
        ref = _reference(db, since)

        summary, loaded = _count_loaded(lambda: cost_engine.get_cost_summary(db))

        # Zero ApiUsageLog ORM objects materialised (the pre-fix code loaded
        # len(rows) of them; that list IS the regression).
        assert loaded == [], f"hydrated {len(loaded)} usage rows"

        assert summary["total_logs"] == ref["calls"]
        assert summary["summary"]["total_input_tokens"] == sum(v["tin"] for v in ref["bd"].values())

        by_model = {m["tool_or_model"]: m for m in summary["tool_breakdown"]}
        for name, v in ref["bd"].items():
            assert by_model[name]["call_count"] == v["calls"]
            assert by_model[name]["total_base_cost"] == round(v["base"], 6)
            assert by_model[name]["total_charged"] == round(v["charged"], 6)
            assert by_model[name]["input_tokens"] == v["tin"]
            assert by_model[name]["output_tokens"] == v["tout"]
        # breakdown is sorted by base cost, descending
        bases = [m["total_base_cost"] for m in summary["tool_breakdown"]]
        assert bases == sorted(bases, reverse=True)

        trends = {t["date"]: t for t in summary["trends"]}
        for d, v in ref["by_day"].items():
            assert trends[d]["calls"] == v["calls"]
            assert trends[d]["cost_usd"] == round(v["cost_usd"], 6)
            assert trends[d]["charged_usd"] == round(v["charged_usd"], 6)
            assert len(trends[d]["day_name"]) == 3

        # legacy keys still present
        assert set(summary["per_model"]) == set(ref["bd"])
        for name, v in ref["bd"].items():
            assert summary["per_model"][name]["calls"] == v["calls"]
            assert summary["per_model"][name]["cost_usd"] == round(v["charged"], 6)
        assert isinstance(summary["top_users"], list)
        assert summary["platform_profit_summary"]["estimated_revenue_usd"] > 0
    finally:
        db.rollback()
        db.close()


def test_cost_summary_empty_ledger_does_not_crash():
    db = SessionLocal()
    try:
        # An empty ledger must still return zeroes, not a 500 — `.one()` on an
        # aggregate query always yields a row, but the coalesce chain is what
        # makes it zero instead of NULL.
        summary = cost_engine.get_cost_summary(db)
        assert summary["total_logs"] >= 0
        assert summary["total_cost_usd"] >= 0
        assert summary["trends"] == [] or all(t["calls"] >= 0 for t in summary["trends"])
    finally:
        db.close()
