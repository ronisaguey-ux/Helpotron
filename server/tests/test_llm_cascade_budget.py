"""Audit V5-A4-10: the LLM cascade must respect a request budget.

Pre-fix: `httpx.AsyncClient(timeout=60)` with up to 5 candidate models and no
whole-call deadline = 300s worst case inside one request, while
config.chat_timeout_seconds claimed 30s and was never read. These tests pin the
budget arithmetic and prove the cascade stops once it is spent.
"""
import asyncio

import httpx
import pytest

import server.llm as llm
from server.llm import _attempt_timeout, _http_timeout, _now, call_llm


def test_attempt_timeout_is_clamped_to_the_budget():
    # plenty of budget left -> the configured per-attempt timeout
    assert _attempt_timeout(_now() + 600) == llm._ATTEMPT_TIMEOUT_S
    # little budget left -> whatever remains, not the full attempt timeout
    left = _attempt_timeout(_now() + 7)
    assert 5.0 <= left <= 7.0
    # budget gone -> no attempt at all
    assert _attempt_timeout(_now() + 1) is None
    assert _attempt_timeout(_now() - 10) is None


def test_http_timeout_caps_connect():
    t = _http_timeout(30)
    assert t.connect == min(llm._CONNECT_TIMEOUT_S, 30)
    assert t.read == 30
    # a tiny attempt budget cannot leave a longer connect timeout behind
    t2 = _http_timeout(2)
    assert t2.connect <= 2


def test_call_llm_stops_after_budget_is_spent(monkeypatch):
    """Every candidate stalls; the cascade must not walk all 5 of them."""
    attempts = []

    async def fake_post(self, url, **kwargs):
        attempts.append(kwargs.get("timeout"))
        await asyncio.sleep(0.3)  # each stalled provider burns real budget
        raise httpx.ConnectTimeout("provider never answered")

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    # 0.7s of budget, 0.3s burnt per stalled attempt: the cascade must stop
    # after two, not walk all five.
    monkeypatch.setattr(llm, "_CASCADE_BUDGET_S", 0.7)
    monkeypatch.setattr(llm, "_MIN_ATTEMPT_S", 0.1)

    with pytest.raises(RuntimeError):
        asyncio.run(call_llm("sys", "user prompt", model="deepseek-v4.1-flash"))

    assert 1 <= len(attempts) <= 3, f"cascade walked {len(attempts)} providers on a 0.7s budget"
    assert len(attempts) < len(llm._effort_cascade("deepseek-v4.1-flash"))


def test_call_llm_per_attempt_timeout_is_passed(monkeypatch):
    seen = {}

    class FakeResp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}]}

        def raise_for_status(self):
            return None

    async def fake_post(self, url, **kwargs):
        seen["timeout"] = kwargs.get("timeout")
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    assert asyncio.run(call_llm("sys", "hi", model="deepseek-v4.1-flash")) == "ok"
    assert seen["timeout"] is not None
    assert seen["timeout"].read <= llm._ATTEMPT_TIMEOUT_S
    assert seen["timeout"].connect <= llm._CONNECT_TIMEOUT_S


def test_stream_llm_honours_budget(monkeypatch):
    from server.llm import stream_llm

    started = []

    class FakeStream:
        status_code = 500

        async def __aenter__(self):
            started.append(1)
            await asyncio.sleep(0.3)
            return self

        async def __aexit__(self, *a):
            return False

        async def aiter_lines(self):
            if False:
                yield ""

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def stream(self, *a, **kw):
            return FakeStream()

    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda *a, **kw: FakeClient())
    monkeypatch.setattr(llm, "_CASCADE_BUDGET_S", 0.7)
    monkeypatch.setattr(llm, "_MIN_ATTEMPT_S", 0.1)

    async def drain():
        return [e async for e in stream_llm("sys", "hi", model="deepseek-v4.1-flash")]

    events = asyncio.run(drain())
    assert 1 <= len(started) <= 3, f"stream cascade opened {len(started)} attempts on a 0.7s budget"
    assert isinstance(events, list)
