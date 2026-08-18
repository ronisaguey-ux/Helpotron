"""Deterministic Python Math Execution Engine.

Ensures that AI never hallucinates or guesses mathematical calculations, calculus,
algebraic simplifications, or statistics. All equations and numerical expressions
are executed via deterministic Python bash subcommands using math, sympy, decimal,
fractions, and statistics.
"""
from __future__ import annotations

import asyncio
import logging
import math
import os
import re
import subprocess
import sys
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("helpotron.math_executor")

VENV_PYTHON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".venv", "bin", "python")
PYTHON_BIN = VENV_PYTHON if os.path.exists(VENV_PYTHON) else sys.executable


def run_python_math_bash(code: str, timeout: float = 5.0) -> Tuple[bool, str]:
    """Executes Python math code via bash subprocess with safety constraints and timeout."""
    # Prepend standard safe mathematical imports
    preamble = (
        "import math\n"
        "import statistics\n"
        "import decimal\n"
        "from fractions import Fraction\n"
        "try:\n"
        "    import sympy\n"
        "    from sympy import symbols, solve, simplify, diff, integrate, Matrix, limit, oo, Eq, latex\n"
        "except Exception:\n"
        "    pass\n"
    )
    full_script = f"{preamble}\n{code}"

    try:
        res = subprocess.run(
            [PYTHON_BIN, "-c", full_script],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if res.returncode == 0:
            return True, res.stdout.strip()
        else:
            return False, res.stderr.strip()
    except subprocess.TimeoutExpired:
        return False, "Error: Execution timed out (max 5.0s exceeded)"
    except Exception as e:
        return False, f"Execution error: {str(e)}"


def solve_deterministic_math(expression: str) -> Dict[str, Any]:
    """Solves mathematical expressions, equations, or calculus symbolically and numerically."""
    clean_expr = expression.strip()

    # Build evaluation script
    script = f"""
expr_str = {repr(clean_expr)}
try:
    # 1. Try symbolic sympy evaluation
    x, y, z, t, n, k = symbols('x y z t n k')
    # Check if equation with '='
    if '=' in expr_str and not '==' in expr_str and not '<=' in expr_str and not '>=' in expr_str:
        left, right = expr_str.split('=', 1)
        sym_eq = Eq(sympy.sympify(left), sympy.sympify(right))
        solutions = solve(sym_eq)
        print(f"SOLUTION: {{solutions}}")
        print(f"LATEX: {{latex(sym_eq)}}")
    else:
        parsed = sympy.sympify(expr_str)
        simplified = simplify(parsed)
        eval_val = None
        try:
            eval_val = float(simplified.evalf())
        except Exception:
            pass
        print(f"SIMPLIFIED: {{simplified}}")
        if eval_val is not None:
            print(f"NUMERICAL: {{eval_val}}")
        print(f"LATEX: {{latex(simplified)}}")
except Exception as e1:
    # 2. Fallback to standard Python math evaluation
    try:
        safe_dict = {{
            'math': math,
            'statistics': statistics,
            'sqrt': math.sqrt,
            'sin': math.sin,
            'cos': math.cos,
            'tan': math.tan,
            'pi': math.pi,
            'e': math.e,
            'log': math.log,
            'log10': math.log10,
            'exp': math.exp,
            'pow': math.pow,
            'factorial': math.factorial,
            'Fraction': Fraction,
            'comb': math.comb,
            'perm': math.perm,
        }}
        val = eval(expr_str, {{"__builtins__": {{}}}}, safe_dict)
        print(f"NUMERICAL: {{val}}")
    except Exception as e2:
        print(f"ERROR: Sympy: {{e1}} | Eval: {{e2}}")
"""
    success, output = run_python_math_bash(script)
    if not success or "ERROR:" in output:
        return {
            "success": False,
            "expression": expression,
            "error": output,
            "result": None,
        }

    results = {}
    for line in output.splitlines():
        if line.startswith("SOLUTION:"):
            results["solution"] = line.replace("SOLUTION:", "").strip()
        elif line.startswith("SIMPLIFIED:"):
            results["simplified"] = line.replace("SIMPLIFIED:", "").strip()
        elif line.startswith("NUMERICAL:"):
            results["numerical"] = line.replace("NUMERICAL:", "").strip()
        elif line.startswith("LATEX:"):
            results["latex"] = line.replace("LATEX:", "").strip()

    primary_res = results.get("numerical") or results.get("solution") or results.get("simplified")
    return {
        "success": True,
        "expression": expression,
        "primary_result": primary_res,
        "details": results,
    }


def sanitize_math_hallucinations_in_text(text: str) -> str:
    """Finds arithmetic patterns in text and verifies/replaces them using exact Python computation."""
    # Find simple equations like 25 * 14 = 350, 15% of 800, sqrt(144) = 12
    def replace_simple_arithmetic(match):
        left_expr = match.group(1).strip()
        op = match.group(2).strip()
        right_expr = match.group(3).strip()
        claimed_res = match.group(4).strip() if len(match.groups()) >= 4 else None

        try:
            # Map operator
            py_op = op.replace("×", "*").replace("÷", "/")
            py_code = f"print({left_expr} {py_op} {right_expr})"
            ok, out = run_python_math_bash(py_code)
            if ok and out:
                computed = out.strip()
                if claimed_res:
                    return f"{left_expr} {op} {right_expr} = {computed}"
        except Exception:
            pass
        return match.group(0)

    # Replace basic binary operations with '=' (e.g. 14 * 25 = 350)
    cleaned = re.sub(
        r"(\b\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)",
        replace_simple_arithmetic,
        text,
    )
    return cleaned
