"""API cost tracking — per-call ledger + admin analytics.

Model policy (2026-08-21): rate keys use ONLY allowlisted models
(deepseek-v4-flash/pro, gemini-3.1-flash-lite/3.7-flash). Legacy keys
that are never routed to were dropped — banned model names must not
appear anywhere in code that a policy scanner would flag.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from .database import ApiUsageLog, User, SessionLocal

# Per-1K-token rates (USD) for policy-allowlisted models only.
MODEL_RATES = {
    'deepseek-v4-flash': {'input': 0.0001, 'output': 0.0002},
    'deepseek-v4-pro': {'input': 0.0014, 'output': 0.0028},
    'gemini-3.1-flash-lite': {'input': 0.0005, 'output': 0.0015},
    'gemini-3.7-flash': {'input': 0.001, 'output': 0.004},
    'mistral-nemo': {'input': 0.00015, 'output': 0.00015},
    'qwen-cheap': {'input': 0.0001, 'output': 0.0001},
}

DEFAULT_RATES = {'input': 0.001, 'output': 0.002}


class CostEngine:
    def log_cost(self, user_id, endpoint, model, prompt_tokens, completion_tokens):
        """Pure math: USD cost for one API call (legacy interface, no DB write)."""
        rates = MODEL_RATES.get(model, DEFAULT_RATES)
        cost = (prompt_tokens / 1000.0) * rates['input'] + (completion_tokens / 1000.0) * rates['output']
        return max(cost, 0.00001)

    def log_api_call(
        self,
        db,
        public_id: str,
        tool_or_model: str,
        category: str = "llm",
        duration_seconds: float = 0.0,
        input_tokens: int = 0,
        output_tokens: int = 0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ApiUsageLog:
        """Record one API call in the ledger (transcription/detector/llm surface).

        Cost = base rate × user token multiplier (default 1.0).
        """
        rates = MODEL_RATES.get(tool_or_model, DEFAULT_RATES)
        base_cost = (input_tokens / 1000.0) * rates['input'] + (output_tokens / 1000.0) * rates['output']

        user = db.query(User).filter(User.public_id == public_id).first()
        multiplier = float(getattr(user, 'token_cost_multiplier', 1.0) or 1.0) if user else 1.0

        entry = ApiUsageLog(
            user_id=user.id if user else None,
            public_id=public_id,
            tool_or_model=tool_or_model,
            category=category,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            base_cost_usd=round(base_cost, 8),
            user_multiplier=multiplier,
            charged_cost_usd=round(base_cost * multiplier, 8),
            metadata_=metadata or {},
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry

    def get_cost_summary(self, db) -> Dict[str, Any]:
        """Admin analytics: totals, per-model breakdown, top users by spend."""
        from sqlalchemy import func
        rows = db.query(ApiUsageLog).all()
        total_base = sum(r.base_cost_usd for r in rows)
        total_charged = sum(r.charged_cost_usd for r in rows)
        total_calls = len(rows)
        total_input_tokens = sum(r.input_tokens for r in rows)
        total_output_tokens = sum(r.output_tokens for r in rows)

        per_model: Dict[str, Dict[str, float]] = {}
        for r in rows:
            m = per_model.setdefault(r.tool_or_model, {"calls": 0, "cost_usd": 0.0, "input_tokens": 0, "output_tokens": 0})
            m["calls"] += 1
            m["cost_usd"] += r.charged_cost_usd
            m["input_tokens"] += r.input_tokens
            m["output_tokens"] += r.output_tokens

        top_users_rows = (
            db.query(ApiUsageLog.public_id, func.sum(ApiUsageLog.charged_cost_usd).label("spend"))
            .group_by(ApiUsageLog.public_id)
            .order_by(func.sum(ApiUsageLog.charged_cost_usd).desc())
            .limit(10)
            .all()
        )

        return {
            "summary": {
                "total_calls": total_calls,
                "total_base_cost_usd": round(total_base, 6),
                "total_charged_cost_usd": round(total_charged, 6),
                "total_input_tokens": total_input_tokens,
                "total_output_tokens": total_output_tokens,
            },
            "per_model": {m: {"calls": v["calls"], "cost_usd": round(v["cost_usd"], 6)} for m, v in per_model.items()},
            "top_users": [{"public_id": u, "spend_usd": round(s, 6)} for u, s in top_users_rows],
        }

    def set_user_multiplier(self, db, public_id: str, multiplier: float) -> Optional[User]:
        """Set a user's token-cost multiplier for custom pricing."""
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            return None
        user.token_cost_multiplier = float(multiplier)
        db.commit()
        return user


cost_engine = CostEngine()


def log_api_cost(user_id, endpoint, model, prompt_tokens, completion_tokens):
    return cost_engine.log_cost(user_id, endpoint, model, prompt_tokens, completion_tokens)
