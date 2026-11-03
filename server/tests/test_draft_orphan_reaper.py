"""V4-A5-06: drafts orphaned by a restart are failed and refunded exactly once."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest


def _make_user_and_assignment(db, balance=5000.0):
    from server.database import Assignment, User
    from server.credits import set_token_balance
    user = User(public_id=f"usr_reap_{uuid.uuid4().hex[:8]}", plan="basic", settings={})
    db.add(user)
    db.commit()
    db.refresh(user)
    set_token_balance(user, balance)
    db.commit()
    a = Assignment(user_id=user.id, title="Reap", prompt="p", status="in_progress")
    db.add(a)
    db.commit()
    db.refresh(a)
    return user, a


def _balance(db, user):
    from server.credits import get_token_balance
    db.expire_all()
    db.refresh(user)
    return get_token_balance(user)


@pytest.mark.asyncio
async def test_reaper_fails_and_refunds_orphan_once():
    from server.database import SessionLocal
    from server.draft import DRAFT_COST, create_draft_task, reap_orphaned_drafts

    with SessionLocal() as db:
        user, a = _make_user_and_assignment(db)
        draft = await create_draft_task(user.id, a.id, 80.0, db)
        assert _balance(db, user) == 5000.0 - DRAFT_COST
        did, aid, uid = draft.id, a.id, user.id

    boot = datetime.now(timezone.utc) + timedelta(seconds=1)
    assert reap_orphaned_drafts(boot) >= 1
    assert reap_orphaned_drafts(boot) == 0  # second pass: nothing to refund

    with SessionLocal() as db:
        from server.database import Assignment, Draft, User
        d = db.get(Draft, did)
        u = db.get(User, uid)
        assert d.status == "failed"
        assert "restart" in (d.last_error or "")
        assert _balance(db, u) == 5000.0
        db.delete(d)
        db.delete(db.get(Assignment, aid))
        db.delete(u)
        db.commit()


@pytest.mark.asyncio
async def test_reaper_skips_draft_touched_after_boot():
    from server.database import Assignment, Draft, SessionLocal, User
    from server.draft import DRAFT_COST, create_draft_task, reap_orphaned_drafts

    with SessionLocal() as db:
        user, a = _make_user_and_assignment(db)
        boot = datetime.now(timezone.utc) - timedelta(seconds=5)
        draft = await create_draft_task(user.id, a.id, 80.0, db)
        did, aid, uid = draft.id, a.id, user.id

    reap_orphaned_drafts(boot)

    with SessionLocal() as db:
        d = db.get(Draft, did)
        u = db.get(User, uid)
        assert d.status == "pending"
        assert _balance(db, u) == 5000.0 - DRAFT_COST
        db.delete(d)
        db.delete(db.get(Assignment, aid))
        db.delete(u)
        db.commit()


@pytest.mark.asyncio
async def test_workflow_failure_then_reaper_does_not_double_refund(monkeypatch):
    from server.database import Assignment, Draft, SessionLocal, User
    from server.draft import DRAFT_COST, _draft_workflow_async, create_draft_task, reap_orphaned_drafts

    async def boom(*_a, **_k):
        raise RuntimeError("upstream 503")

    monkeypatch.setattr("server.draft.generate_draft", boom)
    with SessionLocal() as db:
        user, a = _make_user_and_assignment(db)
        draft = await create_draft_task(user.id, a.id, 80.0, db)
        did, aid, uid = draft.id, a.id, user.id

    await _draft_workflow_async(did)
    reap_orphaned_drafts(datetime.now(timezone.utc) + timedelta(seconds=1))

    with SessionLocal() as db:
        d = db.get(Draft, did)
        u = db.get(User, uid)
        assert d.status == "failed"
        assert _balance(db, u) == 5000.0  # refunded once, not 5000 + DRAFT_COST
        db.delete(d)
        db.delete(db.get(Assignment, aid))
        db.delete(u)
        db.commit()


@pytest.mark.asyncio
async def test_workflow_refunds_when_setup_raises(monkeypatch):
    """An exception before the attempt loop (e.g. missing transcript) still refunds."""
    from server.database import Assignment, Draft, SessionLocal, User
    from server.draft import DRAFT_COST, _draft_workflow_async, create_draft_task

    with SessionLocal() as db:
        user, a = _make_user_and_assignment(db)
        a.prompt = ""
        db.commit()
        draft = await create_draft_task(user.id, a.id, 80.0, db)
        did, aid, uid = draft.id, a.id, user.id

    await _draft_workflow_async(did)

    with SessionLocal() as db:
        d = db.get(Draft, did)
        u = db.get(User, uid)
        assert d.status == "failed"
        assert _balance(db, u) == 5000.0
        db.delete(d)
        db.delete(db.get(Assignment, aid))
        db.delete(u)
        db.commit()
