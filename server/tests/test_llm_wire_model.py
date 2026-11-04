"""09-10 (owner): 'solely deepseek v4.1 flash'.

The 4d8be95 wire map rewrote every deepseek request to an "-exp" slug because
the plain slug was text-only. V4.1 Flash is natively vision on OpenRouter
(verified live 09-10: a real image payload returns non-empty content), so the
canonical id IS the wire id and the rewrite is retired. Pins the payload
actually sent so a stale slug or a silent downgrade can never return.
"""
import asyncio

from server import llm


def test_flash_alias_wires_to_vision_exp(monkeypatch):
    captured = {}

    class FakeResp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}]}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None, **kwargs):
            # Audit V5-A4-10 added a per-attempt `timeout=` kwarg to this call;
            # the fake must accept it (and any future httpx request option).
            captured["payload"] = json
            return FakeResp()

    monkeypatch.setattr(llm.httpx, "AsyncClient", FakeClient)
    out = asyncio.run(llm.call_llm("sys", "hi", model="flash"))
    assert out == "ok"
    assert captured["payload"]["model"] == "deepseek/deepseek-v4.1-flash"
