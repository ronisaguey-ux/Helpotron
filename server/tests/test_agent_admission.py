"""The agent session must go through admission control, not around it.

Every other heavy path runs inside `run_with_budget`; an agent session did not, so the
single largest consumer of this machine was invisible to the resource guard — it could not
be counted as load, and it could not be queued behind one.

A structural check ("does the source mention run_with_budget?") is weak: it passes on a
dead branch. So this drives the real function with the session execution faked, and asserts
the guard was actually entered — the wrapper is on the path, not merely in the file.
"""

import asyncio
import sys

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

import pytest  # noqa: E402

import server.main as main  # noqa: E402
from server import resource_guard as rg  # noqa: E402


class _FakeSession:
    session_id = "ses_probe"
    public_id = "nobody_probe"
    assignment_id = None
    status = "failed"
    result_text = ""
    usage_watermark = None


def test_agent_session_enters_the_admission_guard(monkeypatch):
    """The session's work must be wrapped by run_with_budget."""
    entered = {"n": 0}

    async def fake_run_with_budget(fn, on_queued=None):
        entered["n"] += 1
        return await fn()

    async def fake_agent_run(session):
        entered["ran"] = True

    monkeypatch.setattr(rg, "run_with_budget", fake_run_with_budget)
    # `main` resolves the symbol at call time, so patching it on `main` is enough — there is
    # no `agent_manager` on server.agent_session to patch.
    monkeypatch.setattr(main, "agent_manager", type("M", (), {"run": staticmethod(fake_agent_run)})())

    asyncio.run(main._run_agent_and_persist(_FakeSession()))

    assert entered["n"] == 1, "agent session did NOT pass through run_with_budget"
    assert entered.get("ran") is True, "the session never actually ran"


def test_guard_counters_are_real_after_a_session(monkeypatch):
    """Completing a session must move the guard's own counters, not just call a function."""
    before = rg.STATS.completed

    async def fake_agent_run(session):
        return None

    monkeypatch.setattr(rg, "started_at", getattr(rg.STATS, "started_at", None), raising=False)
    monkeypatch.setattr(main, "agent_manager", type("M", (), {"run": staticmethod(fake_agent_run)})())

    asyncio.run(main._run_agent_and_persist(_FakeSession()))
    assert rg.STATS.completed == before + 1, "the guard did not account for the session"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
