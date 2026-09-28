"""Virtual Sandbox for Sub-Agents in Helpotron.

Provides isolated, lightweight execution environments for sub-agents to run
Python, Node.js, or Bash scripts, process uploaded media/documents at system speed,
and perform automated analysis with strict resource limits and auto-cleanup.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .sandbox_isolation import harden_child_process, isolation_report

logger = logging.getLogger("helpotron.engine.sandbox")

BASE_SANDBOX_DIR = Path("./exports/sandboxes").resolve()
BASE_SANDBOX_DIR.mkdir(parents=True, exist_ok=True)

# One line at startup so the isolation posture is never assumed. On this box
# namespace isolation is False (AppArmor blocks unprivileged user namespaces —
# see sandbox_isolation.py), which means a sandboxed script runs as the server
# UID. Logging it means the operator learns that from the log, not from an
# incident.
_si_report = isolation_report()
logger.info(
    "sandbox isolation: namespace=%s seccomp=%s rlimits=%s arch=%s",
    _si_report["namespace_isolation"], _si_report["seccomp"],
    _si_report["resource_limits"], _si_report["arch"],
)
if not _si_report["namespace_isolation"]:
    logger.warning(
        "sandbox isolation: NO NAMESPACE BOUNDARY — sandboxed code runs as the "
        "server UID and can read files the server can read (.env, the production "
        "database). Blocked by %s. seccomp+rlimits are active.",
        _si_report.get("namespace_blocked_by", "unknown"),
    )


def validate_safe_path(base_dir: str | Path, rel_path: str | Path) -> Path:
    """Validate path is inside base_dir and block path traversal (BATCH-03)."""
    base = Path(base_dir).resolve()
    target = (base / rel_path).resolve()
    if not str(target).startswith(str(base)):
        raise PermissionError(f"Path traversal detected: {rel_path}")
    return target




class SandboxExecutionResult:
    """Encapsulates the output of a sandboxed script execution."""

    def __init__(
        self,
        sandbox_id: str,
        stdout: str,
        stderr: str,
        exit_code: int,
        execution_time_ms: float,
        artifacts_created: List[str],
    ) -> None:
        self.sandbox_id = sandbox_id
        self.stdout = stdout
        self.stderr = stderr
        self.exit_code = exit_code
        self.execution_time_ms = execution_time_ms
        self.artifacts_created = artifacts_created
        self.success = exit_code == 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sandbox_id": self.sandbox_id,
            "success": self.success,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "execution_time_ms": round(self.execution_time_ms, 2),
            "artifacts_created": self.artifacts_created,
        }


class VirtualSubagentSandbox:
    """An isolated virtual sandbox instance for a specific sub-agent task."""

    def __init__(
        self,
        sandbox_id: str,
        subagent_name: str,
        user_id: str,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.sandbox_id = sandbox_id
        self.subagent_name = subagent_name
        self.user_id = user_id
        self.timeout_seconds = timeout_seconds
        self.created_at = time.time()
        self.workspace_dir = (BASE_SANDBOX_DIR / sandbox_id).resolve()
        self.workspace_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.is_active = True

    def _resolve_safe_path(self, filename: str) -> Path:
        """Strict path traversal guard: ensures file stays strictly inside sandbox workspace."""
        if ".." in filename or filename.startswith("/") or "\\" in filename:
            raise ValueError(f"Path traversal blocked: '{filename}'")
        target = (self.workspace_dir / filename).resolve()
        if not str(target).startswith(str(self.workspace_dir)):
            raise ValueError(f"Path traversal blocked: '{filename}'")
        return target

    def write_file(self, filename: str, content: bytes | str) -> str:
        """Writes input file or source script into sandbox workspace."""
        if not self.is_active:
            raise RuntimeError("Sandbox is inactive.")
        target = self._resolve_safe_path(filename)
        if isinstance(content, str):
            target.write_text(content, encoding="utf-8")
        else:
            target.write_bytes(content)
        # Owner-only: the file can carry the assignment text or scraped page
        # content, and the default umask left it group/other-readable.
        try:
            os.chmod(target, 0o600)
        except OSError:  # pragma: no cover - non-POSIX filesystem
            pass
        return str(target)

    def read_file(self, filename: str) -> str:
        """Reads output artifact from sandbox workspace."""
        target = self._resolve_safe_path(filename)
        if not target.exists() or not target.is_file():
            raise FileNotFoundError(f"File not found in sandbox: '{filename}'")
        return target.read_text(encoding="utf-8", errors="replace")

    def list_files(self) -> List[Dict[str, Any]]:
        """Lists all files present in the sandbox workspace."""
        if not self.workspace_dir.exists():
            return []
        items = []
        for p in self.workspace_dir.iterdir():
            if p.is_file():
                items.append({
                    "name": p.name,
                    "size_bytes": p.stat().st_size,
                    "modified_at": p.stat().st_mtime,
                })
        return items

    async def execute_script(
        self,
        script_code: str,
        language: str = "python",
        args: Optional[List[str]] = None,
        timeout: Optional[float] = None,
    ) -> SandboxExecutionResult:
        """Executes a generated script in the isolated sandbox directory with timeout & limits."""
        if not self.is_active:
            raise RuntimeError("Sandbox is inactive or has been cleaned up.")

        effective_timeout = timeout or self.timeout_seconds
        start_time = time.time()
        before_files = set(p.name for p in self.workspace_dir.iterdir() if p.is_file())

        lang = language.lower().strip()
        script_name = f"subagent_task_{int(time.time()*1000)}"

        if lang in ("python", "py", "python3"):
            script_file = f"{script_name}.py"
            self.write_file(script_file, script_code)
            cmd = ["python3", script_file]
        elif lang in ("javascript", "js", "node"):
            script_file = f"{script_name}.js"
            self.write_file(script_file, script_code)
            cmd = ["node", script_file]
        elif lang in ("bash", "sh", "shell"):
            script_file = f"{script_name}.sh"
            self.write_file(script_file, script_code)
            cmd = ["bash", script_file]
        else:
            raise ValueError(f"Unsupported sandbox script language: '{language}'")

        if args:
            cmd.extend(args)

        stdout, stderr, exit_code = "", "", -1
        try:
            # Run sub-agent process with current working directory bound strictly to sandbox
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(self.workspace_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                # Sandbox environment: limit process environment
                env={
                    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                    "PYTHONPATH": str(self.workspace_dir),
                    "SANDBOX_ID": self.sandbox_id,
                    "USER_ID": self.user_id,
                    "TEMP": str(self.workspace_dir),
                    # Point HOME at the workspace so tools that read ~/.config,
                    # ~/.ssh or ~/.gitconfig find the sandbox, not the server
                    # user's real home. Without this they inherit nothing (HOME
                    # is absent from the allowlist) and may fall back to reading
                    # a real home directory anyway.
                    "HOME": str(self.workspace_dir),
                    "TMPDIR": str(self.workspace_dir),
                },
                # Hardening applied in the child between fork and exec: seccomp
                # (blocks ptrace/process_vm_readv, so the script cannot read the
                # SERVER's memory) plus rlimits (no fork bomb, no unbounded
                # allocation, no disk-filling writes). See sandbox_isolation.py
                # for why this is not a namespace sandbox — unprivileged user
                # namespaces are blocked by AppArmor on this box.
                preexec_fn=harden_child_process,
            )

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=effective_timeout,
                )
                stdout = stdout_bytes.decode("utf-8", errors="replace")
                stderr = stderr_bytes.decode("utf-8", errors="replace")
                exit_code = proc.returncode if proc.returncode is not None else 0
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                except Exception:
                    pass
                stdout = ""
                stderr = f"Execution timed out after {effective_timeout}s."
                exit_code = 124

        except Exception as e:
            stderr = f"Process launch failed: {str(e)}"
            exit_code = 1

        exec_time_ms = (time.time() - start_time) * 1000.0
        after_files = set(p.name for p in self.workspace_dir.iterdir() if p.is_file())
        new_artifacts = list(after_files - before_files - {script_file})

        logger.info(
            "Sandbox %s [%s] executed %s in %.2fms (exit=%d)",
            self.sandbox_id, self.subagent_name, language, exec_time_ms, exit_code
        )

        return SandboxExecutionResult(
            sandbox_id=self.sandbox_id,
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            execution_time_ms=exec_time_ms,
            artifacts_created=new_artifacts,
        )

    def cleanup(self) -> None:
        """Terminates sandbox and purges isolated directory."""
        self.is_active = False
        try:
            if self.workspace_dir.exists():
                shutil.rmtree(self.workspace_dir, ignore_errors=True)
                logger.info("Purged sandbox directory: %s", self.sandbox_id)
        except Exception as e:
            logger.warning("Error purging sandbox %s: %s", self.sandbox_id, e)


class SandboxManager:
    """Orchestrates sandbox lifecycles, sub-agent dispatch, and automatic resource reclamation."""

    def __init__(self) -> None:
        self._sandboxes: Dict[str, VirtualSubagentSandbox] = {}

    def create_sandbox(
        self,
        subagent_name: str,
        user_id: str,
        timeout_seconds: float = 30.0,
    ) -> VirtualSubagentSandbox:
        """Instantiates a new isolated sandbox environment."""
        sandbox_id = f"sbx_{uuid.uuid4().hex[:12]}"
        sbx = VirtualSubagentSandbox(
            sandbox_id=sandbox_id,
            subagent_name=subagent_name,
            user_id=user_id,
            timeout_seconds=timeout_seconds,
        )
        self._sandboxes[sandbox_id] = sbx
        return sbx

    def get_sandbox(self, sandbox_id: str) -> Optional[VirtualSubagentSandbox]:
        return self._sandboxes.get(sandbox_id)

    def cleanup_sandbox(self, sandbox_id: str) -> bool:
        """Destroys and purges a sandbox."""
        sbx = self._sandboxes.pop(sandbox_id, None)
        if sbx:
            sbx.cleanup()
            return True
        return False

    def list_active(self) -> List[Dict[str, Any]]:
        """Returns metadata for all running sandboxes."""
        now = time.time()
        return [
            {
                "sandbox_id": sbx.sandbox_id,
                "subagent_name": sbx.subagent_name,
                "user_id": sbx.user_id,
                "age_seconds": round(now - sbx.created_at, 1),
                "is_active": sbx.is_active,
                "files_count": len(sbx.list_files()),
            }
            for sbx in self._sandboxes.values()
        ]

    def prune_stale(self, max_age_seconds: float = 600.0) -> int:
        """Reclaims any sandboxes older than max_age_seconds."""
        now = time.time()
        stale_ids = [
            sid for sid, sbx in self._sandboxes.items()
            if now - sbx.created_at > max_age_seconds
        ]
        for sid in stale_ids:
            self.cleanup_sandbox(sid)
        return len(stale_ids)

    async def execute_subagent_task(
        self,
        subagent_name: str,
        user_id: str,
        script_code: str,
        language: str = "python",
        input_files: Optional[Dict[str, bytes | str]] = None,
        auto_cleanup: bool = True,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """Convenience one-shot execution: creates sandbox, injects files, runs script, returns output, cleans up."""
        sbx = self.create_sandbox(subagent_name, user_id, timeout_seconds=timeout)
        try:
            if input_files:
                for fname, content in input_files.items():
                    sbx.write_file(fname, content)

            result = await sbx.execute_script(script_code, language=language, timeout=timeout)

            output_data = result.to_dict()
            output_data["files"] = sbx.list_files()
            return output_data
        finally:
            if auto_cleanup:
                self.cleanup_sandbox(sbx.sandbox_id)


# Global Sandbox Manager Singleton
sandbox_manager = SandboxManager()


from pathlib import Path

SANDBOX_BASE_DIR = Path('./exports/sandboxes').resolve()

def get_sanitized_sandbox_path(sandbox_id: str, filename: str) -> Path:
    """Return a safe resolved path inside the sandbox boundary."""
    safe_sandbox_id = ''.join(c for c in sandbox_id if c.isalnum() or c in ('_', '-'))
    safe_filename = Path(filename).name

    target_dir = (SANDBOX_BASE_DIR / safe_sandbox_id).resolve()
    target_file = (target_dir / safe_filename).resolve()

    if not str(target_file).startswith(str(SANDBOX_BASE_DIR)):
        raise PermissionError('Sandbox path traversal violation detected')

    target_dir.mkdir(parents=True, exist_ok=True)
    return target_file


def write_sandbox_file(sandbox_id: str, filename: str, content: str) -> str:
    """Write a file to the sandbox, blocking path traversal and executable extensions."""
    path = get_sanitized_sandbox_path(sandbox_id, filename)
    if path.suffix.lower() in ('.sh', '.bash', '.exe', '.bat', '.py'):
        raise ValueError('Executable file extensions forbidden in standard sandbox export')
    # Sandbox output is the agent's working material, not public data. open()
    # honours the process umask (0664 under a default systemd user manager), so
    # set the mode explicitly rather than trusting it.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(content)
    return str(path)


def write_user_content_file(sandbox_id: str, filename: str, content: bytes | str) -> str:
    """Store user-supplied content into a non-executable isolated sandbox workspace.

    Guarantees:
    - Path traversal is strictly forbidden.
    - Executable extensions (.sh, .bash, .py, .exe, .bat, .cmd, .ps1, etc.) are rejected.
    - Permissions are set to 0o600 (owner read/write only, no execution bits).
    """
    path = get_sanitized_sandbox_path(sandbox_id, filename)
    forbidden_extensions = {
        '.sh', '.bash', '.exe', '.bat', '.py', '.cmd', '.ps1', '.vbs',
        '.bin', '.elf', '.so', '.dll', '.dylib', '.cgi', '.jar',
    }
    if path.suffix.lower() in forbidden_extensions:
        raise ValueError(f"Executable extension '{path.suffix}' forbidden for user content")
    content_bytes = content.encode('utf-8') if isinstance(content, str) else content
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(content_bytes)
    return str(path)


# ── Remediation BATCH-03 additions (2026-08-21) ───────────────────────────
# Path-traversal-safe sandbox path resolution + shell-free command runner,
# per the plan spec. The existing SandboxManager / VirtualSubagentSandbox
# API is unchanged; these are additive.

ALLOWED_SANDBOX_DIR = Path('/tmp/helpotron_sandboxes').resolve()
ALLOWED_SANDBOX_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_sandbox_path(sandbox_id: str, relative_file: str) -> Path:
    """Prevent path traversal by verifying destination is strictly inside sandbox root."""
    target_root = (ALLOWED_SANDBOX_DIR / sandbox_id).resolve()
    target_root.mkdir(parents=True, exist_ok=True)

    # Resolve target file path
    target_file = (target_root / relative_file).resolve()
    if not str(target_file).startswith(str(target_root)):
        raise PermissionError(f'Path traversal attempt detected: {relative_file}')
    return target_file


def run_isolated_command(sandbox_id: str, command_args: list[str], timeout: int = 15) -> tuple[int, str, str]:
    """Execute command in isolated subprocess with the shell disabled."""
    sandbox_dir = (ALLOWED_SANDBOX_DIR / sandbox_id).resolve()
    sandbox_dir.mkdir(parents=True, exist_ok=True)

    safe_env = {
        "PATH": os.environ.get("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"),
        "HOME": str(sandbox_dir),
        "TMPDIR": str(sandbox_dir),
        "SANDBOX_ID": sandbox_id,
    }
    res = subprocess.run(
        command_args,
        cwd=str(sandbox_dir),
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
        env=safe_env,
        preexec_fn=harden_child_process,
    )
    return res.returncode, res.stdout, res.stderr


# ── WHEN IS A SANDBOX NEEDED AT ALL? (owner 2026-09-28) ──────────────────────────
#
# Owner: *"not everything 100% needs a sandbox — a simple my agent chat that doesn't deal
# with any files doesn't need one, but the seccond files are in the mix, it gets opened in a
# sandbox where agents can edit and do stuff with it"*.
#
# Before this, whether a sandbox opened was decided by SUBSTRING-MATCHING the user's message
# ("sandbox" in text, "script" in text) — so asking "can I run a script for this?" opened one
# while attaching three files did not. That is backwards: the sandbox exists to give file work
# and code execution an isolated, disposable workspace, and its cost (a directory, a process,
# a slot in the machine's budget) should be paid only when that is what the task is.
#
# ★ THE RULE IS IN ONE PLACE. Two call sites deciding this separately is how one of them ends
# up disagreeing with the other — the same shape as the duplicated auth logic and the two
# error normalisers already recorded on this codebase.

# Actions that EXECUTE code. Code that runs must run somewhere disposable, so these always get
# a sandbox even with no files attached.
SANDBOX_ACTIONS = frozenset({
    "run_sandbox_script",
    "run_shell",
    "execute_code",
})


def sandbox_required(
    *,
    files: Optional[List[Dict[str, Any]]] = None,
    agent_files: Optional[List[Dict[str, Any]]] = None,
    action_type: str = "",
    input_files: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Whether this task needs an isolated workspace, and why.

    Returns `{"required": bool, "reason": str, "triggers": [...]}`. The reason is returned
    rather than a bare boolean because "why did a sandbox open" is the question that gets
    asked when the machine is under load and they are consuming slots.

    A plain chat — no attachments, no agent files, no code — returns `required: False`. That
    is the case the owner called out, and it is the common one: most chat turns must not pay
    for a workspace they will never touch.
    """
    triggers: List[str] = []

    n_files = len(files or [])
    if n_files:
        triggers.append(f"{n_files} file(s) attached to this request")

    n_agent_files = len(agent_files or [])
    if n_agent_files:
        # The agent's own loaded files count: they are "in the mix" for exactly the same
        # reason an attachment is — the task may open, edit and rewrite them.
        triggers.append(f"{n_agent_files} loaded agent file(s)")

    if input_files:
        triggers.append(f"{len(input_files)} input file(s) supplied for execution")

    if action_type in SANDBOX_ACTIONS:
        triggers.append(f"action '{action_type}' executes code")

    if triggers:
        return {"required": True, "reason": "; ".join(triggers), "triggers": triggers}
    return {
        "required": False,
        "reason": "plain chat — no files and no code execution",
        "triggers": [],
    }
