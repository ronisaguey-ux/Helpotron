"""API Routes for Deterministic Python Math Execution and Verification."""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .math_executor import run_python_math_bash, solve_deterministic_math, sanitize_math_hallucinations_in_text

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
async def solve_math_endpoint(req: MathSolveRequest):
    """Solves any algebraic equation, calculus problem, or arithmetic expression using exact Python math."""
    res = solve_deterministic_math(req.expression)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Math solving failed"))
    return {"status": "success", "result": res}


@router.post("/verify-text")
async def verify_text_math_endpoint(req: MathVerifyTextRequest):
    """Scans and corrects arithmetic calculations in text using deterministic Python evaluation."""
    corrected = sanitize_math_hallucinations_in_text(req.text)
    return {
        "status": "success",
        "original_text": req.text,
        "corrected_text": corrected,
        "had_corrections": corrected != req.text,
    }


@router.post("/execute")
async def execute_python_math_endpoint(req: PythonCodeExecuteRequest):
    """Executes arbitrary safe Python math calculations via subprocess with standard math libraries."""
    ok, output = run_python_math_bash(req.code, timeout=req.timeout)
    if not ok:
        raise HTTPException(status_code=400, detail=output)
    return {"status": "success", "output": output}
