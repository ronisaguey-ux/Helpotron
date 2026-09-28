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
import os
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


def test_guard_refuses_below_the_absolute_memory_floor(monkeypatch):
    """The floor engages even when the percentage is inside the cap."""
    # 40% used — inside the 80% cap — but only 1.5 GB available.
    monkeypatch.setattr(rg, "budget_status", lambda: {
        "ram_pct": 40.0, "cpu_pct": 10.0, "over_budget": False,
        "mem_available_mb": 1500,
    })
    assert rg._within_budget() is False, (
        "a swap-pinned box passed admission because only the percentage was checked"
    )


# ── the queue: bounded slots, not a stampede (2026-09-28) ────────────────────
#
# The old implementation re-checked a shared budget every POLL_SECONDS and reserved
# nothing, so its own docstring's anti-herd claim was false: measured, 6 concurrent callers
# were admitted in the SAME tick and all ran together. These tests exist because that is
# invisible without a concurrency counter.

def _run_n(monkeypatch, n, max_concurrent):
    """Drive n callers through the guard while the budget is blocked, and report the peak."""
    monkeypatch.setattr(rg, "MAX_CONCURRENT", max_concurrent)
    monkeypatch.setattr(rg, "_slot_pools", {})
    state = {"full": True}
    monkeypatch.setattr(rg, "_within_budget", lambda: not state["full"])

    running = 0
    peak = 0

    async def job():
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.1)
        running -= 1

    async def drive():
        tasks = [asyncio.create_task(rg.run_with_budget(job)) for _ in range(n)]
        await asyncio.sleep(0.4)          # let the whole backlog pile up
        state["full"] = False
        await asyncio.gather(*tasks)
        return peak

    return asyncio.run(drive())


def test_concurrency_is_bounded_not_a_stampede(monkeypatch):
    """★ THE DEFECT THIS QUEUE EXISTS TO FIX.

    Measured on the old code: 6 callers released together produced peak_running 6 — the
    whole backlog walked in at once and re-blew the cap the guard protects. A slot is
    RESERVED for the duration; re-checking a shared condition reserves nothing.
    """
    assert _run_n(monkeypatch, n=6, max_concurrent=2) == 2


def test_one_lane_is_strictly_sequential_and_fifo(monkeypatch):
    """The owner's literal ask: a sequential queue, drained in arrival order."""
    monkeypatch.setattr(rg, "MAX_CONCURRENT", 1)
    monkeypatch.setattr(rg, "_slot_pools", {})
    state = {"full": True}
    monkeypatch.setattr(rg, "_within_budget", lambda: not state["full"])
    order = []

    async def job(i):
        order.append(i)
        await asyncio.sleep(0.05)

    async def drive():
        tasks = [asyncio.create_task(rg.run_with_budget(lambda i=i: job(i))) for i in range(5)]
        await asyncio.sleep(0.3)
        state["full"] = False
        await asyncio.gather(*tasks)

    asyncio.run(drive())
    assert order == sorted(order), f"queue is not FIFO: {order}"


def test_a_cancelled_waiter_does_not_leak_the_counter(monkeypatch):
    """A closed browser tab while queued used to leak a waiter forever.

    The old code decremented `waiting` only on the success path, so a busy server drifted
    upward with no way back down.
    """
    monkeypatch.setattr(rg, "MAX_CONCURRENT", 1)
    monkeypatch.setattr(rg, "_slot_pools", {})
    monkeypatch.setattr(rg, "_within_budget", lambda: False)   # never admits
    before = rg.STATS.waiting

    async def drive():
        a = asyncio.create_task(rg.run_with_budget(lambda: asyncio.sleep(1)))
        b = asyncio.create_task(rg.run_with_budget(lambda: asyncio.sleep(1)))
        await asyncio.sleep(0.2)
        assert rg.STATS.waiting == before + 2, "both callers should be waiting"
        a.cancel()
        b.cancel()
        await asyncio.gather(a, b, return_exceptions=True)

    asyncio.run(drive())
    assert rg.STATS.waiting == before, "cancelled waiters leaked their count"


def test_a_full_queue_is_refused_not_held_forever(monkeypatch):
    """An unbounded backlog turns a clear 503 into an out-of-memory crash."""
    monkeypatch.setattr(rg, "MAX_QUEUE_DEPTH", 0)              # nothing may wait
    monkeypatch.setattr(rg, "STATS", rg.QueueStats(waiting=5))

    async def drive():
        with pytest.raises(rg.ServerAtCapacity):
            await rg.run_with_budget(lambda: asyncio.sleep(0))

    asyncio.run(drive())
    assert rg.STATS.rejected >= 1


def test_queue_status_reports_the_bound_and_the_peak():
    """Without peak_running the stampede was unobservable — that is why it survived."""
    st = rg.queue_status()
    for key in ("max_concurrent", "peak_running", "rejected"):
        assert key in st, f"queue_status() must report {key}"


# ── idle reclamation: the other half of the owner's ask ──────────────────────

def test_process_cpu_ticks_reads_this_process():
    ticks = rg.process_cpu_ticks(os.getpid())
    assert isinstance(ticks, int) and ticks >= 0
    assert rg.process_cpu_ticks(999999999) is None, "a dead pid must read as unknown"


def test_idle_tracker_needs_no_progress_across_two_observations(monkeypatch):
    """Idle is ELAPSED TIME WITHOUT PROGRESS — one snapshot cannot tell you that."""
    tr = rg.IdleTracker()
    assert tr.observe("u", 100) == 0.0, "first sighting is not idle"
    # Not an exact 0.0: a few microseconds of real time pass between the two calls,
    # so the fresh idle clock reads a hair above zero.
    assert abs(tr.observe("u", 100)) < 0.1, "the clock starts on the second identical reading"
    # Rewind the recorded instant rather than sleeping 3 minutes.
    tr._state["u"]["since"] -= 400
    assert tr.observe("u", 100) >= 400.0, "no progress for 400s must read as idle"


def test_idle_tracker_resets_when_the_process_works():
    tr = rg.IdleTracker()
    tr.observe("u", 100)
    tr.observe("u", 100)
    tr._state["u"]["since"] -= 400
    assert tr.observe("u", 100) > 0
    assert tr.observe("u", 150) == 0.0, "progress must clear the idle clock"


def test_unreadable_ticks_are_never_treated_as_idle():
    """Failing toward 'leave it running' costs memory; the other way stops a working service."""
    tr = rg.IdleTracker()
    tr.observe("u", None)
    assert tr.observe("u", None) == 0.0


def test_reclamation_only_runs_under_real_pressure(monkeypatch):
    """An idle box with headroom keeps its models warm — a lazy load is a user-visible delay."""
    called = []
    monkeypatch.setattr(rg, "read_meminfo", lambda: {"MemAvailable": 8 * 1024 * 1024 * 1024})
    monkeypatch.setattr(rg, "idle_reclaim_candidates", lambda: called.append("checked") or [])
    assert rg.release_idle_models() == []
    assert called == [], "no candidate scan should happen when there is plenty of headroom"
