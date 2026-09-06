import pytest
from fastapi.testclient import TestClient
from server.main import app
from server.database import init_db, SessionLocal, User, Assignment
from server.gdocs_exporter import HumanizedTypingSimulator
from server.security import create_jwt_token

init_db()
client = TestClient(app)


def _auth_headers(public_id: str) -> dict:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user is None:
            user = User(public_id=public_id, plan="pro", credits=50.0, settings={})
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_jwt_token(user_id=user.id, role="user")
        return {"Authorization": f"Bearer {token}", "X-Public-ID": public_id}
    finally:
        db.close()


def test_launch_to_doc_typing_simulator():
    sim = HumanizedTypingSimulator(wpm=65)
    text = "Assistive typing for students with disabilities ensures equal access to writing and document editing."
    events = sim.generate_typing_events(text)
    assert len(events) > 0

    # Assert typing delays exist and are within reasonable bounds
    delays = [e.get("delay_ms", 0) for e in events if "delay_ms" in e]
    assert len(delays) > 0
    assert all(d >= 0 for d in delays)

    # Check total text reconstructed matches original (accounting for delete actions)
    buffer = []
    for e in events:
        if e.get("action") == "insert":
            buffer.append(e.get("text", ""))
        elif e.get("action") == "delete":
            chars_to_delete = e.get("chars", 0)
            curr = "".join(buffer)
            curr = curr[:-chars_to_delete] if chars_to_delete > 0 else curr
            buffer = [curr]
    reconstructed = "".join(buffer)
    assert "Assistive typing" in reconstructed
    assert "equal access" in reconstructed


def test_launch_to_doc_payload_endpoint():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "test_a11y_user").first()
        if not user:
            user = User(
                public_id="test_a11y_user",
                plan="pro",
                credits=100.0,
                settings={"token_balance": 500}
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        assign = Assignment(
            user_id=user.id,
            title="Accessible Biology Lab Report",
            prompt="Investigate cellular respiration under variable oxygen conditions.",
            due_date="2026-09-05",
            status="completed",
            progress={
                "subject": "Biology",
                "do_it_work": "Cellular respiration occurs in three primary stages: glycolysis, the citric acid cycle, and oxidative phosphorylation."
            }
        )
        db.add(assign)
        db.commit()
        assign_id = assign.id
    finally:
        db.close()

    headers = _auth_headers("test_a11y_user")

    # Query Launch to Doc payload
    payload_resp = client.get(f"/api/assignment/{assign_id}/launch-doc-payload", headers=headers)
    assert payload_resp.status_code == 200
    data = payload_resp.json()
    assert data["status"] == "success"
    assert data["assignment_id"] == assign_id
    assert data["title"] == "Accessible Biology Lab Report"
    assert "Cellular respiration occurs in three primary stages" in data["text"]
    assert data["word_count"] > 5
    assert data["estimated_minutes_at_65wpm"] >= 1
    assert data["subject"] == "Biology"
