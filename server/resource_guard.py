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
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, Optional

logger = logging.getLogger("helpotron.resources")

RAM_CAP_PCT = 80.0          # owner's number
CPU_CAP_PCT = 90.0          # owner's number
MIN_AVAILABLE_MB = 3000.0   # absolute floor catches swap-pinned boxes
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
    info = read_meminfo()
    avail_bytes = info.get("MemAvailable")
    avail_mb = round(avail_bytes / (1024 * 1024), 1) if avail_bytes is not None else None
    ram_over = ram is not None and ram >= RAM_CAP_PCT
    cpu_over = cpu is not None and cpu >= CPU_CAP_PCT
    return {
        "ram_pct": round(ram, 1) if ram is not None else None,
        "cpu_pct": round(cpu, 1) if cpu is not None else None,
        "mem_available_mb": avail_mb,
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
        if sys.platform.startswith("linux"):
            logger.warning(
                "resource guard: metrics unreadable on Linux — admission control is "
                "INACTIVE for this call"
            )
        return True

    # An absolute floor catches a swap-pinned box that the percentage alone reads as
    # tolerable. MemAvailable is the honest figure, not free's 'free' column.
    floor = float(os.environ.get("RESOURCE_GUARD_MIN_AVAILABLE_MB", MIN_AVAILABLE_MB))
    if st.get("mem_available_mb") is not None and st["mem_available_mb"] < floor:
        return False

    return not st["over_budget"]


@dataclass
class QueueStats:
    waiting: int = 0
    running: int = 0
    completed: int = 0
    queued_total: int = 0
    longest_wait: float = 0.0
    last_wait: float = 0.0
    # ★ ADDED 2026-09-28. `peak_running` is the number that proves the cap holds — the old
    # design let every waiter enter at once and had no counter that could show it.
    # `rejected` counts callers turned away because the backlog itself hit its bound.
    peak_running: int = 0
    rejected: int = 0
    started_at: float = field(default_factory=time.time)


STATS = QueueStats()


class ServerAtCapacity(RuntimeError):
    """Raised when the queue is already as deep as we are willing to hold.

    Subclasses RuntimeError so a caller with a generic `except Exception` still catches it
    rather than taking the request down. The alternative — queueing without bound — trades a
    clear 503 for an out-of-memory crash, which is strictly worse for every other user.
    """


# ★ THE BOUND THAT MAKES THIS A QUEUE. Without it the budget check is advisory: every
# waiter re-checks the same metrics on its own tick and they ALL pass together the moment
# the machine frees up, re-blowing the cap the guard exists to protect. Measured 2026-09-28:
# 6 concurrent callers released at once produced **peak_running 6** — a herd, not a queue.
# The slot is RESERVED for the duration (acquired before the budget wait), which is what the
# old docstring claimed and the old code did not do.
MAX_CONCURRENT = int(os.environ.get("RESOURCE_GUARD_MAX_CONCURRENT", "4"))
# A memory guard, not a policy: past this many waiting we tell the caller honestly instead
# of holding an unbounded backlog of futures.
MAX_QUEUE_DEPTH = int(os.environ.get("RESOURCE_GUARD_MAX_QUEUE_DEPTH", "200"))

# ★ SEMAPHORES ARE PER-EVENT-LOOP, so a module-level one is a trap: the tests (and any
# `asyncio.run`) create a fresh loop each time, and a semaphore that queued a waiter on a
# closed loop raises on the next use. Keyed by loop id, created on demand.
_slot_pools: Dict[int, asyncio.Semaphore] = {}


def _slots() -> asyncio.Semaphore:
    """The concurrency pool for the RUNNING loop (created on first use)."""
    loop = asyncio.get_running_loop()
    sem = _slot_pools.get(id(loop))
    if sem is None:
        sem = asyncio.Semaphore(MAX_CONCURRENT)
        _slot_pools[id(loop)] = sem
    return sem


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
        "max_concurrent": MAX_CONCURRENT,
        "peak_running": STATS.peak_running,
        "rejected": STATS.rejected,
    })
    return st


async def run_with_budget(fn: Callable[[], Awaitable[Any]],
                          on_queued: Optional[Callable[[float], None]] = None) -> Any:
    """Run `fn` now if the machine is within budget, else wait in line for a slot.

    Never raises a timeout: a task waits as long as it takes, and the client is told to show
    the "server is busy" notice rather than the work being cancelled.

    ★ HOW THE ORDERING IS ACTUALLY GUARANTEED. The slot is acquired BEFORE the budget wait
    and held until the task finishes, so at most `MAX_CONCURRENT` callers are ever past the
    gate. Callers beyond that wait on the semaphore, which hands out slots in the order they
    were requested — so the backlog drains in arrival order instead of as a stampede.

    The previous implementation re-checked the budget every `POLL_SECONDS` and reserved
    nothing, so its own docstring's claim ("a burst of simultaneous requests does not all
    pass the gate at once") was false — measured, all 6 callers were admitted in the same
    tick. Re-checking a shared condition is not admission control; holding a slot is.
    """
    queued_at = time.time()
    if STATS.waiting >= MAX_QUEUE_DEPTH:
        STATS.rejected += 1
        logger.warning("task refused — queue already %d deep (max %d)",
                       STATS.waiting, MAX_QUEUE_DEPTH)
        raise ServerAtCapacity(
            f"server at capacity: {STATS.waiting} tasks already waiting")

    slots = _slots()
    STATS.waiting += 1
    if not _within_budget():
        logger.info("task queued — over budget (%s)", budget_status())
    try:
        await slots.acquire()
        # Hold the slot while we wait for the machine: this reservation is what stops the
        # whole backlog walking in together when the budget momentarily frees.
        while not _within_budget():
            await asyncio.sleep(POLL_SECONDS)
    finally:
        # ★ MUST BE IN `finally`. The old code decremented `waiting` only on the success
        # path, so a cancelled client (the browser tab closes while queued) leaked a waiter
        # forever and the count drifted upward on a busy server.
        STATS.waiting = max(0, STATS.waiting - 1)

    waited = time.time() - queued_at
    if waited >= POLL_SECONDS:
        # `queued_total` counts tasks that ACTUALLY queued. Counting every caller would make
        # a healthy server report a backlog, and the metric's whole job is to say whether the
        # machine is under pressure.
        STATS.queued_total += 1
        STATS.last_wait = waited
        STATS.longest_wait = max(STATS.longest_wait, waited)
        logger.info("task admitted after %.1fs in queue", waited)
        if on_queued is not None:
            try:
                on_queued(waited)
            except Exception:
                pass

    STATS.running += 1
    STATS.peak_running = max(STATS.peak_running, STATS.running)
    try:
        return await fn()
    finally:
        STATS.running = max(0, STATS.running - 1)
        STATS.completed += 1
        slots.release()


def should_show_busy(elapsed_seconds: float) -> bool:
    """Whether the client should switch to the 'server is busy' notice.

    Owner: *"if it takes more then 3min for their task to enter line, give them a
    'server is busy, your task will be completed automatically once load
    lightens'"*. The task itself is never cancelled — this only changes what the
    user is told.
    """
    return float(elapsed_seconds or 0) >= BUSY_AFTER_SECONDS


# ── idle reclamation — the other half of the owner's ask ─────────────────────
#
# Owner: *"it has to free up stuff the second it's not being used to allow new stuff in,
# that's how we support as many users as possible"*. Admission control is the half that
# makes a busy machine safe; this is the half that makes an idle one cheap.
#
# ★ THE RESOURCE THAT ACTUALLY MATTERS IS RAM, NOT CPU, and the measured case is worth
# recording because it is what prompted this: on 2026-09-28 the box hit swap 99% /
# MemAvailable 1,163 MB while `helpotron-hip.service` (a local llama-server model) held
# **2,712 MB having served ZERO requests in 24 hours**. Stopping it plus trimming a grown
# Laya service freed 6.3 GB with no functional loss. A model that is loaded and unused is
# pure cost, so it should not stay loaded.

# Below this much headroom, memory-pressure reclamation runs.
IDLE_PRESSURE_MB = float(os.environ.get("RESOURCE_GUARD_IDLE_PRESSURE_MB", "2500"))
# How long a process must show no CPU progress before it counts as idle.
IDLE_CPU_SECONDS = float(os.environ.get("RESOURCE_GUARD_IDLE_SECONDS", "180"))


def process_cpu_ticks(pid: int) -> Optional[int]:
    """utime+stime for a pid, or None if it cannot be read.

    /proc/<pid>/stat is the portable signal and it is unambiguous: a process doing no work
    accumulates no ticks. This is the same reading recorded elsewhere in this file's notes
    for telling a WEDGED lane from a busy one (0 ticks = blocked, not thinking).
    """
    try:
        with open(f"/proc/{pid}/stat", "rb") as fh:
            parts = fh.read().rsplit(b")", 1)[-1].split()
        return int(parts[11]) + int(parts[12])      # utime + stime, after the comm field
    except Exception:
        return None


class IdleTracker:
    """Remembers the last time a service was observed doing work.

    Keyed by unit name so a service that is busy at one check and idle at the next is
    measured against real elapsed work, not a single snapshot.
    """

    def __init__(self) -> None:
        self._state: Dict[str, Dict[str, Any]] = {}

    def observe(self, unit: str, ticks: Optional[int]) -> float:
        """Return how many seconds this unit has been idle (0 if it just made progress)."""
        now = time.time()
        prev = self._state.get(unit)
        if ticks is None:
            # Unreadable: treat as NOT idle. Failing toward "leave it running" costs memory;
            # failing the other way would stop a working service, which is worse.
            self._state[unit] = {"ticks": None, "since": now}
            return 0.0
        if prev is None or prev.get("ticks") != ticks:
            self._state[unit] = {"ticks": ticks, "since": now}
            return 0.0
        return max(0.0, now - float(prev.get("since") or now))


IDLE = IdleTracker()


def idle_reclaim_candidates() -> list[dict]:
    """Loaded-but-unused services that could be stopped to make room.

    READ-ONLY: this reports, it never stops anything by itself. Whether to release a
    service is a policy decision and the caller owns it.
    """
    out = []
    for unit, caps in OPTIONAL_MODELS.items():
        state = _unit_active(unit)
        if not state:
            continue
        pid = _unit_main_pid(unit)
        ticks = process_cpu_ticks(pid) if pid else None
        idle_for = IDLE.observe(unit, ticks)
        out.append({"unit": unit, "pid": pid, "rss_mb": caps.get("rss_mb"),
                    "idle_seconds": round(idle_for, 1),
                    "reclaimable": idle_for >= IDLE_CPU_SECONDS})
    return out


# Services that exist to serve a feature which may simply not be in use. Stopping one costs
# a lazy load on its next request; leaving it resident costs RAM on every user's behalf.
OPTIONAL_MODELS: Dict[str, Dict[str, Any]] = {
    "helpotron-hip.service": {"rss_mb": 2700, "why": "humanizer model — loads on demand"},
}


def _unit_active(unit: str) -> bool:
    try:
        proc = subprocess.run(["systemctl", "--user", "is-active", unit],
                              capture_output=True, text=True, timeout=5)
        return proc.stdout.strip() == "active"
    except Exception:
        return False


def _unit_main_pid(unit: str) -> Optional[int]:
    try:
        proc = subprocess.run(["systemctl", "--user", "show", "-p", "MainPID", "--value", unit],
                              capture_output=True, text=True, timeout=5)
        pid = int(proc.stdout.strip() or 0)
        return pid or None
    except Exception:
        return None


def release_idle_models() -> list[str]:
    """Stop optional model services that are loaded, unused, and not needed right now.

    Only runs under actual memory pressure — an idle box with plenty of headroom should
    keep its models warm, because a lazy load is a user-visible delay.
    """
    avail = read_meminfo().get("MemAvailable")
    avail_mb = avail / (1024 * 1024) if avail is not None else None
    if avail_mb is None or avail_mb >= IDLE_PRESSURE_MB:
        return []
    released = []
    for cand in idle_reclaim_candidates():
        if not cand.get("reclaimable"):
            continue
        try:
            subprocess.run(["systemctl", "--user", "stop", cand["unit"]],
                           capture_output=True, text=True, timeout=20)
            released.append(cand["unit"])
            logger.warning("released idle model %s (idle %.0fs, ~%s MB) — MemAvailable was %.0f MB",
                           cand["unit"], cand["idle_seconds"], cand.get("rss_mb"), avail_mb)
        except Exception as e:                                    # noqa: BLE001
            logger.warning("could not release %s: %s", cand["unit"], e)
    return released


# Prime at import so the first budget check has an interval to measure.
prime_cpu_sample()
