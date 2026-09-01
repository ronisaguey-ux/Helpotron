"""Deterministic Python Math Execution Engine (remediation BATCH-03).

Plan section: AST-whitelist `safe_eval_math_expr` — the ONLY way the
/api/math/execute endpoint evaluates user math now (no subprocess, no eval).
Legacy-compat section: run_python_math_bash / solve_deterministic_math /
sanitize_math_hallucinations_in_text kept for the app surface (humanizer,
routes_math /solve + /verify-text, test_humanizer_kimhons); they run via
array-based subprocess (no shell).

SECURITY (08-29) — this docstring previously asserted the legacy path was
"not reachable for arbitrary code execution from the API". That was false.
`solve_deterministic_math` embeds the caller's expression with repr(), which
stops script injection, but then hands it to `sympy.sympify()`, and sympify
EVALUATES its argument. `sympify("__import__('os').system('…')")` runs the
command; `sympify("().__class__.__bases__[0].__subclasses__()")` reaches the
full gadget chain. `POST /api/math/solve` exposed that to any logged-in user,
and signup is open. `assert_math_expression_safe()` below is now the gate in
front of every sympify call: a strict AST whitelist that keeps symbolic
algebra working (solve/diff/integrate need real sympy) while rejecting
attribute access, subscripts, dunders, lambdas, comprehensions and calls to
anything outside the math function whitelist.
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

def _safe_pow(a: Any, b: Any) -> Any:
    if isinstance(b, (int, float)) and (b > 4096 or b < -4096):
        raise ValueError("Exponent exceeds safe limit (max 4096)")
    if isinstance(a, (int, float)) and abs(a) > 100000 and isinstance(b, (int, float)) and b > 50:
        raise ValueError("Power computation exceeds safe threshold")
    res = operator.pow(a, b)
    if isinstance(res, int) and res.bit_length() > 65536:
        raise ValueError("Computed integer exceeds memory bounds")
    return res

# Whitelist of strictly safe mathematical operators
SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: _safe_pow,
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
                raise TypeError(f'Disallowed function call: {ast.dump(node.func)}')
            func = SAFE_FUNCTIONS[node.func.id]
            args = [_eval(arg) for arg in node.args]
            return func(*args)
        elif isinstance(node, ast.Name):
            if node.id in SAFE_FUNCTIONS:
                return SAFE_FUNCTIONS[node.id]
            raise TypeError(f'Undefined or disallowed identifier: {node.id}')
        else:
            raise TypeError(f'Disallowed AST node: {type(node).__name__}')
            
    return _eval(tree)


# ── Legacy-compat API (remediation BATCH-03 cross-file fix, 2026-08-21) ─────
# The plan's REPLACE spec drops these, but server/humanizer.py,
# server/routes_math.py and server/tests/test_humanizer_kimhons.py import
# them. Kept verbatim from the pre-plan implementation.

class UnsafeMathExpression(ValueError):
    """Raised when an expression is not provably safe to hand to sympify."""


# Names sympify/solve legitimately need. Symbolic math uses arbitrary variable
# names, so bare identifiers are allowed — but only as symbols, never as call
# targets outside this set.
_SYMPY_CALL_WHITELIST = frozenset({
    'sqrt', 'exp', 'log', 'ln', 'log10', 'sin', 'cos', 'tan', 'asin', 'acos',
    'atan', 'sinh', 'cosh', 'tanh', 'abs', 'Abs', 'floor', 'ceiling', 'round',
    'factorial', 'gcd', 'lcm', 'binomial', 'simplify', 'expand', 'factor',
    'diff', 'integrate', 'limit', 'solve', 'Eq', 'Matrix', 'Sum', 'Product',
    'Rational', 'Integer', 'Float', 'Symbol', 'symbols', 'pi', 'E', 'oo',
    'sec', 'csc', 'cot', 'root', 'sign', 'Max', 'Min', 'deg', 'rad',
})

_MAX_MATH_EXPR_LEN = 500

# Node types that can never appear in a mathematical expression but are the
# building blocks of every sympify escape (attribute walks, subscript into
# __subclasses__, lambdas, comprehensions, f-strings, walrus, ...).
_FORBIDDEN_NODES = (
    ast.Attribute, ast.Subscript, ast.Lambda, ast.ListComp, ast.SetComp,
    ast.DictComp, ast.GeneratorExp, ast.JoinedStr, ast.FormattedValue,
    ast.Starred, ast.Await, ast.Yield, ast.YieldFrom, ast.NamedExpr,
    ast.Import, ast.ImportFrom, ast.Dict, ast.Set,
)


def assert_math_expression_safe(expression: str) -> str:
    """Validate an expression before it reaches ``sympy.sympify``.

    sympify evaluates its argument, so anything reaching it must first be
    proven to contain only arithmetic. Raises UnsafeMathExpression otherwise.
    Returns the stripped expression on success.
    """
    if not isinstance(expression, str):
        raise UnsafeMathExpression('Expression must be a string')

    expr = expression.strip()
    if not expr:
        raise UnsafeMathExpression('Empty expression')
    if len(expr) > _MAX_MATH_EXPR_LEN:
        raise UnsafeMathExpression(
            f'Expression exceeds {_MAX_MATH_EXPR_LEN} characters'
        )
    # Belt-and-braces: no dunder can survive the AST walk below either, but a
    # raw-substring check also covers anything sympify's own tokenizer might
    # accept that Python's parser normalises away.
    if '__' in expr:
        raise UnsafeMathExpression('Double-underscore names are not permitted')

    # An equation "lhs = rhs" is not valid Python expression syntax; validate
    # each side independently, mirroring how solve_deterministic_math splits.
    if '=' in expr and '==' not in expr and '<=' not in expr and '>=' not in expr:
        left, right = expr.split('=', 1)
        parts = [left, right]
    else:
        parts = [expr]

    for part in parts:
        part = part.strip()
        if not part:
            raise UnsafeMathExpression('Equation side is empty')
        try:
            tree = ast.parse(part, mode='eval')
        except SyntaxError:
            raise UnsafeMathExpression('Not a valid mathematical expression') from None

        for node in ast.walk(tree):
            if isinstance(node, _FORBIDDEN_NODES):
                raise UnsafeMathExpression(
                    f'Disallowed construct: {type(node).__name__}'
                )
            if isinstance(node, ast.Call):
                if not isinstance(node.func, ast.Name):
                    raise UnsafeMathExpression('Only direct function calls are allowed')
                if node.func.id not in _SYMPY_CALL_WHITELIST:
                    raise UnsafeMathExpression(
                        f'Disallowed function: {node.func.id}'
                    )
            if isinstance(node, ast.Constant) and not isinstance(
                node.value, (int, float, complex)
            ):
                raise UnsafeMathExpression('Only numeric literals are allowed')
            if isinstance(node, ast.Name) and node.id.startswith('_'):
                raise UnsafeMathExpression('Underscore-prefixed names are not permitted')

    return expr


def _is_safe_math_code(code: str) -> bool:
    import ast
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return False

    SAFE_MODULES = {"math", "datetime", "decimal", "fractions", "statistics", "sympy", "numpy", "ast", "operator"}
    DISALLOWED_NAMES = {
        "open", "eval", "exec", "__import__", "globals", "locals", "getattr",
        "setattr", "delattr", "compile", "breakpoint", "input", "memoryview",
        "sys", "os", "subprocess", "shutil", "socket", "urllib", "requests",
        "pathlib", "io", "builtins", "posix", "ctypes", "importlib", "exit", "quit"
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            if node.id.startswith("__") or node.id in DISALLOWED_NAMES:
                return False
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") or node.attr in DISALLOWED_NAMES:
                return False
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] not in SAFE_MODULES:
                    return False
        elif isinstance(node, ast.ImportFrom):
            if not node.module or node.module.split(".")[0] not in SAFE_MODULES:
                return False
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in DISALLOWED_NAMES:
                return False
            if isinstance(node.func, ast.Attribute) and node.func.attr in DISALLOWED_NAMES:
                return False

    return True


def run_python_math_bash(code: str, timeout: float = 5.0) -> Tuple[bool, str]:
    """Executes Python math code via bash subprocess with safety constraints and timeout."""
    if not _is_safe_math_code(code):
        return False, "Error: Disallowed operation detected in code"
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
    """Solves mathematical expressions, equations, or calculus symbolically and numerically.

    The expression is validated by assert_math_expression_safe() before it is
    embedded in the sympify script — sympify evaluates its argument, so an
    unvalidated expression here is remote code execution (see module docstring).
    """
    try:
        clean_expr = assert_math_expression_safe(expression)
    except UnsafeMathExpression as exc:
        logger.warning("rejected unsafe math expression: %s", exc)
        return {
            "success": False,
            "error": f"Rejected: {exc}",
            "expression": str(expression)[:200],
        }

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
    # 2. Fallback to standard Python math evaluation via strict AST safe evaluation
    try:
        import ast
        import operator
        _SAFE_OPS = {{
            ast.Add: operator.add, ast.Sub: operator.sub,
            ast.Mult: operator.mul, ast.Div: operator.truediv,
            ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
            ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos
        }}
        _SAFE_FUNCS = {{
            'sin': math.sin, 'cos': math.cos, 'tan': math.tan,
            'sqrt': math.sqrt, 'log': math.log, 'log10': math.log10,
            'exp': math.exp, 'abs': abs, 'round': round,
            'pi': math.pi, 'e': math.e
        }}
        def _ast_eval(node):
            if isinstance(node, ast.Expression): return _ast_eval(node.body)
            elif isinstance(node, ast.Constant): return node.value
            elif isinstance(node, ast.BinOp): return _SAFE_OPS[type(node.op)](_ast_eval(node.left), _ast_eval(node.right))
            elif isinstance(node, ast.UnaryOp): return _SAFE_OPS[type(node.op)](_ast_eval(node.operand))
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _SAFE_FUNCS:
                return _SAFE_FUNCS[node.func.id](*[_ast_eval(a) for a in node.args])
            elif isinstance(node, ast.Name) and node.id in _SAFE_FUNCS: return _SAFE_FUNCS[node.id]
            raise ValueError('Disallowed node')
        val = _ast_eval(ast.parse(expr_str, mode='eval'))
        print(f"NUMERICAL: {{val}}")
    except Exception as e2:
        print(f"ERROR: Sympy: {{e1}} | SafeEval: {{e2}}")
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


execute_math_expression = solve_deterministic_math

