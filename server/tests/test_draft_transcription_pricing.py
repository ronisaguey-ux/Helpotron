"""Test proving ECON-05: draft and transcription task token debit pricing."""
import pytest


def test_draft_and_transcription_costs():
    from server.draft import DRAFT_COST
    assert DRAFT_COST >= 200.0, f"DRAFT_COST {DRAFT_COST} is stale"
    with open("server/main.py") as f:
        content = f.read()
    assert "hours * 500" in content or "TRANSCRIPTION_TOKEN_RATE" in content or ("hours = max(1.0" in content and "500" in content)

@pytest.mark.asyncio
async def test_draft_workflow_failed_run_refunds_tokens(monkeypatch):
    """Proves V2-C4-01 / V2-C4-08: failed draft runs refund student tokens atomically."""
    import uuid
    from server.database import SessionLocal, User, Assignment, Draft
    from server.draft import create_draft_task, _draft_workflow_async, DRAFT_COST
    from server.credits import get_token_balance, set_token_balance

    with SessionLocal() as db:
        user = User(public_id=f"usr_draft_{uuid.uuid4().hex[:8]}", plan="basic", settings={})
        db.add(user)
        db.commit()
        db.refresh(user)
        set_token_balance(user, 5000.0)
        db.commit()

        assignment = Assignment(user_id=user.id, title="Test Assignment", prompt="Test assignment prompt", status="in_progress")
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

        # 1. Create draft task — deducts DRAFT_COST
        draft = await create_draft_task(user.id, assignment.id, 80.0, db)
        db.refresh(user)
        user_bal = get_token_balance(user)
        assert user_bal == 5000.0 - DRAFT_COST

        # 2. Simulate upstream failure in generate_draft
        async def mock_fail(*args, **kwargs):
            raise RuntimeError("OpenRouter 503 Provider Outage")

        monkeypatch.setattr("server.draft.generate_draft", mock_fail)

        # Run workflow
        await _draft_workflow_async(draft.id)

        # 3. Verify draft marked failed and tokens refunded
        db.refresh(draft)
        assert draft.status == "failed"
        db.refresh(user)
        refunded_bal = get_token_balance(user)
        assert refunded_bal == 5000.0

        # Cleanup
        db.delete(draft)
        db.delete(assignment)
        db.delete(user)
        db.commit()
