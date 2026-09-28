"""A plain chat must not open a sandbox; files must.

Owner: *"not everything 100% needs a sandbox — a simple my agent chat that doesn't deal with
any files doesn't need one, but the seccond files are in the mix, it gets opened in a sandbox
where agents can edit and do stuff with it"*.

★ BOTH DIRECTIONS. A rule that only says yes opens a workspace for every greeting; one that
only says no never opens one for files. Both are failures, so each case is paired.
"""

import sys

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server.engine.sandbox import sandbox_required  # noqa: E402


def main() -> int:
    ok = True

    print("\n  --- NO sandbox: the cases that must stay cheap ---")
    cheap = [
        ("a plain chat message", {"action_type": "chat"}),
        ("a greeting", {"action_type": "plain_answer"}),
        ("a text rewrite", {"action_type": "humanize_text"}),
        ("a rubric analysis", {"action_type": "analyze_rubric"}),
        ("a question with no files", {"action_type": "get_progress"}),
        ("empty everything", {}),
    ]
    for name, kwargs in cheap:
        r = sandbox_required(**kwargs)
        print(f"    {'PASS' if not r['required'] else 'FAIL'} — {name}: required={r['required']}")
        if r["required"]:
            ok = False

    print("\n  --- SANDBOX: files or code means an isolated workspace ---")
    needs = [
        ("files attached", {"files": [{"name": "essay.docx"}]}),
        ("several files", {"files": [{}, {}, {}]}),
        ("loaded agent files", {"agent_files": [{"name": "notes.md"}]}),
        ("input files for a run", {"input_files": {"a.py": b"x"}}),
        ("a code action", {"action_type": "run_sandbox_script"}),
        ("a shell action", {"action_type": "run_shell"}),
        ("files AND code", {"files": [{}], "action_type": "run_shell"}),
    ]
    for name, kwargs in needs:
        r = sandbox_required(**kwargs)
        print(f"    {'PASS' if r['required'] else 'FAIL'} — {name}: required={r['required']}")
        if r["required"]:
            print(f"          reason: {r['reason']}")
        else:
            ok = False

    print("\n  " + ("ALL CLAIMS HOLD" if ok else "SOMETHING FAILED"))
    return 0 if ok else 1


def test_sandbox_rule():
    """Only file/code work gets a sandbox."""
    assert main() == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
