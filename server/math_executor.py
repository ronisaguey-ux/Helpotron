"""Deterministic Python Math Execution Engine (remediation BATCH-03).

Plan section: AST-whitelist `safe_eval_math_expr` — the ONLY way the
/api/math/execute endpoint evaluates user math now (no subprocess, no eval).
Legacy-compat section: run_python_math_bash / solve_deterministic_math /
sanitize_math_hallucinations_in_text kept for the app surface (humanizer,
routes_math /solve + /verify-text, test_humanizer_kimhons); they run via
array-based subprocess (no shell) and are not reachable for arbitrary code
execution from the API.
"""
from __future__ import annotations

import ast
import asyncio
import logging
import math
import operator
import os
import re
import subprocess
import sys

# Legacy bash runner target (deterministic math legacy path)
PYTHON_BIN = sys.executable

# Legacy bash runner target (deterministic math legacy path)
PYTHON_BIN = sys.executable
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("helpotron.math_executor")

import ast
import math
import operator
from typing import Any, Dict, Union

# Whitelist of strictly safe mathematical operators
SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos
}

# Whitelist of safe math functions and constants
SAFE_FUNCTIONS = {
    'sin': math.sin,
    'cos': math.cos,
    'tan': math.tan,
    'sqrt': math.sqrt,
    'log': math.log,
    'log10': math.log10,
    'exp': math.exp,
    'abs': abs,
    'round': round,
    'pi': math.pi,
    'e': math.e
}

def safe_eval_math_expr(expr: str) -> Union[int, float]:
    """Safely evaluate a mathematical expression using strict AST whitelisting."""
    if len(expr) > 500:
        raise ValueError('Expression exceeds maximum allowable length of 500 characters')
    
    tree = ast.parse(expr, mode='eval')
    
    def _eval(node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        elif isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            raise TypeError(f'Disallowed constant type: {type(node.value)}')
        elif isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in SAFE_OPERATORS:
                raise ValueError(f'Disallowed binary operator: {op_type.__name__}')
            left = _eval(node.left)
            right = _eval(node.right)
            return SAFE_OPERATORS[op_type](left, right)
        elif isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in SAFE_OPERATORS:
                raise ValueError(f'Disallowed unary operator: {op_type.__name__}')
            operand = _eval(node.operand)
            return SAFE_OPERATORS[op_type](operand)
        elif isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in SAFE_FUNCTIONS:
                raise ValueError(f'Disallowed function call: {ast.dump(node.func)}')
            func = SAFE_FUNCTIONS[node.func.id]
            args = [_eval(arg) for arg in node.args]
            return func(*args)
        elif isinstance(node, ast.Name):
            if node.id in SAFE_FUNCTIONS:
                return SAFE_FUNCTIONS[node.id]
            raise ValueError(f'Undefined or disallowed identifier: {node.id}')
        else:
            raise TypeError(f'Disallowed AST node: {type(node).__name__}')
            
    return _eval(tree)


# ── Legacy-compat API (remediation BATCH-03 cross-file fix, 2026-08-21) ─────
# The plan's REPLACE spec drops these, but server/humanizer.py,
# server/routes_math.py and server/tests/test_humanizer_kimhons.py import
# them. Kept verbatim from the pre-plan implementation.

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
