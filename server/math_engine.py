"""Safe math expression evaluator (remediation BATCH-03).

Plan section: AST-whitelist `safe_eval` — evaluates user-supplied math
expressions through a strict AST whitelist and raises `SecurityError` on
anything outside it (attribute access, imports, disallowed calls).

`__import__("os").system("id")` parses to a Call whose func is an
Attribute — rejected before anything executes. This module is the
plan-sanctioned home of the sandbox; the legacy `safe_eval_math_expr`
in server/math_executor.py is kept for the pre-plan callers.
"""
from __future__ import annotations

import ast
import math
import operator
from typing import Any, Dict, Union


class SecurityError(Exception):
    """Raised when a math expression contains a disallowed construct."""


def _safe_pow(a: Any, b: Any) -> Any:
    if isinstance(b, (int, float)) and (b > 4096 or b < -4096):
        raise SecurityError("Exponent exceeds safe limit (max 4096)")
    if isinstance(a, (int, float)) and abs(a) > 100000 and isinstance(b, (int, float)) and b > 50:
        raise SecurityError("Power computation exceeds safe threshold")
    res = operator.pow(a, b)
    if isinstance(res, int) and res.bit_length() > 65536:
        raise SecurityError("Computed integer exceeds memory bounds")
    return res

# Whitelist of strictly safe mathematical operators
SAFE_OPERATORS: Dict[type, Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: _safe_pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

# Whitelist of safe math functions and constants
SAFE_FUNCTIONS: Dict[str, Any] = {
    'sin': math.sin,
    'cos': math.cos,
    'tan': math.tan,
    'asin': math.asin,
    'acos': math.acos,
    'atan': math.atan,
    'sqrt': math.sqrt,
    'log': math.log,
    'log10': math.log10,
    'log2': math.log2,
    'exp': math.exp,
    'floor': math.floor,
    'ceil': math.ceil,
    'abs': abs,
    'min': min,
    'max': max,
    'round': round,
    'pi': math.pi,
    'e': math.e,
    'tau': math.tau,
}

MAX_EXPR_LEN = 500


def safe_eval(expr: str) -> Union[int, float]:
    """Evaluate a math expression under a strict AST whitelist.

    Raises:
        SecurityError: if the expression contains any construct outside the
            whitelist (attribute access, calls to unknown names, imports,
            comprehensions, lambdas, ...).
        TypeError/ValueError: for malformed-but-safe inputs (syntax errors
            surface as SyntaxError, bad constants as TypeError).
    """
    if not isinstance(expr, str):
        raise TypeError('Expression must be a string')
    if len(expr) > MAX_EXPR_LEN:
        raise SecurityError('Expression exceeds maximum allowable length of 500 characters')

    try:
        tree = ast.parse(expr, mode='eval')
    except SyntaxError:
        raise SecurityError('Expression is not valid Python syntax') from None

    def _eval(node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            raise SecurityError(f'Disallowed constant type: {type(node.value).__name__}')
        if isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in SAFE_OPERATORS:
                raise SecurityError(f'Disallowed binary operator: {op_type.__name__}')
            return SAFE_OPERATORS[op_type](_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in SAFE_OPERATORS:
                raise SecurityError(f'Disallowed unary operator: {op_type.__name__}')
            return SAFE_OPERATORS[op_type](_eval(node.operand))
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in SAFE_FUNCTIONS:
                raise SecurityError(f'Disallowed function call: {ast.dump(node.func)}')
            func = SAFE_FUNCTIONS[node.func.id]
            if node.keywords:
                raise SecurityError('Keyword arguments are not allowed in math expressions')
            args = [_eval(arg) for arg in node.args]
            return func(*args)
        if isinstance(node, ast.Name):
            if node.id in SAFE_FUNCTIONS:
                return SAFE_FUNCTIONS[node.id]
            raise SecurityError(f'Undefined or disallowed identifier: {node.id}')
        # Attribute access, imports, lambdas, comprehensions, comparisons,
        # boolean ops, subscripts, ... — everything else is rejected outright.
        raise SecurityError(f'Disallowed AST node: {type(node).__name__}')

    return _eval(tree)


# Alias matching the app's existing naming convention (math_executor)
safe_eval_math_expr = safe_eval
