"""Helpotron configuration — env-driven, .env.example documents every key."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    # LLM
    omniroute_api_base: str = os.getenv("OMNIROUTE_API_BASE", "http://localhost:20128/api/v1")
    omniroute_api_key: str = os.getenv("OMNIROUTE_API_KEY", "")
    primary_model: str = os.getenv("PRIMARY_MODEL", "deepseek-v4-flash")

    # Database
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/helpotron.db")

    # Web
    web_origin: str = os.getenv("WEB_ORIGIN", "http://localhost:5173")

    # Payments (Stripe)
    stripe_secret_key: str = os.getenv("STRIPE_SECRET_KEY", "")
    stripe_webhook_secret: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    # Admin — set your public_id here to access /api/admin/*
    admin_public_id: str = os.getenv("ADMIN_PUBLIC_ID", "")

    # Telegram
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")

    # DeepSeek
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")

    def validate(self) -> list[str]:
        issues = []
        if not self.omniroute_api_key:
            issues.append("OMNIROUTE_API_KEY not set")
        if not self.database_url:
            issues.append("DATABASE_URL not set")
        return issues


config = Config()
