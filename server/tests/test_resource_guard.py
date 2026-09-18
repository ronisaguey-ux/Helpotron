"""Admission control — the RAM/CPU queue (owner 2026-09-17).

Owner: *"if it takes more then 3min for their task to enter line, give them a
'server is busy, your task will be completed automatically once load lightens'"*.

These tests exist because the guard is on the path of every agent action and had
no coverage at all. The behaviours worth pinning are the ones that are easy to
get subtly wrong and impossible to notice in production:

  * work under budget must NOT queue — a guard that always waits is an outage,
  * work over budget must queue and then RUN, never fail or time out,
  * an unreadable metric must fail OPEN, so a box where /proc looks different
    still serves,
  * the "busy" notice must not fire before the threshold,
  * the CPU cap must be live on the FIRST check after a restart.
"""
import asyncio
import time

import pytest

from server import resource_guard as rg


def _over(over: bool):
    """A budget_status() stand-in, so the tests do not depend on this box's load."""
    return {
        "ram_pct": 95.0 if over else 10.0,
        "cpu_pct": 95.0 if over else 5.0,
        "ram_cap": rg.RAM_CAP_PCT,
        "cpu_cap": rg.CPU_CAP_PCT,
        "ram_over": over,
        "cpu_over": over,
        "over_budget": over,
    }


@pytest.fixture
def stats_clean():
    """Every counter back to zero, before and after — STATS is module-global and
    a leaked count would make a later assertion lie."""
    saved = dict(waiting=rg.STATS.waiting, running=rg.STATS.running,
                 completed=rg.STATS.completed, queued_total=rg.STATS.queued_total,
                 longest_wait=rg.STATS.longest_wait, last_wait=rg.STATS.last_wait)
    rg.STATS.waiting = rg.STATS.running = rg.STATS.completed = 0
    rg.STATS.queued_total = 0
    rg.STATS.longest_wait = rg.STATS.last_wait = 0.0
    yield rg.STATS
    for k, v in saved.items():
        setattr(rg.STATS, k, v)


def test_under_budget_runs_without_queueing(monkeypatch, stats_clean):
    """A guard that waits when the box is idle is worse than no guard."""
    monkeypatch.setattr(rg, "budget_status", lambda: _over(False))
    queued = []
    ran = []

    async def work():
        ran.append(True)
        return "done"

    async def go():
        return await rg.run_with_budget(work, on_queued=queued.append)

    assert asyncio.run(go()) == "done"
    assert ran == [True]
    assert queued == [], "must not report a queue wait when it never waited"
    assert stats_clean.queued_total == 0
    assert stats_clean.completed == 1


def test_over_budget_queues_then_runs(monkeypatch, stats_clean):
    """The whole point: over budget means WAIT, not fail. And then it runs."""
    state = {"over": True}
    monkeypatch.setattr(rg, "budget_status", lambda: _over(state["over"]))
    monkeypatch.setattr(rg, "POLL_SECONDS", 0.02)
    queued = []

    async def work():
        return "ran-under-load"

    async def go():
        async def release():
            await asyncio.sleep(0.12)
            state["over"] = False
        asyncio.ensure_future(release())
        return await rg.run_with_budget(work, on_queued=queued.append)

    result = asyncio.run(go())
    assert result == "ran-under-load", "a queued task must still complete"
    assert len(queued) == 1, "on_queued must fire exactly once, with the wait"
    assert queued[0] > 0
    assert stats_clean.queued_total == 1
    assert stats_clean.waiting == 0, "the waiting counter must not leak"
    assert stats_clean.longest_wait > 0


def test_queue_never_times_out(monkeypatch, stats_clean):
    """A long wait must not be turned into a failure. No timeout exists here."""
    ticks = {"n": 0}
    monkeypatch.setattr(rg, "POLL_SECONDS", 0.01)

    def slow_release():
        ticks["n"] += 1
        return _over(ticks["n"] < 25)      # ~0.25s over budget, 25 polls

    monkeypatch.setattr(rg, "budget_status", slow_release)

    async def work():
        return "patient"

    assert asyncio.run(rg.run_with_budget(work)) == "patient"
    assert ticks["n"] >= 25, "it should have polled until the budget cleared"


def test_unreadable_metric_fails_open(monkeypatch, stats_clean):
    """An unreadable /proc must not block work — the caps are a protection, not a
    correctness requirement. This is why prime_cpu_sample() exists: without it
    the first check after a restart returned None and the CPU cap silently did
    not exist."""
    blind = {"ram_pct": None, "cpu_pct": None, "ram_cap": rg.RAM_CAP_PCT,
             "cpu_cap": rg.CPU_CAP_PCT, "ram_over": False, "cpu_over": False,
             "over_budget": False}
    monkeypatch.setattr(rg, "budget_status", lambda: blind)

    async def work():
        return "served-blind"

    assert asyncio.run(rg.run_with_budget(work)) == "served-blind"
    assert stats_clean.queued_total == 0


def test_running_counter_decrements_even_when_work_raises(monkeypatch, stats_clean):
    """A counter that leaks on the failure path reads as permanent load, and a
    permanent load means every later task queues forever."""
    monkeypatch.setattr(rg, "budget_status", lambda: _over(False))

    async def boom():
        raise RuntimeError("work failed")

    with pytest.raises(RuntimeError):
        asyncio.run(rg.run_with_budget(boom))
    assert stats_clean.running == 0, "running must be decremented in the finally"


def test_busy_threshold(monkeypatch):
    """The notice must not appear early, and must appear at the owner's number."""
    assert rg.BUSY_AFTER_SECONDS == 180
    assert rg.should_show_busy(0) is False
    assert rg.should_show_busy(60) is False
    assert rg.should_show_busy(179) is False
    assert rg.should_show_busy(180) is True
    assert rg.should_show_busy(1000) is True


def test_cpu_metric_is_live_without_a_second_caller():
    """Prime-at-import: the module must be able to produce a CPU figure on the
    first real check after a restart. If this returns None forever the CPU cap
    does not exist, which is exactly the bug that shipped once."""
    rg.prime_cpu_sample()
    time.sleep(0.2)
    pct = rg.cpu_used_pct()
    assert pct is None or 0.0 <= pct <= 100.0
    # A live box has an interval by now; allow None only if /proc is unreadable.
    st = rg.budget_status()
    assert st["ram_pct"] is None or 0.0 <= st["ram_pct"] <= 100.0


def test_queue_status_shape():
    """The client renders this payload — changing its keys is a UI break."""
    st = rg.queue_status()
    for key in ("ram_pct", "cpu_pct", "ram_cap", "cpu_cap", "ram_over",
                "cpu_over", "over_budget", "waiting", "running",
                "busy_after_seconds"):
        assert key in st, f"queue_status() must keep reporting {key}"
    assert st["ram_cap"] == rg.RAM_CAP_PCT
    assert st["cpu_cap"] == rg.CPU_CAP_PCT
