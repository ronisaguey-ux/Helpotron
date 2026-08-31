"""Regression test (operator 08-31): a 200 response whose content is "" is a
provider backend failure, NOT a successful answer. call_llm must fall through
the cascade and raise RuntimeError so callers (e.g. finalize) record a visible
failure instead of silently producing no material and telling the user it's done."""
import asyncio
import pytest

import server.llm as llm


class _BlankResp:
    def raise_for_status(self):
        pass

    def json(self):
        return {"choices": [{"message": {"content": ""}}], "usage": {}}


class _BlankClient:
    """httpx.AsyncClient stand-in: every request returns 200 with empty content."""

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, *args, **kwargs):
        return _BlankResp()


def test_call_llm_blank_200_raises_instead_of_empty(monkeypatch):
    monkeypatch.setattr(llm.httpx, "AsyncClient", _BlankClient)
    with pytest.raises(RuntimeError):
        asyncio.run(llm.call_llm(user_prompt="hi", system_prompt="sys", effort="auto"))
