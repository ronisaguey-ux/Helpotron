"""API Routes for Deterministic Python Math Execution and Verification."""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from .database import User
from .routes_features import get_current_authenticated_user
from .math_executor import run_python_math_bash, solve_deterministic_math, sanitize_math_hallucinations_in_text, safe_eval_math_expr

router = APIRouter(prefix="/api/math", tags=["math_execution"])


class MathSolveRequest(BaseModel):
    expression: str = Field(..., description="Math expression or equation to solve deterministically")
    context: Optional[str] = None


class MathVerifyTextRequest(BaseModel):
    text: str = Field(..., description="Text containing arithmetic expressions to verify and correct")


class PythonCodeExecuteRequest(BaseModel):
    code: str = Field(..., description="Python math snippet to execute directly")
    timeout: float = Field(5.0, ge=0.5, le=10.0)


@router.post("/solve")
async def solve_math_endpoint(
    req: MathSolveRequest,
    current_user: User = Depends(get_current_authenticated_user)
):
    """Solves any algebraic equation, calculus problem, or arithmetic expression using exact Python math."""
    res = solve_deterministic_math(req.expression)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Math solving failed"))
    return {"status": "success", "result": res}


@router.post("/verify-text")
async def verify_text_math_endpoint(
    req: MathVerifyTextRequest,
    current_user: User = Depends(get_current_authenticated_user)
):
    """Scans and corrects arithmetic calculations in text using deterministic Python evaluation."""
    corrected = sanitize_math_hallucinations_in_text(req.text)
    return {
        "status": "success",
        "original_text": req.text,
        "corrected_text": corrected,
        "had_corrections": corrected != req.text,
    }


@router.post("/execute")
async def execute_python_math_endpoint(
    req: PythonCodeExecuteRequest,
    current_user: User = Depends(get_current_authenticated_user)
):
    """Evaluate a math expression through the AST whitelist only (remediation
    BATCH-03: the previous implementation ran arbitrary code via subprocess —
    a remote code-execution surface. `safe_eval_math_expr` never executes
    code; unknown nodes fail closed."""
    try:
        result = safe_eval_math_expr(req.code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unsupported or unsafe expression: {e}")
    return {"status": "success", "output": str(result)}
