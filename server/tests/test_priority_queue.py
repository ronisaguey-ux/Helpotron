"""Pytest wrapper: priority ordering and anti-starvation.

Does priority actually reorder the queue, or does it just look like it does?

A plain semaphore is FIFO, so attaching a priority number to a caller changes nothing —
that is the whole reason PriorityGate exists. The decisive test must fill the slot FIRST
so every caller is genuinely queued, then release and read the admission order. Otherwise
the first caller takes the free slot and the test "passes" while proving nothing.

Also verifies anti-starvation: a low-priority waiter that ages long enough must eventually
outrank a fresh high-priority one, or "lower gets in later" becomes "never".
"""

import asyncio
import sys

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server import resource_guard as rg  # noqa: E402


class _PatchedGuard:
    """Force the budget open for one test, and PUT IT BACK afterwards.

    ★ THIS RESTORES, AND THAT IS THE POINT. The first version assigned
    `rg._within_budget = lambda: True` and left it there for the whole process, which silently
    disabled admission control for every test that ran afterwards. Measured: this file followed
    by test_resource_guard.py turns 19 passes into **3 failures** — the memory-floor test reads
    `True` where it must read `False`, and the two queue tests never block so their assertions
    on waiting and polling can never hold. A test that permanently rewrites the module it is
    testing makes the rest of the suite lie, and the failure appears in a file that has nothing
    to do with it.
    """

    def __enter__(self):
        self._original_within = rg._within_budget
        self._original_max = rg.MAX_CONCURRENT
        rg._gate_pools.clear()
        rg.MAX_CONCURRENT = 1
        rg._within_budget = lambda: True   # budget is not what is under test
        return self

    def __exit__(self, *exc):
        rg._within_budget = self._original_within
        rg.MAX_CONCURRENT = self._original_max
        rg._gate_pools.clear()
        return False


async def admission_order(entries, hold_first=True):
    """entries: [(name, process)] -> the order jobs were admitted."""
    order = []
    with _PatchedGuard():

        async def job(name):
            order.append(name)
            await asyncio.sleep(0.03)

        blocker = None
        if hold_first:
            # Occupy the single slot so every other caller must queue.
            async def occupy():
                await asyncio.sleep(0.15)
            blocker = asyncio.create_task(rg.run_with_budget(occupy, process="chat_message"))
            await asyncio.sleep(0.02)

        tasks = [asyncio.create_task(rg.run_with_budget(lambda n=n: job(n), process=p))
                 for n, p in entries]
        await asyncio.sleep(0.05)          # all now waiting on the gate
        if blocker:
            await blocker
        await asyncio.gather(*tasks)
        return order


async def main():
    ok = True

    print("\n  --- priority reorders the queue ---")
    order = await admission_order([
        ("humanize_job", "humanize"),          # 150
        ("transcribe_job", "transcription"),   # 280
        ("message_job", "chat_message"),       # 950
        ("detect_job", "detection"),           # 320
    ])
    print(f"    admitted: {order}")
    expect = ["message_job", "detect_job", "transcribe_job", "humanize_job"]
    if order == expect:
        print("    PASS — drained in priority order, not arrival order.")
    else:
        print(f"    FAIL — expected {expect}")
        ok = False

    print("\n  --- anti-starvation: an aged low-priority job must eventually win ---")
    # ★ PATCH THE MODULE THE FUNCTION READS. `effective_priority` lives in priority.py and
    # reads PRIORITY_AGING_PER_SEC from THERE; setting it on resource_guard (which only
    # imported the function) changes nothing. My first attempt made exactly that mistake.
    from server import priority as P
    aged_wait = 300.0
    aged = P.effective_priority(P.get_priority("humanize"), aged_wait)
    fresh = P.effective_priority(P.get_priority("chat_message"), 0.0)
    print(f"    humanize aged {aged_wait:.0f}s -> effective {aged:.0f}")
    print(f"    fresh chat_message        -> effective {fresh:.0f}")
    if aged > fresh:
        print("    PASS — after its full wait window an aged low-priority task outranks a"
              " fresh high-priority one, so nothing starves forever.")
    else:
        print("    FAIL — the aging guarantee does not hold at the promised timescale.")
        ok = False

    # And the queue itself must honour that: an aged low task admitted before a fresh high one.
    got = []

    with _PatchedGuard():
        async def quick(name):
            got.append(name)
            await asyncio.sleep(0.02)

        async def blocker():
            await asyncio.sleep(0.4)

        b = asyncio.create_task(rg.run_with_budget(blocker, process="chat_message"))
        await asyncio.sleep(0.02)
        # Backdate the low-priority waiter's enqueue time so it has aged past the fresh caller,
        # rather than sleeping 300 real seconds.
        old_proc, old_prio = "humanize", P.get_priority("humanize")
        fut_task = asyncio.create_task(
            rg.run_with_budget(lambda: quick("aged_low"), process=old_proc))
        await asyncio.sleep(0.05)
        gate = rg._gate()
        for w in gate._waiters:
            if w["priority"] == old_prio:
                w["enqueued"] -= aged_wait
        fresh_task = asyncio.create_task(
            rg.run_with_budget(lambda: quick("fresh_high"), process="chat_message"))
        await b
        await asyncio.gather(fut_task, fresh_task)
        print(f"    admitted: {got}")
        if got and got[0] == "aged_low":
            print("    PASS — the aged waiter climbed the queue in practice, not just in theory.")
        else:
            print("    FAIL — a fresh high-priority caller starved the aged one.")
            ok = False

    print("\n  " + ("ALL CLAIMS HOLD" if ok else "SOMETHING FAILED"))
    return 0 if ok else 1


def test_priority_queue_claims():
    """All three claims: priority ordering, the derived aging rate, and aging in practice."""
    assert asyncio.run(main()) == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
