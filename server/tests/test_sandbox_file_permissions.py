"""09-11 audit fix: sandbox output is not public data.

Every run the agent makes stamps a state.json and a run.log, and any file it
produces lands beside them. Under the default umask those came out 0664/0775 —
readable and traversable by every local account on the box, which is the wrong
trust level for material that can quote an assignment prompt verbatim.

These tests pin the owner-only modes both writers are supposed to set.
"""
import json
import os
import stat
import subprocess
from pathlib import Path

import pytest

from server.engine import sandbox


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def test_write_sandbox_file_is_owner_only(tmp_path, monkeypatch):
    monkeypatch.setattr(sandbox, "BASE_SANDBOX_DIR", tmp_path)
    path = Path(sandbox.write_sandbox_file("sbx_permtest", "notes.txt", "hello"))
    assert _mode(path) == 0o600


def test_write_sandbox_file_still_refuses_executables(tmp_path, monkeypatch):
    """The permission change must not have loosened the extension guard."""
    monkeypatch.setattr(sandbox, "BASE_SANDBOX_DIR", tmp_path)
    for name in ("evil.sh", "evil.bash", "evil.py", "evil.exe", "evil.bat"):
        with pytest.raises(ValueError):
            sandbox.write_sandbox_file("sbx_permtest", name, "x")


def test_virtual_sandbox_workspace_and_files_are_owner_only(tmp_path, monkeypatch):
    monkeypatch.setattr(sandbox, "BASE_SANDBOX_DIR", tmp_path)
    sbx = sandbox.VirtualSubagentSandbox("sbx_vs", "subagent", "user-1")
    assert _mode(sbx.workspace_dir) == 0o700
    written = Path(sbx.write_file("draft.txt", "text"))
    assert _mode(written) == 0o600
    binary = Path(sbx.write_file("blob.bin", b"\x00\x01"))
    assert _mode(binary) == 0o600


def test_run_script_keeps_metadata_and_logs_owner_only(tmp_path):
    """The shell runner is the other writer. Run the real script with a DATA_DIR
    pointed at a temp dir and assert the modes it actually produced — a
    chmod-on-a-fixture would prove nothing about the shipped path."""
    repo = Path(__file__).resolve().parents[2]
    script = repo / "deploy" / "sandboxes" / "sandbox_run.sh"
    if not script.exists():
        pytest.skip("sandbox_run.sh not present")

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    env = {**os.environ, "DATA_DIR": str(data_dir)}
    proc = subprocess.run(
        ["bash", str(script), "--kind", "permtest", "--timeout", "15", "--",
         "bash", "-c", "echo ran"],
        capture_output=True, text=True, env=env, timeout=60,
    )
    assert proc.returncode == 0, proc.stderr

    runs = list((data_dir / "sandboxes").iterdir())
    assert len(runs) == 1, runs
    run_dir = runs[0]
    assert _mode(run_dir) == 0o700
    assert _mode(run_dir / "state.json") == 0o600
    assert _mode(run_dir / "logs" / "run.log") == 0o600
    assert _mode(run_dir / "logs") == 0o700

    # and the metadata is still valid JSON with the fields the runner promises
    state = json.loads((run_dir / "state.json").read_text())
    assert state["kind"] == "permtest"
    assert state["rc"] == 0
