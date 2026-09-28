"""Kill a process that is holding RAM and doing nothing — by ACTIVITY, not by clock.

Owner, 2026-09-28, verbatim: *"don't kill based on time, kill based on activity, make it so
that if any process just doesnt show any activity for over 2min and is just taking up ram, it
gets killed and the user gets 'There was an issue with your request, it is getting
investigated' and have it so u wake up on every kill, investigate and fix when necessary,
create a custom monitor for that"*.

★ ACTIVITY IS CPU PROGRESS, AND THAT IS THE RIGHT SIGNAL ON THIS BOX. Two independent facts
already measured here make it sound: a genuinely working process burns CPU, and this machine's
own frozen-lane diagnosis is "0 CPU ticks + unresponsive = BLOCKED, not thinking". A task that
has held memory for two minutes without a single tick has wedged — waiting longer only costs
the machine.

★ WHY A WATCHDOG AND NOT A TIMEOUT. The owner's earlier rule stands: a task must never be
killed merely for taking long, and humanization legitimately runs for minutes. A clock cannot
tell those apart; CPU progress can. This kills ONLY the no-progress case.

Every kill is recorded to a JSONL file that `oc_taskkill_wake.py` polls, so a kill wakes the
session rather than happening silently.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# No CPU progress for this long, while still resident, means wedged.
STALL_SECONDS = float(os.environ.get("HELPOTRON_STALL_SECONDS", "120"))
# Below this RSS it is not worth killing — a tiny idle process is not the problem.
MIN_RSS_MB = float(os.environ.get("HELPOTRON_STALL_MIN_RSS_MB", "150"))
# How often the monitor loop should call `sweep()`.
SWEEP_INTERVAL = float(os.environ.get("HELPOTRON_STALL_SWEEP", "20"))

KILL_LOG = Path(os.environ.get(
    "HELPOTRON_KILL_LOG",
    str(Path(__file__).resolve().parent.parent / "data_lake" / "task_kills.jsonl"),
))

# What the user is told. Owner-specified wording — do not soften it into "try again later",
# which would imply the request is resumable when the work is actually being investigated.
USER_MESSAGE = ("There was an issue with your request. It is getting investigated.")


def _read_ticks(pid: int) -> Optional[int]:
    """utime+stime for a pid, or None if unreadable/dead.

    ★ RETURNS None FOR A ZOMBIE. A process that has exited but not yet been reaped still has
    a `/proc/<pid>/stat` whose ticks are FROZEN — which is indistinguishable from a stall by
    ticks alone. Measured 2026-09-28: a zombie was reported as a kill, and the same shape
    would make every finished-but-unreaped task look like a wedged one. Normal completion
    must never produce a kill record.
    """
    try:
        with open(f"/proc/{pid}/stat", "rb") as fh:
            tail = fh.read().rsplit(b")", 1)[-1].split()
        if tail[0:1] == [b"Z"]:                 # zombie: exited, awaiting reap
            return None
        return int(tail[11]) + int(tail[12])
    except Exception:
        return None


def _read_rss_mb(pid: int) -> float:
    try:
        with open(f"/proc/{pid}/status", "r") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    return float(line.split()[1]) / 1024.0
    except Exception:
        pass
    return 0.0


def _cmdline(pid: int) -> str:
    try:
        raw = Path(f"/proc/{pid}/cmdline").read_bytes()
        return " ".join(p.decode("utf-8", "replace") for p in raw.split(b"\0") if p)[:200]
    except Exception:
        return ""


@dataclass
class Tracked:
    """One in-flight heavy task, watched for progress."""
    key: str
    pid: int
    label: str
    user_public_id: str = ""
    started_at: float = field(default_factory=time.time)
    last_ticks: Optional[int] = None
    last_progress_at: float = field(default_factory=time.time)
    peak_rss_mb: float = 0.0
    # A task that has not finished in this long is not a stall candidate for RAM reasons —
    # it is long work, which the owner has explicitly said must never be killed for duration.
    max_track_seconds: float = float(os.environ.get("HELPOTRON_STALL_MAX_TRACK", "3600"))
    # ★ IN-PROCESS TASKS CANNOT BE KILLED BY PID. Almost all of helpotron's heavy work runs
    # INSIDE the API process (model calls, detector inference), so `os.kill` on the pid would
    # take down the whole server. When `cancel` is supplied this entry is cancelled at the
    # task level instead, and `pid` is only used to read the process's own CPU progress.
    cancel: Optional[Any] = None


class ActivityWatchdog:
    """Tracks work for CPU progress and stops the parts that wedge while resident.

    Two kinds of tracked work, because they need opposite remedies:
      * a SUBPROCESS (pid) — killed with SIGTERM then SIGKILL;
      * an IN-PROCESS asyncio task — cancelled, never signal-killed, because signalling
        would take the API down with it.
    Both are judged by the same signal: no CPU progress for STALL_SECONDS while resident.
    """

    def __init__(self) -> None:
        self._tracked: Dict[str, Tracked] = {}
        self.kills: List[Dict[str, Any]] = []

    # ── registration ────────────────────────────────────────────────────────
    def register(self, key: str, pid: int, label: str, user_public_id: str = "") -> Tracked:
        t = Tracked(key=key, pid=pid, label=label, user_public_id=user_public_id,
                    last_ticks=_read_ticks(pid))
        self._tracked[key] = t
        return t

    def register_in_process(self, key: str, label: str, cancel, user_public_id: str = "",
                            pid: Optional[int] = None) -> Tracked:
        """Track work running INSIDE this process, cancelled rather than signalled."""
        t = Tracked(key=key, pid=int(pid if pid is not None else os.getpid()), label=label,
                    user_public_id=user_public_id, cancel=cancel,
                    last_ticks=_read_ticks(int(pid if pid is not None else os.getpid())))
        self._tracked[key] = t
        return t

    def unregister(self, key: str) -> None:
        self._tracked.pop(key, None)

    def tracked(self) -> List[Dict[str, Any]]:
        now = time.time()
        return [{"key": t.key, "pid": t.pid, "label": t.label,
                 "in_process": t.cancel is not None,
                 "age_seconds": round(now - t.started_at, 1),
                 "idle_seconds": round(now - t.last_progress_at, 1),
                 "rss_mb": round(t.peak_rss_mb, 1)}
                for t in self._tracked.values()]

    # ── the sweep ───────────────────────────────────────────────────────────
    def sweep(self) -> List[Dict[str, Any]]:
        """One pass. Returns the kills performed THIS pass.

        Only work that is (a) still live, (b) holding memory, and (c) has made no CPU
        progress for STALL_SECONDS is stopped. Work that has finished is simply forgotten —
        normal completion must never look like a kill.
        """
        killed: List[Dict[str, Any]] = []
        now = time.time()
        for key, t in list(self._tracked.items()):
            # For an in-process task the "is it alive" question is about the TASK, and the
            # CPU question is about the PROCESS that is running it.
            if t.cancel is not None:
                if _task_done(t.cancel):
                    self._tracked.pop(key, None)
                    continue
                rss = _read_rss_mb(os.getpid())
            else:
                rss = _read_rss_mb(t.pid)

            ticks = _read_ticks(t.pid)
            if ticks is None:
                self._tracked.pop(key, None)
                continue
            if rss <= 0.0:
                # No resident memory: nothing is being held, so nothing to reclaim.
                self._tracked.pop(key, None)
                continue
            t.peak_rss_mb = max(t.peak_rss_mb, rss)

            if t.last_ticks is None or ticks != t.last_ticks:
                t.last_ticks = ticks
                t.last_progress_at = now
                continue

            idle = now - t.last_progress_at
            if idle < STALL_SECONDS:
                continue
            if rss < MIN_RSS_MB:
                continue
            if now - t.started_at > t.max_track_seconds:
                self._tracked.pop(key, None)
                continue
            killed.append(self._stop(t, idle, rss))
        return killed

    def _stop(self, t: Tracked, idle: float, rss: float) -> Dict[str, Any]:
        record = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "key": t.key,
            "pid": t.pid,
            "label": t.label,
            "user_public_id": t.user_public_id,
            "idle_seconds": round(idle, 1),
            "rss_mb": round(rss, 1),
            "ran_seconds": round(time.time() - t.started_at, 1),
            "cmdline": _cmdline(t.pid),
            "in_process": t.cancel is not None,
            "user_message": USER_MESSAGE,
            "reason": "no CPU progress while holding memory",
        }
        if t.cancel is not None:
            # ★ CANCEL, DO NOT SIGNAL. The work is inside the API process; `os.kill` here
            # would stop the whole server to end one task.
            try:
                t.cancel()
                record["killed"] = True
                record["method"] = "task.cancel"
            except Exception as e:                                # noqa: BLE001
                record["killed"] = False
                record["error"] = f"{type(e).__name__}: {e}"
        else:
            try:
                os.kill(t.pid, signal.SIGTERM)
                deadline = time.time() + 5
                while time.time() < deadline and _read_ticks(t.pid) is not None:
                    time.sleep(0.2)
                if _read_ticks(t.pid) is not None:
                    os.kill(t.pid, signal.SIGKILL)
                record["killed"] = True
                record["method"] = "SIGTERM/SIGKILL"
            except ProcessLookupError:
                record["killed"] = False
                record["reason"] += " (already exited)"
            except Exception as e:                                # noqa: BLE001
                record["killed"] = False
                record["error"] = f"{type(e).__name__}: {e}"
        self._tracked.pop(t.key, None)
        self.kills.append(record)
        self._persist(record)
        logger.warning("task stopped for inactivity: %s pid=%s idle=%.0fs rss=%.0fMB (%s)",
                       t.label, t.pid, idle, rss, record.get("method"))
        return record

    @staticmethod
    def _persist(record: Dict[str, Any]) -> None:
        """Append to the kill log the wake monitor polls.

        ★ THIS WRITE IS WHY A KILL IS NOT SILENT. The owner asked to be woken on every kill
        so it can be investigated; a kill recorded only in a log line nobody reads would be
        exactly the silent-failure pattern this codebase keeps finding.
        """
        try:
            KILL_LOG.parent.mkdir(parents=True, exist_ok=True)
            with KILL_LOG.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception as e:                                    # noqa: BLE001
            logger.error("could not persist kill record: %s", e)


WATCHDOG = ActivityWatchdog()


def sweep() -> List[Dict[str, Any]]:
    """Module-level entry point for the monitor loop."""
    return WATCHDOG.sweep()


def _task_done(task: Any) -> bool:
    """Whether an asyncio task-like object has finished.

    Written defensively: the watchdog must never raise because it was handed something
    without a `.done()`, and "unknown" is treated as DONE (stop tracking) rather than as
    stalled — the safe direction is to leave work running.
    """
    try:
        return bool(task.done())
    except Exception:
        return True
