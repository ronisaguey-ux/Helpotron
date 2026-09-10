import json
import pytest
from fastapi.testclient import TestClient
from server.database import init_db, SessionLocal, User, StudyMaterial
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


def test_library_materials_crud_and_save():
    headers = _auth_headers("test_lib_user")
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == "test_lib_user").first()
        m = StudyMaterial(
            user_id=u.id,
            kind="flashcards",
            content=json.dumps([{"front": "Q1", "back": "A1"}]),
            model_used="deepseek-v4.1-flash",
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        m_id = m.id
    finally:
        db.close()

    # 1. Fetch materials
    res = client.get("/api/library/materials", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "materials" in data
    found = next((x for x in data["materials"] if x["id"] == m_id), None)
    assert found is not None
    assert found["saved_at"] is None

    # 2. Save material
    save_res = client.post(f"/api/library/materials/{m_id}/save", headers=headers)
    assert save_res.status_code == 200
    assert save_res.json()["saved_at"] is not None

    # 3. Filter by saved=True
    saved_res = client.get("/api/library/materials?saved=true", headers=headers)
    assert saved_res.status_code == 200
    assert any(x["id"] == m_id for x in saved_res.json()["materials"])

    # 4. Unsave material
    unsave_res = client.delete(f"/api/library/materials/{m_id}/unsave", headers=headers)
    assert unsave_res.status_code == 200
    assert unsave_res.json()["saved_at"] is None

    # 5. Delete material
    del_res = client.delete(f"/api/library/materials/{m_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "ok"
