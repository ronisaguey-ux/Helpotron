"""Sandbox isolation tests (sweep#2 S1-1).

The sandbox runs model-authored code. The finding was that it runs as the
server's own UID with no isolation, so a script can read `.env` and the
production database.

What is asserted here is deliberately narrow, because the honest answer on this
box is narrow: namespace isolation is UNAVAILABLE (AppArmor blocks unprivileged
user namespaces, measured), so these tests pin the two controls that DO work
unprivileged — the seccomp filter and the resource limits — and pin that the
module reports the residual rather than implying safety it does not provide.

The regression each test guards is specific, because the naive versions of both
controls were wrong in ways that only showed up on node:

* a flat RLIMIT_NPROC broke `node` (exit -6 at thread creation);
* counting process LEADERS instead of TASKS produced a limit BELOW the real
  count, breaking node again for the same reason.
"""
import os
import subprocess
import sys

import pytest

from server.engine import sandbox_isolation as si


# ── capability reporting ─────────────────────────────────────────────────────

def test_isolation_report_is_honest_about_the_residual():
    report = si.isolation_report()
    assert report["seccomp"] is True
    assert report["resource_limits"] is True
    if not report["namespace_isolation"]:
        # The report must name the blocker and the residual, so an operator
        # cannot read this module as "the sandbox is isolated".
        assert "apparmor_restrict_unprivileged_userns" in report["namespace_blocked_by"]
        assert ".env" in report["residual_risk"]


def test_syscall_table_matches_the_architecture():
    table = si.syscall_table()
    assert table is not None, f"no syscall table for {si.platform.machine()}"
    for name in ("ptrace", "process_vm_readv", "process_vm_writev", "mount"):
        assert name in table


# ── seccomp ──────────────────────────────────────────────────────────────────

def test_seccomp_blocks_ptrace_with_a_real_control():
    """The control matters: without the filter ptrace SUCCEEDS, so a passing
    test on its own would prove nothing about the filter."""
    import ctypes

    probe = (
        "import ctypes\n"
        "libc = ctypes.CDLL('libc.so.6', use_errno=True)\n"
        "print(libc.ptrace(0, 0, None, None))\n"
    )
    without = subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True)
    assert without.stdout.strip() == "0", "control failed: ptrace should succeed unfiltered"

    with_filter = subprocess.run(
        [sys.executable, "-c", probe],
        preexec_fn=si.harden_child_process,
        capture_output=True, text=True,
    )
    assert with_filter.stdout.strip() == "-1", "ptrace was NOT blocked by the filter"


# ── resource limits ──────────────────────────────────────────────────────────

def test_fork_bomb_is_bounded():
    """Measured: 2000 forks unbounded vs the headroom when limited."""
    probe = (
        "import os\n"
        "ok = 0\n"
        "for _ in range(2000):\n"
        "    try:\n"
        "        pid = os.fork()\n"
        "        if pid == 0: os._exit(0)\n"
        "        ok += 1\n"
        "    except OSError:\n"
        "        break\n"
        "print(ok)\n"
    )
    limited = subprocess.run(
        [sys.executable, "-c", probe],
        preexec_fn=si.harden_child_process,
        capture_output=True, text=True,
    )
    succeeded = int(limited.stdout.strip())
    assert succeeded < 2000, "the fork loop was not bounded"
    assert succeeded <= si.DEFAULT_PROCESS_HEADROOM + 8, (
        f"more forks than the headroom allows: {succeeded}"
    )


def test_nproc_limit_is_relative_to_the_live_task_count():
    """A flat cap, or one counted in process leaders, silently kills node.

    The two regressions this must catch, both of which shipped once:
      * a flat RLIMIT_NPROC (64) — far below the live task count;
      * counting process LEADERS (~153) instead of TASKS (~1189) — the computed
        limit lands below the real count.
    Both are caught by `limit > live`, so that is the assertion that matters.
    The live count moves while the box is busy, so the headroom check is a floor
    with slack rather than an exact equality.
    """
    before = si._count_uid_tasks()
    limit = si._nproc_limit(si.DEFAULT_PROCESS_HEADROOM)
    after = si._count_uid_tasks()

    assert limit > after, (
        f"limit {limit} is at or below the live task count {after} — children cannot thread"
    )
    assert limit - min(before, after) >= si.DEFAULT_PROCESS_HEADROOM // 2, (
        "the limit does not clear the live count by a usable headroom"
    )


def test_task_count_includes_threads_not_just_leaders():
    """The kernel counts tasks. Counting leaders under-reports by ~8x here."""
    leaders = 0
    with os.scandir("/proc") as entries:
        for entry in entries:
            if entry.name.isdigit():
                try:
                    if entry.stat(follow_symlinks=False).st_uid == os.getuid():
                        leaders += 1
                except OSError:
                    continue
    assert si._count_uid_tasks() >= leaders


@pytest.mark.parametrize("language,cmd", [
    ("python", [sys.executable, "-c", "print(6*7)"]),
    ("bash", ["bash", "-c", "echo ok"]),
    ("node", ["node", "-e", "console.log('ok')"]),
    ("sympy", [sys.executable, "-c", "import sympy; print(sympy.isprime(97))"]),
])
def test_hardened_children_still_run_real_work(language, cmd):
    """Every language the sandbox advertises must survive the hardening."""
    proc = subprocess.run(cmd, preexec_fn=si.harden_child_process,
                          capture_output=True, text=True)
    assert proc.returncode == 0, (
        f"{language} failed under hardening (exit {proc.returncode}): "
        f"{proc.stderr.strip()[:200]}"
    )


def test_no_new_privs_is_set():
    probe = "import ctypes\nlibc=ctypes.CDLL('libc.so.6',use_errno=True)\nprint(libc.prctl(39,0,0,0,0))\n"
    proc = subprocess.run([sys.executable, "-c", probe],
                          preexec_fn=si.harden_child_process,
                          capture_output=True, text=True)
    # PR_GET_NO_NEW_PRIVS == 39 -> 1 when set
    assert proc.stdout.strip() == "1"
