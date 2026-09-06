import json
import pytest
from fastapi.testclient import TestClient
from server.database import init_db, SessionLocal, User, StudyMaterial, StudySession, StudyCardState
from server.main import app
from server.security import create_jwt_token

init_db()
client = TestClient(app)


def _auth_headers(public_id: str) -> dict:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user is None:
            user = User(public_id=public_id, plan="basic", credits=20.0, settings={})
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_jwt_token(user_id=user.id, role="user")
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def test_study_decks_and_review():
    headers = _auth_headers("test_study_user")
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == "test_study_user").first()
        cards_content = [
            {"front": "What is an invariant?", "back": "A property that remains true across transformations."},
            {"front": "What is p95?", "back": "95th percentile tail latency metric."},
        ]
        m = StudyMaterial(
            user_id=u.id,
            kind="flashcards",
            content=json.dumps(cards_content),
            model_used="deepseek-v4-flash",
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        m_id = m.id
    finally:
        db.close()

    # 1. Fetch decks
    res = client.get("/api/study/decks", headers=headers)
    assert res.status_code == 200
    decks = res.json()["decks"]
    deck = next((d for d in decks if d["id"] == m_id), None)
    assert deck is not None
    assert deck["total_cards"] == 2

    # 2. Review card 0 with Good rating (3)
    rev_res = client.post(
        f"/api/study/decks/{m_id}/review",
        headers=headers,
        json={"card_index": 0, "rating": 3, "difficulty": "medium", "time_spent_minutes": 2},
    )
    assert rev_res.status_code == 200
    rev_data = rev_res.json()
    assert rev_data["card_index"] == 0
    assert rev_data["state"] == "mastered"
    assert "fsrs" in rev_data

    # 3. Check mastery
    mastery_res = client.get(f"/api/study/mastery/{m_id}", headers=headers)
    assert mastery_res.status_code == 200
    m_data = mastery_res.json()
    assert m_data["mastered"] >= 1
    assert m_data["total"] == 2
    assert m_data["mastery_percentage"] == 50.0

    # 4. Grade Quiz
    quiz_res = client.post(
        f"/api/study/quiz/{m_id}/grade",
        headers=headers,
        json={
            "answers": [
                {"question_index": 0, "selected_answer": "A property that remains true across transformations."},
                {"question_index": 1, "selected_answer": "Wrong answer"},
            ],
            "time_spent_minutes": 3,
        },
    )
    assert quiz_res.status_code == 200
    q_data = quiz_res.json()
    assert q_data["total"] == 2
    assert q_data["score"] == 1
    assert q_data["percentage"] == 50.0

    # 5. Check streak
    streak_res = client.get("/api/study/streak", headers=headers)
    assert streak_res.status_code == 200
    s_data = streak_res.json()
    assert s_data["streak_days"] >= 1
    assert s_data["has_streak"] is True
