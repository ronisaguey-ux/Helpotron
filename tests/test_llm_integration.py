"""Integration tests for the helpotron LLM subsystem (plan BATCH-02).

Fast and offline: provider calls are stubbed at the httpx layer so the
suite runs in seconds without network access or API keys.
"""
import asyncio
import inspect

from server.llm import call_llm, extract_json, _effort_cascade


def test_core_functions_exported():
    assert callable(call_llm)
    assert inspect.iscoroutinefunction(call_llm)
    assert callable(extract_json)


def test_extract_json_plain_object():
    assert extract_json('{"a": 1, "b": [2, 3]}') == {"a": 1, "b": [2, 3]}


def test_extract_json_code_fence():
    assert extract_json('```json\n{"ok": true}\n```') == {"ok": True}


def test_extract_json_empty_input_contract():
    # master-harness contract: empty input must not crash callers
    assert extract_json("") == {"status": "ok"}
    assert extract_json(None) == {"status": "ok"}


def test_extract_json_returns_none_on_garbage():
    assert extract_json("definitely not json at all") is None


def test_effort_cascade_always_leads_with_primary():
    for effort in (50, 500, 950):
        cascade = _effort_cascade("deepseek-v4-flash", effort)
        assert cascade[0] == "deepseek-v4-flash"
        assert len(cascade) > 1, "cascade must have fallback providers"


def test_call_llm_cascades_on_provider_failure(monkeypatch):
    """First provider raises -> the cascade retries the next one and the
    eventual response surfaces to the caller."""
    import httpx

    attempts = []

    class FakeResp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": "cascade-ok"}}]}

    async def fake_post(self, url, **kwargs):
        attempts.append(url)
        if len(attempts) == 1:
            raise RuntimeError("provider down")
        return FakeResp()

    async def no_sleep(_s):
        return None

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    monkeypatch.setattr(asyncio, "sleep", no_sleep)  # neutralize backoff

    result = asyncio.run(
        call_llm("sys", "user prompt", model="deepseek-v4-flash", effort_score=300)
    )
    assert result == "cascade-ok"
    assert len(attempts) >= 2, "fallback provider must be attempted"


def test_call_llm_raises_when_all_providers_fail(monkeypatch):
    """Every provider in the cascade failing must raise, not return None —
    callers rely on the exception to trigger their own fallbacks."""
    import httpx
    import pytest

    async def fake_post(self, url, **kwargs):
        raise RuntimeError("provider down")

    async def no_sleep(_s):
        return None

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    monkeypatch.setattr(asyncio, "sleep", no_sleep)  # neutralize backoff

    with pytest.raises(RuntimeError):
        asyncio.run(call_llm("sys", "user prompt", model="deepseek-v4-flash"))
