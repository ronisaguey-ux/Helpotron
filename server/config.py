"""Helpotron configuration — standardized with Pydantic Settings & fallback defaults."""
from __future__ import annotations

import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings
from pydantic import ConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = ConfigDict(extra="ignore", populate_by_name=True,
                              env_file=os.path.join(BASE_DIR, ".env"), env_file_encoding="utf-8")

    # Core
    project_name: str = "Helpotron Automator"
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = os.getenv("DEBUG", "True").lower() == "true"

    # Server & Security
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))
    secret_key: str = os.getenv("SECRET_KEY", "dev-insecure-secret-key-change-in-prod-32bytesmin")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # Database
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/data/db/helpotron.db")

    # Login captcha (Cloudflare Turnstile, 08-31). When TURNSTILE_SECRET is
    # set, /api/login REQUIRES a valid Turnstile token unless the request
    # carries the operator bypass header (X-Helpotron-Captcha-Bypass) matching
    # CAPTCHA_BYPASS_SECRET — test bots / E2E harnesses only, never shipped in
    # client bundles. Both empty = captcha disabled (local dev).
    turnstile_sitekey: str = os.getenv("TURNSTILE_SITEKEY", "")
    turnstile_secret: str = os.getenv("TURNSTILE_SECRET", "")
    captcha_bypass_secret: str = os.getenv("CAPTCHA_BYPASS_SECRET", "")

    # CORS
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "chrome-extension://*",
    ]

    # LLM & Third-Party APIs
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    omniroute_api_base: str = os.getenv("OMNIROUTE_API_BASE", "https://openrouter.ai/api/v1")
    omniroute_api_key: str = os.getenv("OMNIROUTE_API_KEY", "")

    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_flash_lite_model: str = os.getenv("GEMINI_FLASH_LITE_MODEL", "gemini-3.1-flash-lite")
    gemini_flash_model: str = os.getenv("GEMINI_FLASH_MODEL", "gemini-3.7-flash")
    primary_model: str = os.getenv("PRIMARY_MODEL", "mistral-nemo")  # bare name; llm.py routes NVIDIA tier via OmniRoute free lane
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    whisper_api_key: str = os.getenv("WHISPER_API_KEY", "")
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_admin_chat_id: str = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "")
    chat_timeout_seconds: int = 30

    # Web & Origin
    web_origin: str = os.getenv("WEB_ORIGIN", "http://localhost:5173")

    # Payments (Stripe & PayPal)
    stripe_api_key: str = os.getenv("STRIPE_API_KEY", "")
    stripe_secret_key: str = os.getenv("STRIPE_SECRET_KEY", "")
    stripe_webhook_secret: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    paypal_client_id: str = os.getenv("PAYPAL_CLIENT_ID", "")
    paypal_secret: str = os.getenv("PAYPAL_SECRET", "")

    # Data Lake Storage
    data_lake_dir: str = os.getenv("DATA_LAKE_DIR", str(BASE_DIR / "datalake_storage"))

    # Admin
    admin_public_id: str = os.getenv("ADMIN_PUBLIC_ID", "RoniDev")

    # Security & Sessions
    session_secret: str = os.getenv("SESSION_SECRET", "helpotron_session_secret_dev_key_32chars")
    production_mode: bool = os.getenv("PRODUCTION_MODE", "false").lower() == "true"
    jwt_secret: str = os.getenv("JWT_SECRET", "helpotron_jwt_secret_dev_key_32chars")
    totp_secret: str = os.getenv("TOTP_SECRET", "JBSWY3DPEHPK3PXP")

    # AI Detectors
    pangram_api_key: str = os.getenv("PANGRAM_API_KEY", "")
    sapling_api_key: str = os.getenv("SAPLING_API_KEY", "")
    originality_api_key: str = os.getenv("ORIGINALITY_API_KEY", "")
    copyleaks_api_key: str = os.getenv("COPYLEAKS_API_KEY", "")
    copyleaks_email: str = os.getenv("COPYLEAKS_EMAIL", "")
    winston_api_key: str = os.getenv("WINSTON_API_KEY", "")

    # Email Verification & SMTP
    email_host: str = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    email_port: int = int(os.getenv("EMAIL_PORT", "587"))
    email_user: str = os.getenv("EMAIL_USER", "")
    email_password: str = os.getenv("EMAIL_PASSWORD", "")
    email_from: str = os.getenv("EMAIL_FROM", "noreply@helpotron.com")
    email_use_tls: bool = os.getenv("EMAIL_USE_TLS", "true").lower() == "true"

    # SMS (Twilio)
    twilio_account_sid: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_auth_token: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_api_key_sid: str = os.getenv("TWILIO_API_KEY_SID", os.getenv("TWILIO_SID", ""))
    twilio_api_key_secret: str = os.getenv("TWILIO_API_KEY_SECRET", os.getenv("TWILIO_SECRET", ""))
    twilio_messaging_service_sid: str = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "MG9757965c48d30953d3670030994f0c80")
    twilio_phone_number: str = os.getenv("TWILIO_PHONE_NUMBER", "+13187688667")


    # Feature Toggles
    enable_email_verification: bool = os.getenv("ENABLE_EMAIL_VERIFICATION", "false").lower() == "true"
    enable_2fa: bool = os.getenv("ENABLE_2FA", "true").lower() == "true"
    enable_sms_2fa: bool = os.getenv("ENABLE_SMS_2FA", "true").lower() == "true"
    enable_totp_2fa: bool = os.getenv("ENABLE_TOTP_2FA", "true").lower() == "true"

    # Uppercase aliases for settings
    @property
    def PROJECT_NAME(self) -> str:
        return self.project_name

    @property
    def ENVIRONMENT(self) -> str:
        return self.environment

    @property
    def DEBUG(self) -> bool:
        return self.debug

    @property
    def SECRET_KEY(self) -> str:
        return self.secret_key

    @property
    def CORS_ORIGINS(self) -> List[str]:
        return self.cors_origins

    @property
    def DATABASE_URL(self) -> str:
        return self.database_url

    def validate(self) -> list[str]:
        problems = []
        if self.omniroute_api_base and not (self.omniroute_api_base.startswith("http://") or self.omniroute_api_base.startswith("https://")):
            problems.append("OMNIROUTE_API_BASE must start with http:// or https://")
        if not self.primary_model or not str(self.primary_model).strip():
            problems.append("PRIMARY_MODEL must be non-empty")
        if getattr(self, "chat_timeout_seconds", 30) < 5:
            problems.append("CHAT_TIMEOUT_SECONDS must be at least 5s")
        if self.production_mode and not self.session_secret:
            problems.append("SESSION_SECRET required in production mode")
        return problems


Config = Settings
settings = Settings()
config = settings
# Export JWT constants for legacy imports
JWT_SECRET = settings.jwt_secret
JWT_ALGORITHM = settings.algorithm

# LLM config aliases
OPENROUTER_API_KEY = settings.openrouter_api_key if hasattr(settings, 'openrouter_api_key') else getattr(settings, 'omniroute_api_key', '')
DEFAULT_MODEL = getattr(settings, 'primary_model', 'deepseek-v4-flash')
