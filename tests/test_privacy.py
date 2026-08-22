"""GDPR Article 17 erasure regression tests (remediation BATCH-09).

Deleting an account must wipe every user-owned row (assignments,
transcripts, credit ledger, payments, drafts, usage logs) and the user
row itself — verified through the live DELETE /user/account endpoint.
"""
import os

# Must be set before any `server.*` import — the engine binds at import time.
os.environ["DATABASE_URL"] = "sqlite:///./test_privacy.db"
os.environ["JWT_SECRET"] = "test-secret-key-minimum-32-characters!"

import pytest
from fastapi.testclient import TestClient

from server.database import (
    ApiUsageLog,
    Assignment,
    Base,
    CreditTransaction,
    Draft,
    Payment,
    Transcript,
    User,
    engine,
)
from server.security import create_jwt_token


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    from server.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def seeded(client):
    """User with a full data footprint: assignment, transcript, credits,
    payment, draft, and API usage rows."""
    from server.database import SessionLocal

    db = SessionLocal()
    try:
        u = User(public_id="privacy-user", plan="free", credits=10)
        db.add(u)
        db.flush()
        db.add(Assignment(user_id=u.id, title="erasure essay", prompt=""))
        db.flush()  # SessionLocal has autoflush=False — materialize ids for the Draft FK
        db.add(Transcript(user_id=u.id, source="upload", text="lecture notes", duration_seconds=60))
        db.add(CreditTransaction(user_id=u.id, delta=-2, reason="test"))
        db.add(Payment(user_id=u.id, provider="test", amount_cents=500, status="paid"))
        assignment = db.query(Assignment).filter(Assignment.user_id == u.id).first()
        db.add(Draft(user_id=u.id, assignment_id=assignment.id, draft_text="draft body"))
        db.add(ApiUsageLog(user_id=u.id, public_id="privacy-user", tool_or_model="test", category="llm"))
        db.commit()
        uid = u.id
    finally:
        db.close()
    return {"id": uid, "auth": {"Authorization": f"Bearer {create_jwt_token(uid)}"}}


def _counts(uid):
    from server.database import SessionLocal

    db = SessionLocal()
    try:
        return {
            "users": db.query(User).filter(User.id == uid).count(),
            "assignments": db.query(Assignment).filter(Assignment.user_id == uid).count(),
            "transcripts": db.query(Transcript).filter(Transcript.user_id == uid).count(),
            "credit_tx": db.query(CreditTransaction).filter(CreditTransaction.user_id == uid).count(),
            "payments": db.query(Payment).filter(Payment.user_id == uid).count(),
            "drafts": db.query(Draft).filter(Draft.user_id == uid).count(),
            "api_logs": db.query(ApiUsageLog).filter(ApiUsageLog.user_id == uid).count(),
        }
    finally:
        db.close()


def test_unauthenticated_erasure_returns_401(client):
    res = client.delete("/user/account")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


def test_erasure_requires_own_token(client, seeded):
    """A different user's token must not delete the target account."""
    from server.database import SessionLocal

    db = SessionLocal()
    other = User(public_id="privacy-other", plan="free", credits=0)
    db.add(other)
    db.commit()
    other_id = other.id
    db.close()

    res = client.delete("/user/account", headers={"Authorization": f"Bearer {create_jwt_token(other_id)}"})
    assert res.status_code == 200
    # The seeded user is untouched by the other user's erasure.
    assert _counts(seeded["id"])["users"] == 1


def test_erasure_wipes_all_user_data(client, seeded):
    res = client.delete("/user/account", headers=seeded["auth"])
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "deleted"

    counts = _counts(seeded["id"])
    assert counts["users"] == 0, "user row must be deleted"
    assert counts["assignments"] == 0
    assert counts["transcripts"] == 0
    assert counts["credit_tx"] == 0
    assert counts["payments"] == 0
    assert counts["drafts"] == 0
    assert counts["api_logs"] == 0


def test_erasure_is_idempotent(client, seeded):
    """Deleting again (token now stale) must not crash the API."""
    res = client.delete("/user/account", headers=seeded["auth"])
    assert res.status_code in (200, 401), res.text
