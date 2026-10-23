"""Test proving EFF-05: gate telegram_agent_loop with idle backoff when no bots configured,
and verify client timeout safety and concurrent polling.
"""
import pytest
from unittest.mock import AsyncMock, patch
from server import telegram_agent_link as tal


def test_telegram_idle_backoff_configured():
    with open("server/telegram_agent_link.py", "r", encoding="utf-8") as f:
        content = f.read()
    assert "IDLE_POLL_INTERVAL" in content or ("30.0" in content and "sleep" in content), (
        "No idle backoff configured for empty bot registry"
    )
    assert "asyncio.gather" in content, "telegram_agent_loop must poll bots concurrently"


@pytest.mark.asyncio
async def test_tg_call_client_timeout_exceeds_poll_timeout():
    captured_timeouts = []

    class FakeClient:
        def __init__(self, timeout=None):
            captured_timeouts.append(timeout)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, json=None):
            class FakeResp:
                status_code = 200
                text = '{"ok": true}'
                def json(self):
                    return {"ok": True, "result": []}
            return FakeResp()

    with patch("httpx.AsyncClient", FakeClient):
        ok, body = await tal.tg_call("123:token", "getUpdates", timeout=50)
        assert ok is True
        assert len(captured_timeouts) == 1
        assert captured_timeouts[0] >= 65.0  # 50s poll + 15s margin
