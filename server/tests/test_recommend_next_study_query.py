"""Audit V5-A4-09: the study recommendation must not count per assignment.

recommend_next_study used to run `SELECT count(*) FROM study_materials WHERE
assignment_id=?` once per assignment — N+1 on a user's whole course load for a
single recommendation string.
"""
import uuid

from sqlalchemy import event

from server.database import Assignment, SessionLocal, StudyMaterial, User, engine, init_db
from server.features import recommend_next_study

init_db()


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


def _user(db, n_assignments=1):
    tag = uuid.uuid4().hex[:8]
    u = User(public_id=f"test_rec_{tag}", plan="free", role="user")
    db.add(u)
    db.commit()
    rows = []
    for i in range(n_assignments):
        a = Assignment(user_id=u.id, title=f"Coursework {i}", prompt="p")
        db.add(a)
        rows.append(a)
    db.commit()
    return u, rows


def test_query_count_is_constant_in_assignments():
    db = SessionLocal()
    try:
        u1, as1 = _user(db, 3)
        db.add(StudyMaterial(user_id=u1.id, assignment_id=as1[0].id, kind="flashcards", content="[]"))
        db.commit()
        _, hits_small = _count_selects(lambda: recommend_next_study(u1, db))

        u2, as2 = _user(db, 12)
        db.add(StudyMaterial(user_id=u2.id, assignment_id=as2[0].id, kind="flashcards", content="[]"))
        db.commit()
        _, hits_big = _count_selects(lambda: recommend_next_study(u2, db))

        assert len(hits_small) == 2, hits_small
        assert len(hits_big) == 2, hits_big
    finally:
        db.rollback()
        db.close()


def test_recommendation_semantics_unchanged():
    db = SessionLocal()
    try:
        u, rows = _user(db, 3)
        # nothing has materials -> first assignment wins
        assert recommend_next_study(u, db) == (
            f"📚 Study recommendation: Create materials for '{rows[0].title}' — it has no study guides yet."
        )
        db.add(StudyMaterial(user_id=u.id, assignment_id=rows[0].id, kind="flashcards", content="[]"))
        db.commit()
        assert rows[1].title in recommend_next_study(u, db)

        db.add(StudyMaterial(user_id=u.id, assignment_id=rows[1].id, kind="quiz", content="[]"))
        db.add(StudyMaterial(user_id=u.id, assignment_id=rows[2].id, kind="summary", content="x"))
        db.commit()
        assert recommend_next_study(u, db).startswith("You're up to date!")

        bare, _ = _user(db, 1)
        db.delete(bare)  # cleanup only
        db.commit()
        empty = User(public_id=f"test_rec_empty_{uuid.uuid4().hex[:6]}", plan="free")
        db.add(empty)
        db.commit()
        assert recommend_next_study(empty, db).startswith("Complete an assignment first")
    finally:
        db.rollback()
        db.close()
