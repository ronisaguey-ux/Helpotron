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

    # Security
    session_secret: str = os.getenv("SESSION_SECRET", "")
    production_mode: bool = os.getenv("PRODUCTION_MODE", "false").lower() == "true"

    # AI Detectors API Keys (Pangram, Sapling, Originality.ai, Copyleaks, Winston AI)
    pangram_api_key: str = os.getenv("PANGRAM_API_KEY", "")
    sapling_api_key: str = os.getenv("SAPLING_API_KEY", "")
    originality_api_key: str = os.getenv("ORIGINALITY_API_KEY", "")
    copyleaks_api_key: str = os.getenv("COPYLEAKS_API_KEY", "")
    copyleaks_email: str = os.getenv("COPYLEAKS_EMAIL", "")
    winston_api_key: str = os.getenv("WINSTON_API_KEY", "")

    # User Verification & 2FA Secrets
    jwt_secret: str = os.getenv("JWT_SECRET", "helpotron_jwt_secret_dev_key_32chars")
    totp_secret: str = os.getenv("TOTP_SECRET", "JBSWY3DPEHPK3PXP")

    # Email Verification & Email 2FA (SMTP)
    email_host: str = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    email_port: int = int(os.getenv("EMAIL_PORT", "587"))
    email_user: str = os.getenv("EMAIL_USER", "")
    email_password: str = os.getenv("EMAIL_PASSWORD", "")
    email_from: str = os.getenv("EMAIL_FROM", "noreply@helpotron.com")
    email_use_tls: bool = os.getenv("EMAIL_USE_TLS", "true").lower() == "true"

    # SMS 2FA (Twilio)
    twilio_account_sid: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_auth_token: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_phone_number: str = os.getenv("TWILIO_PHONE_NUMBER", "")

    # Feature Toggles
    enable_email_verification: bool = os.getenv("ENABLE_EMAIL_VERIFICATION", "false").lower() == "true"
    enable_2fa: bool = os.getenv("ENABLE_2FA", "true").lower() == "true"
    enable_sms_2fa: bool = os.getenv("ENABLE_SMS_2FA", "true").lower() == "true"
    enable_totp_2fa: bool = os.getenv("ENABLE_TOTP_2FA", "true").lower() == "true"


    def validate(self) -> list[str]:
        issues = []
        if not self.omniroute_api_key:
            issues.append("OMNIROUTE_API_KEY not set")
        if not self.database_url:
            issues.append("DATABASE_URL not set")
        if self.production_mode and not self.session_secret:
            issues.append("SESSION_SECRET required in production mode")
        return issues


config = Config()
