"""Pytest wrapper for the activity watchdog.

Does the watchdog kill a WEDGED process and leave a WORKING one alone?

Both directions must be proven: a watchdog tested only in the kill direction passes while
killing legitimate long work, which is the opposite of what the owner asked for.

★ THE TEST DRIVES A *SEQUENCE* OF SWEEPS, because that is how the real one runs. The first
sweep on a process establishes its CPU baseline; only a later sweep can see "no progress".
A single sweep can never prove a stall.

Each phase waits for its own process to be fully reaped before the next starts, so a zombie
from phase 1 can never be mistaken for a stall in phase 2 — that mistake is exactly what the
first draft of this test made, and it is the same shape as the real `_read_ticks` bug it
exposed.
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server import activity_watchdog as aw  # noqa: E402


def _spawn(code: str) -> subprocess.Popen:
    return subprocess.Popen([sys.executable, "-c", code])


def _reap(proc: subprocess.Popen, timeout: float = 6.0) -> None:
    """Make sure the process is GONE and reaped before the next phase reads /proc."""
    try:
        proc.kill()
    except Exception:
        pass
    try:
        proc.wait(timeout=timeout)
    except Exception:
        pass


def _sweep_until(wd, seconds: float, step: float = 0.6):
    """Run sweeps like the real monitor loop does, collecting every kill."""
    kills = []
    deadline = time.time() + seconds
    while time.time() < deadline:
        kills.extend(wd.sweep())
        time.sleep(step)
    return kills


def main() -> int:
    ok = True
    tmp = tempfile.mkdtemp(prefix="wd_")
    aw.KILL_LOG = Path(tmp) / "kills.jsonl"
    aw.STALL_SECONDS = 2.0
    aw.MIN_RSS_MB = 0.0

    # ── wedged: sleeping forever, holding memory, zero CPU progress ──
    print("\n  --- a WEDGED process is killed ---")
    wd = aw.ActivityWatchdog()
    wedged = _spawn("import time\nwhile True: time.sleep(60)\n")
    wd.register("wedged", wedged.pid, "humanize", "user_probe")
    print(f"    spawned pid={wedged.pid}, sweeping for 4s...")
    kills = _sweep_until(wd, 4.0)
    alive = aw._read_ticks(wedged.pid) is not None
    print(f"    kills: {len(kills)}   still resident: {alive}")
    if kills and not alive and kills[0]["label"] == "humanize":
        print(f"    PASS — killed for inactivity after {kills[0]['idle_seconds']}s idle.")
    else:
        print("    FAIL — the wedged process survived.")
        ok = False
    _reap(wedged)

    # ── busy: burning CPU, must survive ──
    print("\n  --- a WORKING process is left alone ---")
    wd2 = aw.ActivityWatchdog()
    busy = _spawn("while True: pass\n")
    wd2.register("busy", busy.pid, "detection")
    t0 = aw._read_ticks(busy.pid)
    print(f"    spawned pid={busy.pid}, sweeping for 4s...")
    kills2 = _sweep_until(wd2, 4.0)
    t1 = aw._read_ticks(busy.pid)
    print(f"    kills: {len(kills2)}   ticks {t0} -> {t1}")
    if not kills2 and t1 is not None and t1 > (t0 or 0):
        print("    PASS — CPU progress protects long work, exactly as the owner required.")
    else:
        print("    FAIL — a working process was killed for duration.")
        ok = False
    _reap(busy)

    # ── exited: forgotten, and never reported as a kill ──
    print("\n  --- an EXITED process is forgotten, not killed ---")
    wd3 = aw.ActivityWatchdog()
    gone = _spawn("pass")
    gone.wait(timeout=5)
    wd3.register("gone", gone.pid, "summary")
    kwargs = _sweep_until(wd3, 2.0)
    print(f"    kills: {len(kwargs)}   still tracked: {len(wd3.tracked())}")
    if not kwargs:
        print("    PASS — completion is never reported as a kill.")
    else:
        print("    FAIL — an exited process produced a kill record.")
        ok = False

    # ── the kill is recorded so a wake can act on it ──
    print("\n  --- the kill is RECORDED so it can be investigated ---")
    lines = aw.KILL_LOG.read_text().splitlines() if aw.KILL_LOG.exists() else []
    print(f"    kill log lines: {len(lines)} (only the real kill belongs here)")
    if len(lines) == 1:
        rec = json.loads(lines[0])
        print(f"    user told : {rec['user_message']!r}")
        print(f"    reason    : {rec['reason']}")
        print(f"    label     : {rec['label']}  idle={rec['idle_seconds']}s rss={rec['rss_mb']}MB")
        if rec.get("killed") and "investigated" in rec["user_message"]:
            print("    PASS — the record carries what a wake needs to act on.")
        else:
            print("    FAIL — the record is not actionable.")
            ok = False
    else:
        print(f"    FAIL — expected exactly 1 kill record, found {len(lines)}: "
              "an exited process was mis-reported as a kill.")
        ok = False

    print("\n  " + ("ALL CLAIMS HOLD" if ok else "SOMETHING FAILED"))
    return 0 if ok else 1


def test_watchdog_kills_stalls_and_spares_work():
    """Wedged killed, working spared, exited forgotten, kill recorded for a wake."""
    assert main() == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
