"""Memory-budget guard (08-31, operator).

The helpotron server tree runs inside a cgroup with a 10G budget (see
start_stack.sh: systemd-run --user --scope -p MemoryMax=10G -p MemoryHigh=10G).
While the budget is consumed, every NEW request gets

    429 {"detail": "Task is in Queue, will be completed momentarily", "queued": true}

and the client (web/src/api.js) retries with backoff until RAM frees up and the
request actually runs. Liveness endpoints (/health, /api/public-config,
/api/csrf) are exempt so the tele-wake monitors never queue.

Usage = memory.current minus reclaimable page cache (memory.stat "file"):
the kernel drops cache before it ever OOMs, so queueing on cache pressure would
throttle requests for no reason. The budget is MEMORY_BUDGET_MB (default 10240)
or the cgroup's own memory.max when it is lower; the queue fires at
MEMORY_QUEUE_PCT (default 0.90) of it — 95% would sit at ~9.5G, where this
15G box starts DENYING the app's allocations outright (measured: allocations
plateau at ~9.4-9.5G, before the cgroup cap ever binds), so 90% fires at 9G
with margin. A second, machine-wide floor
(MEMORY_BOX_MIN_AVAIL_MB, default 384MB of MemAvailable) catches the small-box
case: on 15G total the app's 10G cap alone can starve the rest of the system,
and requests queue before hard thrash instead of racing to OOM.
"""
from __future__ import annotations

import json
import os

from fastapi import Request
from starlette.responses import JSONResponse

QUEUE_MESSAGE = "Task is in Queue, will be completed momentarily"

# Never queue liveness/auth-bootstrap traffic — the wake monitors need a fast
# 200 (and a queued CSRF fetch would deadlock the first POST of the session).
EXEMPT_PATHS = frozenset({"/health", "/api/health", "/api/public-config", "/api/csrf", "/favicon.ico"})


def _cgroup_relpath() -> str | None:
    """Path of this process's cgroup (v2) relative to /sys/fs/cgroup."""
    try:
        with open("/proc/self/cgroup", encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split(":", 2)
                if len(parts) == 3 and parts[1] == "":
                    return parts[2].lstrip("/")
    except OSError:
        return None
    return None


def _budget_bytes() -> int:
    try:
        return int(os.environ.get("MEMORY_BUDGET_MB", "10240")) * 1024 * 1024
    except ValueError:
        return 10 * 1024 * 1024 * 1024


def _queue_threshold(budget: int) -> int:
    """Queue point: under the budget (0.90 default — this box is 15G total and
    the kernel starts denying the app's allocations around 9.4G, so a 95% line
    would sit at the very deny point and never fire; 90% fires at 9G of a 10G
    budget with a usable margin, and the message is identical either way)."""
    try:
        pct = float(os.environ.get("MEMORY_QUEUE_PCT", "0.90"))
    except ValueError:
        pct = 0.90
    return max(1, int(budget * pct))


def _box_available_bytes() -> int | None:
    """MemAvailable from /proc/meminfo (includes reclaimable cache)."""
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        return None
    return None


def _box_min_available_bytes() -> int:
    """Second guard (this box has 15G total and the 10G app budget alone leaves
    only ~5G for everything else — Chrome, this session, the tunnel): when the
    whole MACHINE gets this low on RAM, queue too. The app's 10G cap is the
    primary trigger; this floor catches machine-wide pressure before hard
    thrash, which is what actually bites on a small box."""
    try:
        return int(os.environ.get("MEMORY_BOX_MIN_AVAIL_MB", "384")) * 1024 * 1024
    except ValueError:
        return 384 * 1024 * 1024


def _parse_memory_stat_file(stat_text: str) -> int:
    """'file' (reclaimable page cache) from a cgroup v2 memory.stat — BYTES."""
    for line in stat_text.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[0] == "file":
            return int(parts[1])
    return 0


def memory_usage_bytes() -> tuple[int, int] | None:
    """(pressure-bytes, budget-bytes) for the server's own cgroup, or None.

    pressure = memory.current - file (reclaimable page cache). None means the
    cgroup is unreadable — callers treat that as "no guard", never fail closed
    (a broken guard must not take the API down with it).
    """
    rel = _cgroup_relpath()
    if not rel or "../" in rel:
        return None
    base = os.path.join("/sys/fs/cgroup", rel)
    try:
        with open(os.path.join(base, "memory.current"), encoding="utf-8") as f:
            current = int(f.read().strip() or 0)
        with open(os.path.join(base, "memory.stat"), encoding="utf-8") as f:
            file_bytes = _parse_memory_stat_file(f.read())
        budget = _budget_bytes()
        with open(os.path.join(base, "memory.max"), encoding="utf-8") as f:
            max_raw = f.read().strip()
        if max_raw != "max":
            try:
                budget = min(budget, int(max_raw))
            except ValueError:
                pass
        return max(0, current - file_bytes), budget
    except (OSError, ValueError):
        return None


class MemoryBudgetMiddleware:
    """429 the request when the memory budget is exhausted (operator 08-31)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if path in EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return
        usage = memory_usage_bytes()
        if usage is not None:
            current, budget = usage
            if current >= _queue_threshold(budget):
                await _queue_response(send)
                return
        # Machine-wide floor: on a 15G box the app's 10G cap alone can leave
        # the machine with almost nothing — protect it from hard thrash too.
        box = _box_available_bytes()
        if box is not None and box < _box_min_available_bytes():
            await _queue_response(send)
            return
        await self.app(scope, receive, send)


async def _queue_response(send):
    body = json.dumps(
        {"detail": QUEUE_MESSAGE, "queued": True}, ensure_ascii=False
    ).encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": 429,
        "headers": [
            (b"content-type", b"application/json; charset=utf-8"),
            (b"retry-after", b"3"),
        ],
    })
    await send({"type": "http.response.body", "body": body})
