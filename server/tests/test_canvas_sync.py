import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from server.database import init_db, SessionLocal, User, Assignment
from server.main import app
from server.security import create_jwt_token
from server.routes_study_tools import _clean_canvas_html, _format_canvas_rubric

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


def test_clean_canvas_html():
    html = "<p>Introduction to <b>Cell Biology</b>.</p><br><div>Please complete questions 1&ndash;5.</div>"
    clean = _clean_canvas_html(html)
    assert "<p>" not in clean
    assert "<b>" not in clean
    assert "Introduction to Cell Biology." in clean
    assert "Please complete questions 1" in clean


def test_format_canvas_rubric():
    rubric = [
        {"description": "Analysis", "points": 25, "long_description": "Thorough statistical analysis."},
        {"description": "Clarity", "points": 10, "long_description": "Clear presentation with no typos."},
    ]
    md = _format_canvas_rubric(rubric)
    assert "| Criterion | Points | Description |" in md
    assert "| Analysis | 25 | Thorough statistical analysis. |" in md
    assert "| Clarity | 10 | Clear presentation with no typos. |" in md


def test_canvas_sync_endpoint_mocked():
    headers = _auth_headers("test_canvas_user")

    fake_courses = [
        {"id": 8801, "name": "AP Computer Science A", "course_code": "AP-CS-A"}
    ]
    fake_assignments = [
        {
            "id": 9901,
            "name": "Binary Search Trees",
            "description": "<p>Implement a balanced binary search tree in Java.</p>",
            "due_at": "2026-10-15T23:59:00Z",
            "html_url": "https://school.instructure.com/courses/8801/assignments/9901",
            "has_submitted_submissions": False,
            "rubric": [
                {"description": "Correctness", "points": 50, "long_description": "Passes all unit tests"}
            ]
        }
    ]

    class FakeResponse:
        def __init__(self, json_data, status_code=200):
            self._json = json_data
            self.status_code = status_code
            self.text = ""

        def json(self):
            return self._json

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

        async def get(self, url, **kwargs):
            if "courses/8801/assignments" in url:
                return FakeResponse(fake_assignments)
            elif "/api/v1/courses" in url:
                return FakeResponse(fake_courses)
            return FakeResponse([], 404)

    with patch("httpx.AsyncClient", FakeAsyncClient):
        res = client.post(
            "/api/study/canvas/sync",
            headers=headers,
            json={
                "canvas_url": "https://school.instructure.com",
                "api_token": "canvas_test_secret_token_12345",
                "include_completed": False
            }
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["status"] == "ok"
        assert data["courses_synced"] == 1
        assert data["assignments_synced"] == 1

        db = SessionLocal()
        try:
            u = db.query(User).filter(User.public_id == "test_canvas_user").first()
            a = db.query(Assignment).filter_by(user_id=u.id, canvas_id="8801:9901").first()
            assert a is not None
            assert a.title == "Binary Search Trees"
            assert "Implement a balanced binary search tree in Java." in a.prompt
            assert a.progress.get("course_name") == "AP Computer Science A"
            assert "| Correctness | 50 | Passes all unit tests |" in a.progress.get("rubric", "")
        finally:
            db.close()
