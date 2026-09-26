"""The hygiene health probe must not block the event loop.

`_service_health()` makes a SYNC `httpx.get`. Called directly from `async def status()`, a
wedged sidecar stalls the loop for the full 2 s timeout on every probe — and while it is
stalled, nothing else on the server runs, including /api/health.

An earlier fix wrapped the 240 s POST in `_forward` and missed this second call site, so this
test guards the CLASS rather than the one function: it drives the real handler and measures
whether unrelated async work made progress while the probe was in flight.

Timing is deliberately generous (a 0.6 s hang against a 50 ms tick) so the test is not flaky
on a loaded machine — the failure mode it catches is a full-loop freeze, not jitter.
"""
import asyncio
import time
from unittest.mock import patch

import pytest

from server import routes_hygiene


def test_service_health_is_sync_by_construction():
    """Documents WHY the call site needs a thread — this is the thing being worked around."""
    import inspect

    assert not inspect.iscoroutinefunction(routes_hygiene._service_health), (
        "_service_health is sync; if it ever becomes async, the to_thread wrapper can go away"
    )


@pytest.mark.asyncio
async def test_status_does_not_block_the_event_loop():
    """Drive the real handler with a hanging sidecar and prove the loop kept running."""
    HANG = 0.6

    def _hang(*_args, **_kwargs):
        time.sleep(HANG)          # a blocking call, exactly like a wedged httpx request

        class _R:
            status_code = 200

            @staticmethod
            def json():
                return {"ok": True}

        return _R()

    ticks = 0

    async def _ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.02)
            ticks += 1

    with patch.object(routes_hygiene.httpx, "get", _hang):
        ticker = asyncio.create_task(_ticker())
        started = time.perf_counter()
        result = await routes_hygiene.status(current_user=None)
        elapsed = time.perf_counter() - started
        ticker.cancel()

    assert result == {"ok": True}, "the handler must still return the sidecar's answer"

    # With the call on the loop, nothing else can run: ticks stays 0 for the whole hang.
    # With it in a thread, the ticker keeps its 20 ms cadence throughout.
    expected = HANG / 0.02 * 0.5          # half the ideal cadence — generous, still decisive
    assert ticks >= expected, (
        f"event loop was blocked: only {ticks} ticks during a {elapsed:.2f}s probe "
        f"(expected at least {expected:.0f}). A sync call is running on the loop."
    )


@pytest.mark.asyncio
async def test_status_still_returns_a_failure_shape_when_the_sidecar_is_down():
    """Moving the call off the loop must not change what the endpoint reports."""
    with patch.object(routes_hygiene.httpx, "get", side_effect=OSError("connection refused")):
        assert await routes_hygiene.status(current_user=None) == {"ok": False}
