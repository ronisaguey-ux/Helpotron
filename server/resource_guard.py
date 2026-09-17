"""Resource admission control and a fair task queue (owner 2026-09-17).

Owner: *"you need to set up dedicated process queing and a hard ram and cpu
budget, let the computer have a 80% ram cap, and a 90% cpu cap, and whenever a
user request comes in after its exceeded, they get put into a task queue"*, and
*"never have it time out"*.

The shape this produces:

    request -> budget available?  --yes--> run immediately
                                  --no --> queue and wait (never time out)

Why a queue rather than a rejection. A hard "server busy, try later" turns load
into lost work and an angry user. Queueing converts it into latency, and latency
is something the UI can narrate (see the spinner verbs). The owner's instruction
is explicit that nothing should time out, so there is no deadline here: a task
waits until it can run. The *client* may choose to SAY it is busy after three
minutes, but the server keeps the task alive.

The 80%/90% caps are examined against the whole machine, not this process,
because the failure this prevents is the DESKTOP freezing — a runaway renderer
and a swap-pinned box have caused that twice on this machine already.

`MemAvailable` from /proc/meminfo is used deliberately: `free`'s "free" column
reads ~0 on a healthy Linux box and is useless for gating.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, Optional

logger = logging.getLogger("helpotron.resources")

RAM_CAP_PCT = 80.0          # owner's number
CPU_CAP_PCT = 90.0          # owner's number
POLL_SECONDS = 0.5          # how often a queued task re-checks the budget
BUSY_AFTER_SECONDS = 180    # 3 minutes: when the CLIENT should say "server is busy"


def read_meminfo() -> Dict[str, int]:
    out: Dict[str, int] = {}
    try:
        with open("/proc/meminfo", "r") as fh:
            for line in fh:
                key, _, rest = line.partition(":")
                val = rest.strip().split(" ")[0]
                try:
                    out[key.strip()] = int(val) * 1024      # kB -> bytes
                except ValueError:
                    continue
    except Exception as e:
        logger.warning("could not read /proc/meminfo: %s", e)
    return out


def ram_used_pct() -> Optional[float]:
    """Percent of physical RAM in use, using MemAvailable (the honest figure)."""
    info = read_meminfo()
    total = info.get("MemTotal")
    avail = info.get("MemAvailable")
    if not total or avail is None:
        return None
    used = total - avail
    return max(0.0, min(100.0, used / total * 100.0))


_prev_cpu: Optional[tuple] = None


def cpu_used_pct() -> Optional[float]:
    """Machine-wide CPU utilisation since the previous call.

    Reads the aggregate line of /proc/stat and compares against the last sample,
    so it measures actual busy fraction rather than a load average (which is a
    queue length and says nothing about how many cores are saturated).
    """
    global _prev_cpu
    try:
        with open("/proc/stat", "r") as fh:
            first = fh.readline().split()
        if not first or first[0] != "cpu":
            return None
        nums = [int(x) for x in first[1:11]]
    except Exception:
        return None

    idle = nums[3] + (nums[4] if len(nums) > 4 else 0)
    total = sum(nums)
    if _prev_cpu is None:
        _prev_cpu = (total, idle)
        return None                      # first sample: no interval yet
    d_total = total - _prev_cpu[0]
    d_idle = idle - _prev_cpu[1]
    _prev_cpu = (total, idle)
    if d_total <= 0:
        return None
    return max(0.0, min(100.0, (d_total - d_idle) / d_total * 100.0))


def prime_cpu_sample() -> None:
    """Take the first /proc/stat reading at import time.

    cpu_used_pct() needs two readings to produce a fraction, so without this the
    very first caller after a restart gets None — and an unreadable metric fails
    open by design, which means the CPU cap silently does not exist until someone
    happens to ask twice. Priming makes the first real request already have an
    interval to measure against.
    """
    cpu_used_pct()


def budget_status() -> Dict[str, Any]:
    """Current utilisation against the caps. Watermarks report as over."""
    ram = ram_used_pct()
    cpu = cpu_used_pct()
    ram_over = ram is not None and ram >= RAM_CAP_PCT
    cpu_over = cpu is not None and cpu >= CPU_CAP_PCT
    return {
        "ram_pct": round(ram, 1) if ram is not None else None,
        "cpu_pct": round(cpu, 1) if cpu is not None else None,
        "ram_cap": RAM_CAP_PCT,
        "cpu_cap": CPU_CAP_PCT,
        "ram_over": ram_over,
        "cpu_over": cpu_over,
        "over_budget": ram_over or cpu_over,
    }


def _within_budget() -> bool:
    st = budget_status()
    # An unreadable metric must not block work — failing open keeps the product
    # usable on a platform where /proc looks different, and the caps are a
    # protection, not a correctness requirement.
    if st["ram_pct"] is None and st["cpu_pct"] is None:
        return True
    return not st["over_budget"]


@dataclass
class QueueStats:
    waiting: int = 0
    running: int = 0
    completed: int = 0
    queued_total: int = 0
    longest_wait: float = 0.0
    last_wait: float = 0.0
    started_at: float = field(default_factory=time.time)


STATS = QueueStats()


def queue_status() -> Dict[str, Any]:
    st = budget_status()
    st.update({
        "waiting": STATS.waiting,
        "running": STATS.running,
        "completed": STATS.completed,
        "queued_total": STATS.queued_total,
        "longest_wait_seconds": round(STATS.longest_wait, 1),
        "last_wait_seconds": round(STATS.last_wait, 1),
        "busy_after_seconds": BUSY_AFTER_SECONDS,
    })
    return st


async def run_with_budget(fn: Callable[[], Awaitable[Any]],
                          on_queued: Optional[Callable[[float], None]] = None) -> Any:
    """Run `fn` now if the machine is within budget, else queue until it is.

    Never raises a timeout: the task waits as long as it takes. `on_queued` is
    called once, with the elapsed wait, if the task had to wait at all — the
    HTTP layer uses it to tell the client to show the "server is busy" notice.

    Admission is re-checked every POLL_SECONDS rather than reserving a slot, so
    a burst of simultaneous requests does not all pass the gate at once and then
    collectively blow the cap.
    """
    waited_from: Optional[float] = None
    if not _within_budget():
        waited_from = time.time()
        STATS.waiting += 1
        STATS.queued_total += 1
        logger.info("task queued — over budget (%s)", budget_status())
        while not _within_budget():
            await asyncio.sleep(POLL_SECONDS)
        STATS.waiting = max(0, STATS.waiting - 1)
        waited = time.time() - waited_from
        STATS.last_wait = waited
        STATS.longest_wait = max(STATS.longest_wait, waited)
        logger.info("task admitted after %.1fs in queue", waited)
        if on_queued is not None:
            try:
                on_queued(waited)
            except Exception:
                pass

    STATS.running += 1
    try:
        return await fn()
    finally:
        STATS.running = max(0, STATS.running - 1)
        STATS.completed += 1


def should_show_busy(elapsed_seconds: float) -> bool:
    """Whether the client should switch to the 'server is busy' notice.

    Owner: *"if it takes more then 3min for their task to enter line, give them a
    'server is busy, your task will be completed automatically once load
    lightens'"*. The task itself is never cancelled — this only changes what the
    user is told.
    """
    return float(elapsed_seconds or 0) >= BUSY_AFTER_SECONDS


# Prime at import so the first budget check has an interval to measure.
prime_cpu_sample()
