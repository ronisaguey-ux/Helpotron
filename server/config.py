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
    primary_model: str = os.getenv("PRIMARY_MODEL", "deepseek-v4-flash-free")
    fallback_models: list[str] = [
        m.strip() for m in os.getenv("FALLBACK_MODELS", "mimo-v2.5-free,nemotron-3-ultra-free").split(",") if m.strip()
    ]
    chat_timeout_seconds: int = int(os.getenv("CHAT_TIMEOUT_SECONDS", "60"))

    # Database
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./helpotron.db")

    # Telegram
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_admin_chat_id: str = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "")

    # Transcription
    whisper_api_key: str = os.getenv("WHISPER_API_KEY", "")

    # Payments
    stripe_secret_key: str = os.getenv("STRIPE_SECRET_KEY", "")

    # Web
    web_origin: str = os.getenv("WEB_ORIGIN", "http://localhost:5173")

    def validate(self) -> list[str]:
        """Startup sanity checks. Returns a list of problems; callers decide
        whether to hard-fail (missing LLM endpoint) or warn (missing optional
        integrations)."""
        problems: list[str] = []
        if not self.omniroute_api_base.startswith(("http://", "https://")):
            problems.append(f"OMNIROUTE_API_BASE malformed: {self.omniroute_api_base!r}")
        if not self.primary_model.strip():
            problems.append("PRIMARY_MODEL is empty")
        if self.chat_timeout_seconds < 5 or self.chat_timeout_seconds > 600:
            problems.append(f"CHAT_TIMEOUT_SECONDS out of range: {self.chat_timeout_seconds}")
        if not self.database_url.startswith(("sqlite://", "postgresql://", "postgres://")):
            problems.append(f"DATABASE_URL scheme unsupported: {self.database_url!r}")
        if self.telegram_bot_token and len(self.telegram_bot_token) < 30:
            problems.append("TELEGRAM_BOT_TOKEN looks truncated (< 30 chars)")
        if self.web_origin and not self.web_origin.startswith("http"):
            problems.append(f"WEB_ORIGIN malformed: {self.web_origin!r}")
        return problems


config = Config()
