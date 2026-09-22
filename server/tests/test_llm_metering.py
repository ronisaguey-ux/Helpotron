import asyncio
import uuid
import pytest
from server.database import ApiUsageLog, SessionLocal, User
import server.metering as metering
from server import llm


def _paid_user() -> str:
    public_id = f"llm-user-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        db.add(User(
            public_id=public_id,
            plan="pro",
            credits=0.0,
            role="user",
            settings={"token_balance": 10000.0},
        ))
        db.commit()
    finally:
        db.close()
    return public_id


@pytest.mark.asyncio
async def test_call_llm_records_usage_when_a_user_is_in_context(monkeypatch):
    public_id = _paid_user()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        before_count = db.query(ApiUsageLog).filter(ApiUsageLog.public_id == public_id).count()

        class _MockResp:
            def raise_for_status(self):
                pass
            def json(self):
                return {
                    "choices": [{"message": {"content": "hello from model"}}],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 20, "cost": 0.0024},
                }

        class _MockClient:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def post(self, *args, **kwargs):
                return _MockResp()

        import httpx
        monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: _MockClient())

        with metering.meter_user(user.public_id):
            res = await llm.call_llm(user_prompt="test prompt", system_prompt="test system")

        assert res == "hello from model"
        after_count = db.query(ApiUsageLog).filter(ApiUsageLog.public_id == public_id).count()
        assert after_count == before_count + 1, (
            "call_llm did not record its usage — analytics and billing are blind to it"
        )
    finally:
        db.close()


@pytest.mark.asyncio
async def test_call_llm_unattributed_call_does_not_record_row(monkeypatch):
    class _MockResp:
        def raise_for_status(self):
            pass
        def json(self):
            return {
                "choices": [{"message": {"content": "hello unattributed"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 20, "cost": 0.0024},
            }

    class _MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def post(self, *args, **kwargs):
            return _MockResp()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: _MockClient())

    metering.set_meter_user(None)
    res = await llm.call_llm(user_prompt="unattributed prompt", system_prompt="system")
    assert res == "hello unattributed"
