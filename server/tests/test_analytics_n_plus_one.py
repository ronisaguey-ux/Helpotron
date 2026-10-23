import uuid
import pytest
from server.database import SessionLocal, User, StudyMaterial, StudySession
from server.analytics import get_user_analytics


def test_get_user_analytics_batch_materials():
    db = SessionLocal()
    user_pid = f"test_analytics_{uuid.uuid4().hex[:8]}"
    try:
        user = User(public_id=user_pid, plan="pro", role="user")
        db.add(user)
        db.commit()

        m1 = StudyMaterial(user_id=user.id, kind="flashcards", content="Q: 1 A: 2")
        m2 = StudyMaterial(user_id=user.id, kind="quiz", content="Question 1")
        db.add_all([m1, m2])
        db.commit()

        s1 = StudySession(user_id=user.id, material_id=m1.id, time_spent_minutes=25, score=90.0)
        s2 = StudySession(user_id=user.id, material_id=m2.id, time_spent_minutes=15, score=85.0)
        s3 = StudySession(user_id=user.id, material_id=m1.id, time_spent_minutes=10, score=95.0)
        db.add_all([s1, s2, s3])
        db.commit()

        analytics = get_user_analytics(db, user)

        assert analytics["total_study_time_minutes"] == 50
        assert analytics["total_study_time_hours"] == 0.8
        assert analytics["materials_studied"] == 2
        assert analytics["kind_study_time"]["flashcards"] == 35
        assert analytics["kind_study_time"]["quiz"] == 15
        assert analytics["material_breakdown"]["flashcards"] == 1
        assert analytics["material_breakdown"]["quiz"] == 1
    finally:
        db.rollback()
        db.close()
