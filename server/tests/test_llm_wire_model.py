"""09-01 (Bob): 'only v4 flash vision is supposed to be used'.

The wire map added in 4d8be95 rewrote every deepseek flash request to the
plain slug — which is TEXT-ONLY on OpenRouter (verified against the live
catalog 09-01: deepseek/deepseek-v4-flash = text->text, the vision flavor
is deepseek/deepseek-v4-flash-vision-exp). Pins the payload actually sent
so a downgrade can never silently return.
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

        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return FakeResp()

    monkeypatch.setattr(llm.httpx, "AsyncClient", FakeClient)
    out = asyncio.run(llm.call_llm("sys", "hi", model="flash"))
    assert out == "ok"
    assert captured["payload"]["model"] == "deepseek/deepseek-v4-flash-vision-exp"
