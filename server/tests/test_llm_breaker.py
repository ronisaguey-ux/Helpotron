"""Upstream LLM error breaker.

WHY: a provider outage was retried once per candidate model, per caller, forever.
Every retry was a BILLED request against a service already failing, and the user
got nothing back. The breaker counts CONSECUTIVE upstream failures (a real answer
resets it) and refuses for a cooldown once the threshold is crossed.

The distinction that matters: it is a consecutive-failure counter, not an
error-rate. A single success proves the upstream is reachable, so the count must
return to zero — otherwise an unrelated failure hours later would trip it.
"""
import time

import pytest

import server.llm as llm


@pytest.fixture(autouse=True)
def _reset_breaker():
    """Never let one test's trip leak into the next."""
    llm._breaker_failures.clear()
    llm._breaker_tripped_until = 0.0
    yield
    llm._breaker_failures.clear()
    llm._breaker_tripped_until = 0.0


def test_starts_closed():
    assert llm.upstream_is_tripped() is False
    assert llm.upstream_trip_remaining_s() == 0.0


def test_trips_after_the_threshold_of_consecutive_failures():
    for _ in range(llm._BREAKER_THRESHOLD - 1):
        llm.note_upstream_failure()
    assert llm.upstream_is_tripped() is False, "must not trip one failure early"

    llm.note_upstream_failure()  # the threshold-th
    assert llm.upstream_is_tripped() is True
    assert llm.upstream_trip_remaining_s() > 0


def test_a_success_clears_the_count():
    """A real answer proves the upstream is up — the counter must reset."""
    for _ in range(llm._BREAKER_THRESHOLD - 1):
        llm.note_upstream_failure()
    llm.note_upstream_success()
    # A single later failure must not trip it, because the run was broken.
    llm.note_upstream_failure()
    assert llm.upstream_is_tripped() is False


def test_failures_outside_the_window_do_not_count():
    """Stale failures must age out, or a slow trickle would trip it eventually."""
    for _ in range(llm._BREAKER_THRESHOLD):
        llm._breaker_failures.append(time.monotonic() - llm._BREAKER_WINDOW_S - 1)
    llm.note_upstream_failure()  # this one prunes the stale entries
    assert llm.upstream_is_tripped() is False


def test_call_llm_refuses_while_tripped():
    """The refusal must happen BEFORE any HTTP request is made."""
    llm._breaker_tripped_until = time.monotonic() + 60

    calls = {"n": 0}

    class _Client:
        def __init__(self, *a, **k):
            pass
        async def __aenter__(self):
            calls["n"] += 1
            return self
        async def __aexit__(self, *a):
            return False
        async def post(self, *a, **k):
            calls["n"] += 1
            raise AssertionError("the breaker must prevent the HTTP call entirely")

    monkey = llm.httpx.AsyncClient
    llm.httpx.AsyncClient = _Client
    try:
        import asyncio
        with pytest.raises(RuntimeError) as ei:
            asyncio.run(llm.call_llm("hi", "sys"))
        assert "appears to be down" in str(ei.value)
    finally:
        llm.httpx.AsyncClient = monkey

    assert calls["n"] == 0, "no request may be made while the breaker is tripped"


def test_the_trip_message_is_human_readable():
    """The caller surfaces this text to a user, so it must not be a stack trace."""
    llm._breaker_tripped_until = time.monotonic() + 30
    msg = None
    try:
        import asyncio
        asyncio.run(llm.call_llm("hi", "sys"))
    except RuntimeError as e:
        msg = str(e)
    assert msg and "appears to be down" in msg
    assert "Traceback" not in msg
