"""Browser-agent session tests — loop mechanics with a mocked LLM and a fake
bridge (no real WebSocket): decision -> command -> observation -> finish."""
import asyncio
import json

from server.agent_session import AgentManager


class FakeWS:
    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)

    async def close(self, **kw):
        pass


def test_agent_session_collects_then_finishes(monkeypatch):
    calls = {"n": 0}

    async def fake_llm(system, user):
        calls["n"] += 1
        if calls["n"] == 1:
            return json.dumps({"tool": "read_page"}), "deepseek-v4-flash-free"
        return json.dumps({"tool": "finish", "args": {"summary": "collected the Hamlet prompt"}}), "deepseek-v4-flash-free"

    monkeypatch.setattr("server.agent_session.llm.call_llm", fake_llm)

    async def scenario():
        mgr = AgentManager()
        s = mgr.create("pub-1", assignment_id=1, instruction="")
        ws = FakeWS()
        await mgr.attach(s.session_id, ws)
        task = asyncio.create_task(mgr.run(s))
        # wait for the first command to be sent to the bridge
        for _ in range(200):
            if ws.sent:
                break
            await asyncio.sleep(0.01)
        assert ws.sent[0]["type"] == "command"
        assert ws.sent[0]["command"]["action"] == "read_page"
        # simulate the extension answering
        s.pending[ws.sent[0]["command_id"]].set_result({
            "ok": True,
            "result": {"text": "Hamlet delays. The ghost speaks.", "url": "https://x.instructure.com/assignments/1", "links": []},
        })
        await task
        return s

    s = asyncio.run(scenario())
    assert s.status == "done"
    assert s.steps == 1  # read_page was the one tool command; finish doesn't count
    assert "Hamlet prompt" in s.result_text
    assert s.snapshot()["status"] == "done"


def test_agent_session_times_out_command(monkeypatch):
    async def fake_llm(system, user):
        return json.dumps({"tool": "scroll", "args": {"direction": "down"}}), "deepseek-v4-flash-free"

    monkeypatch.setattr("server.agent_session.llm.call_llm", fake_llm)
    monkeypatch.setattr("server.agent_session.COMMAND_TIMEOUT", 0.01)

    async def scenario():
        mgr = AgentManager()
        s = mgr.create("pub-2", None, "")
        ws = FakeWS()
        await mgr.attach(s.session_id, ws)
        task = asyncio.create_task(mgr.run(s))
        for _ in range(200):
            if ws.sent:
                break
            await asyncio.sleep(0.01)
        # never answer — loop should log the timeout and keep going (or end at limit)
        await asyncio.wait_for(task, timeout=5)
        return s

    s = asyncio.run(scenario())
    # the timeout path must not crash the session; it either continued or ended
    assert s.status in ("done", "running", "disconnected", "failed")


def test_agent_session_waits_for_extension_attach(monkeypatch):
    """Regression: the extension connects only after /api/agent/start returns,
    so the loop must wait for the bridge instead of instantly treating the
    gap as a disconnect (which would refund every session)."""
    monkeypatch.setattr("server.agent_session.ATTACH_TIMEOUT", 0.05)

    async def scenario():
        mgr = AgentManager()
        s = mgr.create("pub-4", None, "")
        await asyncio.wait_for(mgr.run(s), timeout=5)
        return s

    s = asyncio.run(scenario())
    assert s.status == "disconnected"
    assert s.steps == 0
    assert any("never connected" in entry["event"] for entry in s.log)


def test_agent_session_invalid_json_retries(monkeypatch):
    calls = {"n": 0}

    async def fake_llm(system, user):
        calls["n"] += 1
        if calls["n"] == 1:
            return "I think I'll read the page now.", "deepseek-v4-flash-free"  # not JSON
        return json.dumps({"tool": "finish", "args": {"summary": "nothing found"}}), "deepseek-v4-flash-free"

    monkeypatch.setattr("server.agent_session.llm.call_llm", fake_llm)

    async def scenario():
        mgr = AgentManager()
        s = mgr.create("pub-3", None, "")
        ws = FakeWS()
        await mgr.attach(s.session_id, ws)
        task = asyncio.create_task(mgr.run(s))
        await asyncio.wait_for(task, timeout=5)
        return s

    s = asyncio.run(scenario())
    assert s.status == "done"
    assert calls["n"] == 2  # prose attempt + retry
