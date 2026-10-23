"""Tests proving V3-A4-02: high-frequency composite indexes and init_db migration correctness."""
from sqlalchemy import text
from server.database import (
    engine,
    init_db,
    Assignment,
    UniversalDumpItem,
    CalendarEntry,
    StudyMaterial,
)


def test_composite_indexes_exist_in_db():
    init_db()
    with engine.connect() as conn:
        indices = conn.execute(
            text("SELECT name, tbl_name FROM sqlite_master WHERE type='index'")
        ).fetchall()
        index_names = {row[0] for row in indices}

        assert "ix_assignments_user_created" in index_names
        assert "ix_universal_dump_items_user_created" in index_names
        assert "ix_universal_dump_items_user_matched" in index_names
        assert "ix_study_materials_user_created" in index_names
        assert "ix_calendar_entries_user_date" in index_names
        assert "ix_calendar_entries_upcoming" in index_names


def test_assignment_cards_query_plan_uses_composite_index():
    init_db()
    with engine.connect() as conn:
        plan = conn.execute(
            text("EXPLAIN QUERY PLAN SELECT * FROM assignments WHERE user_id = 1 ORDER BY created_at DESC")
        ).fetchall()
        plan_str = " ".join(str(p) for p in plan)
        assert "ix_assignments_user_created" in plan_str
