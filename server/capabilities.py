"""Capabilities query service for Helpotron.

Provides authoritative runtime capability query surface (/api/capabilities),
describing live systems, active detectors, sandbox support, and feature availability.
"""
from __future__ import annotations

from typing import Any, Dict, List
from .config import config
from .detectors import is_onnx_model_present  # self-hosted tier (owner 09-06)


class CapabilitiesEngine:
    """Provides structured capability queries."""

    @staticmethod
    def get_capabilities() -> Dict[str, Any]:
        has_pangram = bool(getattr(config, "pangram_api_key", ""))
        has_sapling = bool(getattr(config, "sapling_api_key", ""))
        has_twilio = bool(getattr(config, "twilio_account_sid", "") and getattr(config, "twilio_phone_number", ""))
        has_stripe = bool(getattr(config, "stripe_secret_key", "") and getattr(config, "stripe_webhook_secret", ""))

        return {
            "status": "success",
            "version": "2.5.2",
            "environment": getattr(config, "environment", "development"),
            "currency_model": {
                "task_token_value_usd": 0.01,
                "credit_discount_value_usd": 1.00,
                "microcredit_exchange_rate": 1000,
                "pricing_type": "pay_as_you_go_tokens",
            },
            "features": {
                "canvas_lms_sync": True,
                "universal_assignment_dump": True,
                "overlord_agent": True,
                "subagent_task_teams": True,
                "subagent_interruption": True,
                "sandboxed_execution": True,
                "two_factor_auth": True,
                "purchases_2fa_enforced": True,
                "two_way_admin_chat": True,
                "free_trial_sms": has_twilio,
                "stripe_checkout": has_stripe,
            },
            "ai_detectors": {
                "active": ([d for d, enabled in [("pangram", has_pangram), ("sapling", has_sapling)] if enabled]
                           + ["zippy"]
                           + (["roberta_onnx"] if is_onnx_model_present(getattr(config, "detector_model_dir", "")) else [])),
                "supported": ["pangram", "sapling", "zippy", "roberta_onnx",
                              "perplexity_cadence", "statistical_burstiness"],
                "purged": ["winston_ai"],
            },
            "models": {
                "primary": getattr(config, "primary_model", "gemini-3.7-flash"),
                "flash_lite": getattr(config, "gemini_flash_lite_model", "gemini-3.1-flash-lite"),
                "flash": getattr(config, "gemini_flash_model", "gemini-3.7-flash"),
            },
            "sandbox": {
                "supported_languages": ["python", "javascript", "bash"],
                "file_inspection_enabled": True,
                "execution_limits_enforced": True,
            },
        }


capabilities = CapabilitiesEngine()

