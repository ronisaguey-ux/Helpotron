"""Regression tests: My Agent math via sandboxed python (08-31, operator).

Owner report: "my agent couldnt do math … make sure it can actually solve it
via bash/py inside a sandbox." Production sandbox run showed
`ModuleNotFoundError: No module named 'sympy'` — compute commands ran under
bare `python3` (system python) instead of the server's venv interpreter.
These tests pin the deterministic math quick-path AND the real sandbox
execution (including a sympy-using command) so the "nothing executed" class
of failure stays dead.
"""
import asyncio
import sys

import pytest

from server.overlord_agent import _compute_shell_command, _validated_argv
from server.routes_overlord import _extract_shell_query

# Verbatim from the owner's failing screenshot: 200-(1+5×0+50+5×2+1+5×2+3)
BOB_EXPR = "200-(1+5×0+50+5×2+1+5×2+3)"
BOB_ANSWER = "125"  # 200 - (1+0+50+10+1+10+3)


def test_math_quickpath_builds_expected_command():
    cmd = _extract_shell_query(BOB_EXPR)
    assert cmd == 'python3 -c "import math;print(200-(1+5*0+50+5*2+1+5*2+3))"'
    argv = _validated_argv(cmd)
    assert argv is not None
    # 08-31 regression: the interpreter is the server's own venv python, so
    # venv-only packages (sympy, …) are available — never bare `python3`.
    assert argv[0] == sys.executable
    assert argv[-1] == "import math;print(200-(1+5*0+50+5*2+1+5*2+3))"


def test_sandbox_computes_owner_expression():
    cmd = _extract_shell_query(BOB_EXPR)
    out = asyncio.run(_compute_shell_command(cmd))
    assert out == BOB_ANSWER


def test_sandbox_runs_sympy_command():
    """The exact failure from production: ModuleNotFoundError: sympy under
    system python. With sys.executable the command must actually compute."""
    cmd = 'python3 -c "import sympy;print(sympy.simplify(\'1/2+1/3\'))"'
    argv = _validated_argv(cmd)
    assert argv is not None
    out = asyncio.run(_compute_shell_command(cmd))
    assert out == "5/6"


def test_single_quotaed_command_accepted():
    """LLM-authored commands sometimes use single-quote delimiters — those
    used to die in validation with the same 'nothing executed' fallback."""
    argv = _validated_argv("python3 -c 'import math;print(2+2*3)'")
    assert argv is not None
    assert argv[0] == sys.executable
    assert argv[-1] == "import math;print(2+2*3)"
    out = asyncio.run(_compute_shell_command("python3 -c 'import math;print(2+2*3)'"))
    assert out == "8"


def test_validation_rejects_shell_metas():
    # $HOME would be shell-interpolated — must never validate.
    assert _validated_argv('python3 -c "print(\'$HOME\')"') is None
    assert _validated_argv("echo hi | rm -rf") is None
    assert _validated_argv("rm -rf /tmp/x; ls") is None
    assert _validated_argv("") is None


def test_math_variants_reach_quickpath():
    # word-operator and ÷ forms must land on run_shell too (not a follow-up).
    assert _extract_shell_query("what is 5 × 6?").startswith("python3 -c")
    assert _extract_shell_query("compute 100 ÷ 4").startswith("python3 -c")
    assert _extract_shell_query("3 + 4 * 2 + 1").startswith("python3 -c")
    # phone numbers are not math
    assert _extract_shell_query("call me at 555-123-4567") == ""
