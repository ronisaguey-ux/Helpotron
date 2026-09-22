import json
import pytest
from fastapi.testclient import TestClient
from server.database import init_db, SessionLocal, User, UniversalDumpItem, DataSubmission
from server.main import app
from server.security import create_jwt_token

init_db()
client = TestClient(app)


def _auth_headers(public_id: str) -> dict:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user is None:
            user = User(public_id=public_id, plan="pro", credits=100.0, settings={"token_balance": 1000})
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            settings = dict(user.settings or {})
            settings["token_balance"] = 1000
            user.settings = settings
            db.commit()
        token = create_jwt_token(user_id=user.id, role="user")
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def test_dump_batch_estimate_and_finalize():
    headers = _auth_headers("test_dump_user")
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == "test_dump_user").first()
        item1 = UniversalDumpItem(
            user_id=u.id,
            file_name="assignment1.pdf",
            file_type="application/pdf",
            extracted_text="Chapter 1: Principles of Economics. Supply and demand curves determine market equilibrium prices.",
            status="pending",
            requested_action="flashcards",
        )
        item2 = UniversalDumpItem(
            user_id=u.id,
            file_name="assignment2.docx",
            file_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            extracted_text="Chapter 2: Elasticity and Taxation. Tax incidence depends on the relative price elasticities.",
            status="pending",
            requested_action="summary",
        )
        item3 = UniversalDumpItem(
            user_id=u.id,
            file_name="assignment3.txt",
            file_type="text/plain",
            extracted_text="Chapter 3: Monopoly and Monopsony. Deadweight loss under market power.",
            status="pending",
            requested_action="practice_quiz",
        )
        db.add_all([item1, item2, item3])
        db.commit()
        db.refresh(item1)
        db.refresh(item2)
        db.refresh(item3)
        id1, id2, id3 = item1.id, item2.id, item3.id
    finally:
        db.close()

    # 1. Estimate batch
    res_est = client.get(f"/api/dump/batch/estimate?ids={id1},{id2},{id3}", headers=headers)
    assert res_est.status_code == 200
    est_data = res_est.json()
    assert est_data["status"] == "success"
    assert est_data["count"] == 3
    assert est_data["total_tokens"] >= 3
    # ECON-06 / BUG-02: Under canonical token unit (1 token = 1/100 cent), 3 small dump items cost ~$0.0015.
    # The previous assertion (>= 0.03) pinned the old 100x overstatement. Assert against positive real cost.
    assert est_data["total_cost"] > 0
    assert len(est_data["items"]) == 3

    # 2. Finalize batch with skip of item 2
    res_fin = client.post(
        "/api/dump/batch/finalize",
        json={"ids": [id1, id2, id3], "skip": [id2], "action": "summary"},
        headers=headers,
    )
    assert res_fin.status_code == 200
    fin_data = res_fin.json()
    assert fin_data["status"] == "success"
    assert fin_data["processed"] == 2
    assert fin_data["succeeded"] >= 1
    assert fin_data["total_charged_tokens"] >= 1

    # Verify skipped item is still pending
    db = SessionLocal()
    try:
        check2 = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == id2).first()
        assert check2.status == "pending"
    finally:
        db.close()


def test_datalake_export_json():
    headers = _auth_headers("test_datalake_user")
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == "test_datalake_user").first()
        sub = DataSubmission(
            user_id=u.id,
            payload={"title": "Test Econ Dataset", "data_type": "empirical"},
            discount_earned=2.5,
        )
        db.add(sub)
        db.commit()
    finally:
        db.close()

    res = client.get("/api/datalake/export.json", headers=headers)
    assert res.status_code == 200
    assert "attachment; filename=datalake_entries.json" in res.headers.get("Content-Disposition", "")
    data = res.json()
    assert data["user_id"] == "test_datalake_user"
    assert data["total_entries"] >= 1
    assert any(e.get("title") == "Test Econ Dataset" for e in data["entries"])
