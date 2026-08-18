"""Cost Tracking & Per-User Token Pricing Engine.

Logs every API call (LLMs, Audio Transcription, Vision, AI Detectors),
calculates costs with user-specific token multipliers, and provides
comprehensive analytics on costs, revenue, usage trends, and profit margins.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import func, desc, text
from sqlalchemy.orm import Session

from .database import ApiUsageLog, User, SessionLocal, utcnow
from .config import config

logger = logging.getLogger(__name__)

# Base Model & Tool Rates (in USD)
MODEL_RATES = {
    # Gemini Models
    "gemini-3.1-flash-lite": {"per_input_token": 0.0000005, "per_output_token": 0.0000015},  # $0.50 / 1M input
    "gemini-3.7-flash": {"per_input_token": 0.0000025, "per_output_token": 0.0000075},       # $2.50 / 1M input
    "deepseek-v4-flash": {"per_input_token": 0.0000006, "per_output_token": 0.0000018},
    "deepseek-flash": {"per_input_token": 0.0000006, "per_output_token": 0.0000018},
    "openai-whisper": {"per_second": 0.0001},  # $0.006 / minute
    "whisper": {"per_second": 0.0001},
    "gemini-vision": {"per_unit": 0.0025},     # $0.0025 per OCR/Vision image
    # AI Detectors (per check)
    "detector_pangram": {"per_unit": 0.0020},
    "detector_sapling": {"per_unit": 0.0015},
    "detector_originality": {"per_unit": 0.0030},
    "detector_copyleaks": {"per_unit": 0.0040},
    "detector_winston": {"per_unit": 0.0020},
}


class CostEngine:
    @staticmethod
    def calculate_base_cost(
        tool_or_model: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        duration_seconds: float = 0.0,
        units: int = 1,
    ) -> float:
        """Calculates base API cost before user multiplier."""
        key = tool_or_model.lower()
        rate = MODEL_RATES.get(key)
        if not rate:
            # Fallback based on name patterns
            if "lite" in key or "3.1" in key:
                rate = MODEL_RATES["gemini-3.1-flash-lite"]
            elif "3.7" in key or "pro" in key:
                rate = MODEL_RATES["gemini-3.7-flash"]
            elif "whisper" in key or "transcribe" in key:
                rate = MODEL_RATES["openai-whisper"]
            elif "detector" in key:
                rate = {"per_unit": 0.0025}
            else:
                rate = MODEL_RATES["gemini-3.1-flash-lite"]

        cost = 0.0
        if "per_input_token" in rate:
            cost += input_tokens * rate["per_input_token"]
        if "per_output_token" in rate:
            cost += output_tokens * rate["per_output_token"]
        if "per_second" in rate and duration_seconds > 0:
            cost += duration_seconds * rate["per_second"]
        if "per_unit" in rate and units > 0:
            cost += units * rate["per_unit"]

        return max(0.00001, round(cost, 6))

    @staticmethod
    def log_api_call(
        db: Session,
        public_id: str,
        tool_or_model: str,
        category: str = "llm",
        input_tokens: int = 0,
        output_tokens: int = 0,
        duration_seconds: float = 0.0,
        units: int = 1,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ApiUsageLog:
        """Calculates cost with user's multiplier and logs to database."""
        user = db.query(User).filter(User.public_id == public_id).first()
        user_multiplier = user.token_cost_multiplier if user and user.token_cost_multiplier else 1.0
        user_id = user.id if user else None

        base_cost = CostEngine.calculate_base_cost(
            tool_or_model=tool_or_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_seconds=duration_seconds,
            units=units,
        )
        charged_cost = round(base_cost * user_multiplier, 6)

        entry = ApiUsageLog(
            user_id=user_id,
            public_id=public_id,
            tool_or_model=tool_or_model,
            category=category,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            base_cost_usd=base_cost,
            user_multiplier=user_multiplier,
            charged_cost_usd=charged_cost,
            created_at=utcnow(),
            metadata_=metadata or {},
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry

    @staticmethod
    def get_cost_summary(db: Session) -> Dict[str, Any]:
        """Returns comprehensive analytics for Admin Cost Controls."""
        total_logs = db.query(ApiUsageLog).count()
        total_cost = db.query(func.sum(ApiUsageLog.base_cost_usd)).scalar() or 0.0
        total_charged = db.query(func.sum(ApiUsageLog.charged_cost_usd)).scalar() or 0.0

        # Cost breakdown by tool/model
        tool_breakdown_raw = (
            db.query(
                ApiUsageLog.tool_or_model,
                func.count(ApiUsageLog.id).label("call_count"),
                func.sum(ApiUsageLog.base_cost_usd).label("total_base_cost"),
                func.sum(ApiUsageLog.charged_cost_usd).label("total_charged"),
            )
            .group_by(ApiUsageLog.tool_or_model)
            .all()
        )
        tool_breakdown = [
            {
                "tool_or_model": row.tool_or_model,
                "call_count": row.call_count,
                "total_base_cost": round(float(row.total_base_cost or 0), 4),
                "total_charged": round(float(row.total_charged or 0), 4),
            }
            for row in tool_breakdown_raw
        ]

        # Cost breakdown by category
        cat_breakdown_raw = (
            db.query(
                ApiUsageLog.category,
                func.count(ApiUsageLog.id).label("call_count"),
                func.sum(ApiUsageLog.base_cost_usd).label("total_base_cost"),
            )
            .group_by(ApiUsageLog.category)
            .all()
        )
        category_breakdown = [
            {
                "category": row.category,
                "call_count": row.call_count,
                "total_base_cost": round(float(row.total_base_cost or 0), 4),
            }
            for row in cat_breakdown_raw
        ]

        # Top-cost users list
        top_users_raw = (
            db.query(
                ApiUsageLog.public_id,
                func.count(ApiUsageLog.id).label("total_calls"),
                func.sum(ApiUsageLog.base_cost_usd).label("total_cost"),
                func.sum(ApiUsageLog.charged_cost_usd).label("total_charged"),
            )
            .group_by(ApiUsageLog.public_id)
            .order_by(desc("total_cost"))
            .limit(10)
            .all()
        )
        top_users = []
        for row in top_users_raw:
            user = db.query(User).filter(User.public_id == row.public_id).first()
            multiplier = user.token_cost_multiplier if user else 1.0
            plan = user.plan if user else "basic"
            # Estimate revenue from plan: basic=$9.99, pro=$19.99, elite=$39.99
            plan_revenue = 39.99 if plan == "elite" else (19.99 if plan == "pro" else 9.99)
            user_cost = float(row.total_cost or 0)
            profit = round(plan_revenue - user_cost, 2)
            margin_pct = round((profit / plan_revenue) * 100, 1) if plan_revenue > 0 else 0

            top_users.append({
                "public_id": row.public_id,
                "total_calls": row.total_calls,
                "multiplier": multiplier,
                "total_cost": round(user_cost, 4),
                "total_charged": round(float(row.total_charged or 0), 4),
                "plan": plan,
                "estimated_revenue": plan_revenue,
                "profit": profit,
                "margin_pct": margin_pct,
            })

        # Usage trends over last 7 days
        trends = []
        now = utcnow()
        for i in range(6, -1, -1):
            day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            day_cost = (
                db.query(func.sum(ApiUsageLog.base_cost_usd))
                .filter(ApiUsageLog.created_at >= day_start, ApiUsageLog.created_at < day_end)
                .scalar()
                or 0.0
            )
            day_calls = (
                db.query(func.count(ApiUsageLog.id))
                .filter(ApiUsageLog.created_at >= day_start, ApiUsageLog.created_at < day_end)
                .scalar()
                or 0
            )
            trends.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "day_name": day_start.strftime("%a"),
                "cost_usd": round(float(day_cost), 4),
                "calls": day_calls,
            })

        # Estimated platform profit margin
        total_users = db.query(User).count() or 1
        est_platform_revenue = total_users * 15.0  # blended average
        est_platform_profit = round(est_platform_revenue - total_cost, 2)
        profit_margin_pct = round((est_platform_profit / est_platform_revenue) * 100, 1) if est_platform_revenue > 0 else 0

        return {
            "total_logs": total_logs,
            "total_cost_usd": round(float(total_cost), 4),
            "total_charged_usd": round(float(total_charged), 4),
            "tool_breakdown": tool_breakdown,
            "category_breakdown": category_breakdown,
            "top_users": top_users,
            "trends": trends,
            "platform_profit_summary": {
                "estimated_revenue_usd": round(est_platform_revenue, 2),
                "total_api_cost_usd": round(float(total_cost), 4),
                "estimated_profit_usd": est_platform_profit,
                "profit_margin_pct": profit_margin_pct,
            },
        }

    @staticmethod
    def set_user_multiplier(db: Session, public_id: str, multiplier: float) -> Optional[User]:
        """Sets a custom token multiplier for a user."""
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            return None
        user.token_cost_multiplier = max(0.1, min(10.0, float(multiplier)))
        db.commit()
        db.refresh(user)
        return user


cost_engine = CostEngine()
