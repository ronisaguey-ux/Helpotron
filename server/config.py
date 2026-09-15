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
    project_name: str = "Helpotron Academic Companion"
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
    gemini_flash_model: str = os.getenv("GEMINI_FLASH_MODEL", "gemini-3.8-flash")
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
    # Import-from-URL (feature #79): the scrape sidecar address + operator flag.
    scrape_sidecar_url: str = os.getenv("SCRAPE_SIDECAR_URL", "http://127.0.0.1:9778")
    import_from_url_enabled: bool = os.getenv("IMPORT_FROM_URL_ENABLED", "true").lower() in ("1", "true", "yes", "on")
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

    # Self-hosted detectors (owner 09-06): ZipPy compression heuristic +
    # INT8 ONNX RoBERTa classifier — both run in-process (no API keys, no
    # outbound calls). ONNX needs the model dir populated by
    # scripts/fetch_detector_model.sh; without it the registry degrades to
    # ZipPy-only (tier 2 + paid tier skip accordingly). The funnel makes the
    # paid API detectors (Pangram/Sapling/…) run ONLY when the local verdict
    # is ambiguous (15-90 of 100), while 0-15 (= human) and 90-100 (= AI)
    # short-circuit without any paid call.
    detector_zippy_enabled: bool = os.getenv("HELPOTRON_DETECTOR_ZIPPY", "true").lower() in ("1", "true", "yes", "on")
    detector_funnel_enabled: bool = os.getenv("HELPOTRON_DETECTOR_FUNNEL", "true").lower() in ("1", "true", "yes", "on")
    detector_model_dir: str = os.getenv("HELPOTRON_DETECTOR_MODEL_DIR", str(BASE_DIR / "server" / "detector_models" / "onnx"))

    # Cloudflare Computer (owner 09-06): durable agent workspace via the
    # @cloudflare/computer preview runtime (github.com/cloudflare/computer).
    # Helpotron is not Cloudflare-native — it calls the deployed computer-mcp
    # Worker's /mcp endpoint (bearer MCP_TOKEN) as an MCP client. Disabled by
    # default: the runtime is PREVIEW-ONLY (unstable APIs, "NOT suitable for
    # production use"), and the worker itself must be deployed after
    # `npx wrangler login` before any enablement.
    cf_computer_enabled: bool = os.getenv("HELPOTRON_CF_COMPUTER_ENABLED", "false").lower() in ("1", "true", "yes", "on")
    cf_computer_url: str = os.getenv("HELPOTRON_CF_COMPUTER_URL", "")  # https://computer-mcp.<sub>.workers.dev/mcp
    cf_computer_token: str = os.getenv("HELPOTRON_CF_COMPUTER_TOKEN", "")  # MCP_TOKEN worker secret

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
    # 08-31: the old default MG9757... was stale — the account has no
    # messaging service (live API check: create/list 404), and sends work via
    # the owned From number. Empty default = fall back to From.
    twilio_messaging_service_sid: str = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "")
    twilio_phone_number: str = os.getenv("TWILIO_PHONE_NUMBER", "+13187688667")
    # Twilio Verify service — SMS OTP with no A2P 10DLC campaign needed.
    twilio_verify_service_sid: str = os.getenv("TWILIO_VERIFY_SERVICE_SID", "")

    # Local development login bypass. Both must be set for it to do anything,
    # and it is additionally refused for any request that did not arrive on a
    # local Host (see _dev_login_allowed in main.py). They live in .env
    # (gitignored, mode 600) so no credential is ever in the repository.
    # Unset both to disable the mechanism entirely.
    dev_login_public_id: str = os.getenv("DEV_LOGIN_PUBLIC_ID", "")
    dev_login_password: str = os.getenv("DEV_LOGIN_PASSWORD", "")
    # Owner directive: purchases require 2FA enabled by default
    purchases_require_2fa: bool = os.getenv("PURCHASES_REQUIRE_2FA", "true").lower() == "true"


    # Feature Toggles
    enable_email_verification: bool = os.getenv("ENABLE_EMAIL_VERIFICATION", "false").lower() == "true"
    enable_2fa: bool = os.getenv("ENABLE_2FA", "true").lower() == "true"
    enable_sms_2fa: bool = os.getenv("ENABLE_SMS_2FA", "true").lower() == "true"
    enable_totp_2fa: bool = os.getenv("ENABLE_TOTP_2FA", "true").lower() == "true"
    launch_enabled: bool = os.getenv("LAUNCH_ENABLED", "false").lower() == "true"

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
OPENROUTER_API_KEY = settings.openrouter_api_key if hasattr(settings, 'openrouter_api_key') else ''
DEFAULT_MODEL = getattr(settings, 'primary_model', 'deepseek-v4.1-flash')
