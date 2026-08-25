"""User Verification and Two-Factor Authentication (2FA) for Helpotron.

Supports:
1. Email Verification (6-digit numeric code, 15-minute TTL).
2. Two-Factor Authentication (2FA):
   - Email 2FA (6-digit code via SMTP).
   - TOTP Authenticator Apps (Google Authenticator, Authy, 1Password via pyotp).
   - SMS 2FA (6-digit code via Twilio REST API).
3. Environment-driven configuration with secure defaults and test mode mocks.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
import os
import secrets
import smtplib
import string
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional, Tuple

import httpx
import pyotp

from .config import config

logger = logging.getLogger("helpotron.auth_2fa")

CODE_EXPIRATION_SECONDS = 15 * 60  # 15 minutes


class VerificationCodeStore:
    """In-memory verification code store with 15-minute TTL and single-use invalidation."""

    def __init__(self) -> None:
        # Key: (identifier, purpose) -> {"code": "123456", "expires_at": float, "attempts": int}
        self._store: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def generate_code(self, identifier: str, purpose: str = "email_verification") -> str:
        """Generates a 6-digit numeric verification code valid for 15 minutes."""
        code = "".join(secrets.choice(string.digits) for _ in range(6))
        expires_at = time.time() + CODE_EXPIRATION_SECONDS
        self._store[(identifier.lower().strip(), purpose)] = {
            "code": code,
            "expires_at": expires_at,
            "attempts": 0,
        }
        logger.info("Generated 6-digit code for %s [%s] (expires in 15 min)", identifier, purpose)
        return code

    def verify_code(self, identifier: str, code: str, purpose: str = "email_verification") -> Tuple[bool, str]:
        """Validates the 6-digit code, checking expiration and single-use."""
        key = (identifier.lower().strip(), purpose)
        entry = self._store.get(key)

        if not entry:
            return False, "No active verification code found or code already used."

        if time.time() > entry["expires_at"]:
            self._store.pop(key, None)
            return False, "Verification code has expired (15-minute limit). Please request a new code."

        entry["attempts"] += 1
        if entry["attempts"] > 5:
            self._store.pop(key, None)
            return False, "Too many failed attempts. Code invalidated."

        if not secrets.compare_digest(str(entry["code"]), str(code).strip()):
            return False, "Invalid verification code."

        # Burn code on successful use
        self._store.pop(key, None)
        return True, "Verification successful."


code_store = VerificationCodeStore()


class EmailNotificationService:
    """Sends verification and 2FA emails via SMTP (or graceful mock when unconfigured)."""

    @staticmethod
    def send_email(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
        if not config.email_user or not config.email_password:
            logger.info("[Mock Email] To: %s | Subject: %s | Content: %s", to_email, subject, text_content)
            return True

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = config.email_from or config.email_user
            msg["To"] = to_email

            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            with smtplib.SMTP(config.email_host, config.email_port, timeout=10) as server:
                if config.email_use_tls:
                    server.starttls()
                server.login(config.email_user, config.email_password)
                server.sendmail(msg["From"], [to_email], msg.as_string())
            logger.info("Successfully sent verification email to %s", to_email)
            return True
        except Exception as e:
            logger.error("Failed sending email to %s: %s", to_email, e)
            return False

    @classmethod
    def send_verification_code(cls, to_email: str, code: str, purpose_label: str = "Email Verification") -> bool:
        subject = f"Your Helpotron {purpose_label} Code: {code}"
        text_content = (
            f"Hello,\n\n"
            f"Your 6-digit verification code is: {code}\n\n"
            f"This code will expire in 15 minutes.\n"
            f"If you did not request this, please ignore this email.\n\n"
            f"— The Helpotron Team"
        )
        html_content = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #4f46e5; text-align: center;">Helpotron Verification</h2>
            <p>Your 6-digit verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 15px; background: #f3f4f6; border-radius: 6px; margin: 20px 0;">
                {code}
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code will expire in <strong>15 minutes</strong>.</p>
            <p style="color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                If you did not request this code, no action is required.
            </p>
        </div>
        """
        return cls.send_email(to_email, subject, html_content, text_content)


class TwilioSMSService:
    """Sends SMS 2FA codes via Twilio API (or graceful mock when unconfigured)."""

    @staticmethod
    async def send_sms_async(to_phone: str, message: str) -> bool:
        account_sid = getattr(config, "twilio_account_sid", "") or os.getenv("TWILIO_ACCOUNT_SID", "")
        auth_token = getattr(config, "twilio_auth_token", "") or os.getenv("TWILIO_AUTH_TOKEN", "")
        api_key_sid = getattr(config, "twilio_api_key_sid", "") or os.getenv("TWILIO_API_KEY_SID", "") or os.getenv("TWILIO_SID", "")
        api_key_secret = getattr(config, "twilio_api_key_secret", "") or os.getenv("TWILIO_API_KEY_SECRET", "") or os.getenv("TWILIO_SECRET", "")
        msg_svc_sid = getattr(config, "twilio_messaging_service_sid", "") or os.getenv("TWILIO_MESSAGING_SERVICE_SID", "")
        from_phone = getattr(config, "twilio_phone_number", "") or os.getenv("TWILIO_PHONE_NUMBER", "+13187688667")

        auth_tuple = None
        if api_key_sid and api_key_secret:
            auth_tuple = (api_key_sid, api_key_secret)
        elif account_sid and auth_token:
            auth_tuple = (account_sid, auth_token)

        # Gracefully mock fictitious 555 test numbers or unconfigured auth
        if to_phone.startswith("+1555") or to_phone.startswith("555") or not auth_tuple:
            logger.info("[Mock SMS] To: %s | Message: %s", to_phone, message)
            return True

        acct_id = account_sid or api_key_sid
        url = f"https://api.twilio.com/2010-04-01/Accounts/{acct_id}/Messages.json"
        data: Dict[str, str] = {
            "To": to_phone,
            "Body": message,
        }
        if msg_svc_sid:
            data["MessagingServiceSid"] = msg_svc_sid
        elif from_phone:
            data["From"] = from_phone

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    url,
                    data=data,
                    auth=auth_tuple,
                )
                if resp.status_code in (200, 201):
                    logger.info("Successfully sent SMS 2FA to %s", to_phone)
                    return True
                logger.error("Twilio SMS failed with HTTP %d: %s", resp.status_code, resp.text)
                return False
        except Exception as e:
            logger.error("Failed sending SMS via Twilio: %s", e)
            return False

    @classmethod
    async def send_sms_code(cls, to_phone: str, code: str) -> bool:
        msg = f"Your Helpotron 2FA verification code is: {code}. Valid for 15 minutes."
        return await cls.send_sms_async(to_phone, msg)


class TOTPAuthenticatorService:
    """TOTP service for Authenticator Apps (Google Authenticator, Authy, etc.)."""

    @staticmethod
    def generate_secret() -> str:
        """Generates a random Base32 TOTP secret key."""
        return pyotp.random_base32()

    @staticmethod
    def get_provisioning_uri(secret: str, user_identifier: str, issuer: str = "Helpotron") -> str:
        """Generates the standard otpauth:// URI for QR code generation."""
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(name=user_identifier, issuer_name=issuer)

    @staticmethod
    def verify_code(secret: str, code: str) -> bool:
        """Verifies a 6-digit rotating TOTP code with a ±1 time step window tolerance."""
        if not secret or not code:
            return False
        try:
            totp = pyotp.TOTP(secret)
            return totp.verify(str(code).strip(), valid_window=1)
        except Exception as e:
            logger.error("TOTP verification error: %s", e)
            return False

    # Per-user used TOTP time-steps: (user_identifier, step) -> recorded_at.
    # Guards the login challenge against replay of an already-consumed code
    # (pyotp's verify is stateless — same code is valid for the whole window).
    _used_steps: Dict[Tuple[str, int], float] = {}

    @classmethod
    def verify_code_with_replay(cls, user_identifier: str, secret: str, code: str) -> bool:
        """RFC 6238 verify (30s step, ±1 window) + per-user step replay invalidation."""
        if not secret or not code:
            return False
        try:
            totp = pyotp.TOTP(secret)
            now_step = totp.timecode(datetime.datetime.now(datetime.timezone.utc))
            code = str(code).strip()
            for step in range(now_step - 1, now_step + 2):
                # pyotp's at() takes an epoch TIME, not a step counter — step * period
                if pyotp.utils.compare_digest(totp.at(step * 30), code):
                    key = (str(user_identifier), step)
                    if key in cls._used_steps:
                        return False  # replay: this code was already consumed
                    cls._used_steps[key] = time.time()
                    # prune steps outside the acceptance window
                    for k in [k for k in cls._used_steps if k[1] < now_step - 1]:
                        del cls._used_steps[k]
                    return True
            return False
        except Exception as e:
            logger.error("TOTP replay-aware verification error: %s", e)
            return False


email_service = EmailNotificationService()
sms_service = TwilioSMSService()
totp_service = TOTPAuthenticatorService()
