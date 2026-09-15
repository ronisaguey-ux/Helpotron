"""Unprivileged hardening for sandboxed sub-agent processes.

Why this exists — and why it is NOT a namespace sandbox
------------------------------------------------------
`sandbox.py` runs model-authored code with `cwd` bound to a workspace and a
scrubbed environment, but the child is still the server's own UID. Sweep#2 S1-1
flagged the consequence: a sandboxed script can read `.env` and the production
database as the server user.

The proper fix is a namespace sandbox. **On this box that is unavailable without
root, and that is measured, not assumed:**

    bwrap --unshare-user ...        -> bwrap: setting up uid map: Permission denied
    unshare --user --map-root-user  -> write failed /proc/self/uid_map: Operation not permitted
    systemd-run --user -p TemporaryFileSystem=... \
        -> Failed to set up mount namespacing: Operation not supported
           status=226/NAMESPACE

The cause is Ubuntu's AppArmor restriction on unprivileged user namespaces
(`kernel.apparmor_restrict_unprivileged_userns = 1`). Lifting it is a root
action (`sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`), which this
process cannot do. So `isolation_available()` reports that honestly rather than
letting a caller assume isolation it does not have.

What this module DOES provide, because it works unprivileged
-----------------------------------------------------------
1. **seccomp-bpf filter** — installed in the child before exec via
   `PR_SET_NO_NEW_PRIVS` + `PR_SET_SECCOMP`. An unprivileged process may do this
   (it is how Chrome sandboxes renderers). It blocks process-inspection
   syscalls, most importantly `ptrace`, `process_vm_readv` and
   `process_vm_writev`, so a sandboxed script cannot read the SERVER's memory —
   which is where `.env` values are decrypted and where the DB connection and
   any live token sit. It also blocks the namespace/mount syscalls by name, so
   the AppArmor wall is not the only thing holding them shut.
2. **Resource limits** — there were none beyond the wall-clock timeout, so a
   fork bomb, an unbounded allocation, or a multi-GB file write were all
   possible. RLIMIT_AS / CPU / NPROC / FSIZE / NOFILE / CORE are now set in the
   child.

Honest limit: this does NOT stop a sandboxed script reading `.env` off disk.
Only a namespace/UID boundary can, and both need root here. `isolation_report()`
is the truthful summary for an operator.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import errno
import os
import platform
import resource
from typing import Dict, List, Optional

# ── Resource limits ──────────────────────────────────────────────────────────
# Address space the child may map. Generous enough for numpy/sympy work (the
# documented use case is maths in a sandbox) and small enough that a runaway
# allocation fails with MemoryError instead of taking the box to swap death.
DEFAULT_ADDRESS_SPACE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GiB
# CPU seconds; the wall-clock timeout in sandbox.py still applies on top.
DEFAULT_CPU_SECONDS = 60
# Headroom (not a total) for the per-UID process count — see _nproc_limit().
DEFAULT_PROCESS_HEADROOM = 128
# Largest file the child may create (100 MiB) — bounds a disk-filling loop.
DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024
DEFAULT_MAX_OPEN_FILES = 256


def _count_uid_tasks() -> int:
    """How many TASKS (threads) this UID already has.

    Two measured gotchas, both of which cost a debug cycle:

    1. RLIMIT_NPROC is counted per REAL UID, not per process tree — it is a cap
       on the user's TOTAL, not on what the child spawns.
    2. The kernel's counter counts **tasks, i.e. threads**, not process group
       leaders. Measured on this box: 153 process leaders but **1187 tasks**
       (Chrome and the editor alone account for hundreds). Counting leaders and
       adding headroom produced a limit of ~280 — far BELOW the real count — so
       every `node` child died at startup with
       `uv_thread_create ... Assertion failed` (exit -6) while python and bash,
       which thread later or not at all, were fine.
    """
    uid = os.getuid()
    total = 0
    try:
        with os.scandir("/proc") as entries:
            for entry in entries:
                if not entry.name.isdigit():
                    continue
                try:
                    if entry.stat(follow_symlinks=False).st_uid != uid:
                        continue
                except OSError:
                    continue
                total += 1
                try:
                    with os.scandir(f"/proc/{entry.name}/task") as threads:
                        total += sum(1 for _ in threads) - 1
                except OSError:
                    continue
    except OSError:
        return 0
    return total


def _nproc_limit(headroom: int) -> int:
    """A task cap the child can actually live under.

    The cap must be the CURRENT task count plus headroom. That still stops a
    fork bomb (which tries for thousands) while leaving legitimate work
    untouched — a flat number, or a count of process leaders, does not.
    """
    return max(0, _count_uid_tasks()) + headroom


def _set_limit(kind: int, soft: int) -> None:
    """Raise no limit — only ever lower. Failures are non-fatal."""
    try:
        hard = resource.getrlimit(kind)[1]
        if hard != resource.RLIM_INFINITY and hard < soft:
            soft = hard
        resource.setrlimit(kind, (soft, hard))
    except (ValueError, OSError):
        # A limit we cannot set must not stop the child from running; the
        # seccomp filter and the wall-clock timeout still apply.
        pass


def apply_resource_limits(
    address_space: int = DEFAULT_ADDRESS_SPACE_BYTES,
    cpu_seconds: int = DEFAULT_CPU_SECONDS,
    process_headroom: int = DEFAULT_PROCESS_HEADROOM,
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
    max_open_files: int = DEFAULT_MAX_OPEN_FILES,
) -> None:
    """Apply rlimits. Intended to run in the child, between fork and exec."""
    _set_limit(resource.RLIMIT_AS, address_space)
    _set_limit(resource.RLIMIT_CPU, cpu_seconds)
    _set_limit(resource.RLIMIT_NPROC, _nproc_limit(process_headroom))
    _set_limit(resource.RLIMIT_FSIZE, max_file_bytes)
    _set_limit(resource.RLIMIT_NOFILE, max_open_files)
    _set_limit(resource.RLIMIT_CORE, 0)          # no core dumps (they leak memory)
    if hasattr(resource, "RLIMIT_MBUF"):
        _set_limit(resource.RLIMIT_MBUF, 0)


# ── seccomp ──────────────────────────────────────────────────────────────────
# BPF constants (linux/bpf_common.h, linux/seccomp.h).
BPF_LD = 0x00
BPF_W = 0x00
BPF_ABS = 0x20
BPF_JMP = 0x05
BPF_JEQ = 0x10
BPF_K = 0x00
BPF_RET = 0x06

SECCOMP_RET_KILL_PROCESS = 0x80000000
SECCOMP_RET_ALLOW = 0x7FFF0000
SECCOMP_RET_ERRNO = 0x00050000

PR_SET_NO_NEW_PRIVS = 38
PR_SET_SECCOMP = 22
SECCOMP_MODE_FILTER = 2

# offsetof(struct seccomp_data, nr) == 0
SECCOMP_NR_OFFSET = 0

# Syscall numbers, per arch. Only the arch this runs on matters; an unknown arch
# means the filter is skipped rather than guessed (a wrong number would block an
# unrelated syscall).
_SYSCALLS_X86_64 = {
    "ptrace": 101,
    "process_vm_readv": 310,
    "process_vm_writev": 311,
    "kexec_load": 246,
    "kexec_file_load": 320,
    "init_module": 175,
    "finit_module": 313,
    "delete_module": 176,
    "mount": 165,
    "umount2": 166,
    "pivot_root": 155,
    "setns": 308,
    "unshare": 272,
    "reboot": 169,
    "swapon": 167,
    "swapoff": 168,
    "bpf": 321,
    "userfaultfd": 323,
    "keyctl": 250,
    "add_key": 248,
    "request_key": 249,
}
_SYSCALLS_AARCH64 = {
    "ptrace": 117,
    "process_vm_readv": 270,
    "process_vm_writev": 271,
    "kexec_load": 104,
    "init_module": 105,
    "finit_module": 273,
    "delete_module": 106,
    "mount": 40,
    "umount2": 39,
    "pivot_root": 41,
    "setns": 268,
    "unshare": 97,
    "reboot": 142,
    "swapon": 224,
    "swapoff": 225,
    "bpf": 280,
    "userfaultfd": 282,
    "keyctl": 219,
    "add_key": 217,
    "request_key": 218,
}


class _SockFilter(ctypes.Structure):
    _fields_ = [
        ("code", ctypes.c_ushort),
        ("jt", ctypes.c_ubyte),
        ("jf", ctypes.c_ubyte),
        ("k", ctypes.c_uint),
    ]


class _SockFprog(ctypes.Structure):
    _fields_ = [
        ("len", ctypes.c_ushort),
        ("filter", ctypes.POINTER(_SockFilter)),
    ]


def syscall_table() -> Optional[Dict[str, int]]:
    """The blocked-syscall table for this machine, or None if unknown."""
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        return _SYSCALLS_X86_64
    if machine in ("aarch64", "arm64"):
        return _SYSCALLS_AARCH64
    return None


def _build_filter(table: Dict[str, int]) -> ctypes.Array:
    """BPF program: one JEQ+ERRNO pair per blocked syscall, then ALLOW."""
    program: List[_SockFilter] = [
        _SockFilter(BPF_LD | BPF_W | BPF_ABS, 0, 0, SECCOMP_NR_OFFSET)
    ]
    for number in sorted(set(table.values())):
        # if nr == number: fall through to the RET; else skip it
        program.append(_SockFilter(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, number))
        program.append(_SockFilter(BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ERRNO | errno.EPERM))
    program.append(_SockFilter(BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ALLOW))
    return (_SockFilter * len(program))(*program)


def apply_seccomp_filter() -> bool:
    """Install the seccomp filter on the CURRENT process. Returns True if applied.

    Must run in the child after fork and before exec. Returns False (never
    raises) when the kernel or arch will not support it, so a failure degrades
    to the resource limits rather than breaking the sandbox.
    """
    table = syscall_table()
    if not table:
        return False
    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6", use_errno=True)
    except OSError:
        return False

    # PR_SET_NO_NEW_PRIVS must be set first: it is what lets an unprivileged
    # process install a filter at all.
    if libc.prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        return False

    program = _build_filter(table)
    fprog = _SockFprog(len(program), program)
    if libc.prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ctypes.byref(fprog), 0, 0) != 0:
        return False
    return True


def harden_child_process() -> None:
    """Both layers, in the order the kernel requires. Safe to call in the child."""
    apply_resource_limits()
    # no_new_privs is also set by apply_seccomp_filter; setting it here too means
    # the flag holds even if the seccomp install is skipped or fails.
    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6", use_errno=True)
        libc.prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)
    except Exception:
        pass
    apply_seccomp_filter()


# ── Capability reporting ─────────────────────────────────────────────────────

def isolation_available() -> bool:
    """True when a real namespace boundary can be created on this machine.

    False here, and the reason is measured: Ubuntu sets
    `kernel.apparmor_restrict_unprivileged_userns = 1`, so bwrap/unshare/mount
    namespaces all fail. Callers get the truth instead of an assumption.
    """
    try:
        with open("/proc/sys/kernel/apparmor_restrict_unprivileged_userns") as handle:
            restricted = handle.read().strip() == "1"
    except OSError:
        restricted = False

    try:
        with open("/proc/sys/user/max_user_namespaces") as handle:
            if int(handle.read().strip()) <= 0:
                return False
    except (OSError, ValueError):
        pass

    if restricted:
        return False

    # Restricted flag absent/off — confirm by actually opening a namespace, the
    # same probe that produced "Operation not permitted" above.
    import subprocess

    try:
        proc = subprocess.run(
            ["unshare", "--user", "--map-root-user", "/bin/true"],
            capture_output=True, timeout=5,
        )
        return proc.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def isolation_report() -> Dict[str, object]:
    """Operator-facing truth about what is and is not protecting the sandbox."""
    table = syscall_table()
    available = isolation_available()
    report: Dict[str, object] = {
        "namespace_isolation": available,
        "seccomp": bool(table),
        "resource_limits": True,
        "arch": platform.machine(),
        "blocked_syscalls": sorted((table or {}).keys()),
    }
    if not available:
        report["namespace_blocked_by"] = (
            "kernel.apparmor_restrict_unprivileged_userns=1 — lifting it is a root "
            "action: sysctl -w kernel.apparmor_restrict_unprivileged_userns=0"
        )
        report["residual_risk"] = (
            "A sandboxed script still runs as the server UID and can read files the "
            "server can read (.env, the production database). seccomp stops it reading "
            "the server's MEMORY; only a UID/namespace boundary stops file reads, and "
            "that needs root on this box."
        )
    return report
