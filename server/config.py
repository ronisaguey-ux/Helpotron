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


config = Config()
