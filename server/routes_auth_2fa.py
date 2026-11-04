"""FastAPI routes for User Verification & Two-Factor Authentication (2FA)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from starlette.responses import PlainTextResponse, Response

import time
from .config import config
from .database import User, Payment, get_db
from .security import verify_password, hash_password, get_current_user, require_session_auth
from .auth_2fa import code_store, email_service, sms_service, totp_service, SMSVerification
from .routes_features import get_current_authenticated_user
from .ratelimit import limiter
import asyncio

router = APIRouter(prefix="/api/auth", tags=["auth_2fa"])


def _e164(phone: str) -> str:
    """Normalize a US phone to E.164 for Twilio: '9547404058' → '+19547404058'.

    09-01 (Logan, live bug): raw 10-digit input was previously sent as-is and
    Twilio rejects it — every SMS 2FA attempt failed. Passes valid +1… through.
    """
    raw = (phone or "").strip()
    if not raw:
        raise ValueError("Phone number is required.")
    if raw.startswith("+"):
        digits = raw[1:]
        if not digits.isdigit() or len(digits) < 8:
            raise ValueError("Phone number is not valid.")
        return raw
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    raise ValueError("Phone number must be 10 digits (e.g. 9547404058) or E.164.")


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class EmailVerificationRequest(BaseModel):
    email: EmailStr


class EmailVerificationConfirm(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


# user_id is a legacy field — the routes authenticate via the session token and
# never read it. 09-01 (Logan, live bug): making it optional keeps old clients
# working while the Settings UI (which sends only method/phone_number/code)
# can actually complete setup — Pydantic was 422-rejecting every attempt.
class TwoFactorSetupRequest(BaseModel):
    user_id: Optional[str] = None
    method: str = Field(..., description="totp | email | sms")
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None


class TwoFactorVerifySetupRequest(BaseModel):
    user_id: Optional[str] = None
    method: str = Field(..., description="totp | email | sms")
    code: str = Field(..., min_length=6, max_length=6)
    secret: Optional[str] = None  # for TOTP
    # 09-01: SMS setup stores the verified number here so login challenges can
    # find it (settings["phone_number"]) — it was never persisted before.
    phone_number: Optional[str] = None


class TwoFactorChallengeRequest(BaseModel):
    user_id: str
    method: str = Field(..., description="totp | email | sms")


class TwoFactorVerifyChallengeRequest(BaseModel):
    user_id: str
    method: str = Field(..., description="totp | email | sms")
    # 08-31 (owner): login codes are 12 digits; max_length 6→12 here and in the
    # disable request so a 12-digit challenge can actually be submitted.
    code: str = Field(..., min_length=6, max_length=12)


class TwoFactorDisableRequest(BaseModel):
    user_id: Optional[str] = None  # legacy — route uses the authenticated user
    # 2026-09-18: optional at the schema level so the broken-enrollment escape
    # hatch below is reachable. A required field meant FastAPI rejected the
    # request with 422 BEFORE the handler ran, so an account whose 2FA has no
    # usable factor could never repair itself. The handler still requires a code
    # whenever there IS a factor to verify.
    code: Optional[str] = Field(None, min_length=6, max_length=12)


class PurchaseChallengeRequest(BaseModel):
    public_id: str
    method: str = Field(..., description="email | sms")
    destination: Optional[str] = None


class PurchaseVerifyRequest(BaseModel):
    public_id: str
    password: str
    method: str = Field(..., description="email | sms")
    code: str = Field(..., min_length=6, max_length=6)
    destination: Optional[str] = None
    plan: str
    amount_cents: Optional[int] = 0
    discount_credits_used: Optional[float] = 0.0


# ─── Verification Routes ──────────────────────────────────────────────────────

@router.post("/send-email-verification")
async def send_email_verification(payload: EmailVerificationRequest, request: Request):
    """Generates and sends a 6-digit email verification code (15-min TTL)."""
    # Unauthenticated by design (you verify before you have a session), so it is
    # throttled per source address *and* per target inbox — otherwise it is an
    # open relay that mails arbitrary strangers on demand.
    client = request.client.host if request.client else "unknown"
    target = (payload.email or "").lower().strip()[:200]
    for key in (f"email_verify_ip:{client}", f"email_verify_to:{target}"):
        if not limiter.allow(key, 3, window=900.0):
            raise HTTPException(429, "Too many verification emails requested. Please wait 15 minutes.")
    code = code_store.generate_code(payload.email, purpose="email_verification")
    sent = await asyncio.to_thread(email_service.send_verification_code, payload.email, code, purpose_label="Email Verification")
    if not sent:
        # 503, not 500: email is genuinely unavailable when SMTP is unconfigured,
        # and the caller must be told that rather than shown a code-entry screen
        # for a message that was never sent (owner 2026-09-19).
        raise HTTPException(
            503,
            "Email delivery is not configured on this deployment, so a verification "
            "email cannot be sent right now.",
        )
    return {"status": "success", "message": "Verification code sent to your email (expires in 15 minutes)."}


@router.post("/verify-email")
async def verify_email_code(payload: EmailVerificationConfirm, db: Session = Depends(get_db)):
    """Verifies the 6-digit code and marks user email as verified."""
    valid, msg = code_store.verify_code(payload.email, payload.code, purpose="email_verification")
    if not valid:
        raise HTTPException(400, msg)

    # If user exists in DB, update their email_verified status in settings
    user = db.query(User).filter(User.public_id == payload.email).first()
    if user:
        current_settings = dict(user.settings or {})
        current_settings["email_verified"] = True
        user.settings = current_settings
        db.commit()

    return {"status": "success", "message": "Email successfully verified."}


# ─── 2FA Setup Routes ─────────────────────────────────────────────────────────

@router.post("/2fa/setup")
async def setup_two_factor(
    payload: TwoFactorSetupRequest,
    request: Request,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db)
):
    """Initiates 2FA setup for TOTP, Email, or SMS."""
    require_session_auth(request)
    if not config.enable_2fa:
        raise HTTPException(400, "2FA is currently disabled globally by administrator.")

    method = payload.method.lower()

    if method == "totp":
        secret = totp_service.generate_secret()
        qr_uri = totp_service.get_provisioning_uri(secret, current_user.public_id)
        return {
            "status": "success",
            "method": "totp",
            "secret": secret,
            "qr_uri": qr_uri,
            "message": "Scan the QR code in your Authenticator app and submit the 6-digit code to confirm."
        }

    elif method == "email":
        # Owner 2026-09-19: *"it just 'sends' the code to your email/phone
        # without actually asking u to put in ur email/phone, its bogus"*.
        #
        # It was. This branch used `payload.email or current_user.public_id` —
        # and `public_id` is a USERNAME ("RoniDev"), not an address, while the
        # User model has no email column at all. So the "code" went to a string
        # that is not an address, the endpoint returned
        # "sent to RoniDev", and the user was told an email had gone out.
        #
        # A 2FA factor must have a REAL destination, so: take the address the
        # user just typed, or one already saved from a previous setup, and
        # refuse to proceed without one. Never invent an address.
        settings_now = dict(current_user.settings or {})
        stored_email = (
            (settings_now.get("profile") or {}).get("email")
            or settings_now.get("email")
        )
        target_email = (payload.email or stored_email or "").strip()
        if not target_email:
            raise HTTPException(
                400,
                "Enter the email address you want your 2FA codes sent to.",
            )
        if "@" not in target_email or "." not in target_email.split("@")[-1]:
            raise HTTPException(400, "That does not look like an email address.")
        code = code_store.generate_code(target_email, purpose="2fa_setup")
        sent = await asyncio.to_thread(
            email_service.send_verification_code, target_email, code, purpose_label="2FA Setup"
        )
        if not sent:
            # Do not claim a send that did not happen — the caller only reaches
            # the code-entry screen on a real delivery.
            raise HTTPException(502, "The code could not be emailed right now — try again in a moment.")
        return {
            "status": "success",
            "method": "email",
            "target": target_email,
            "message": f"Code sent to {target_email}.",
        }

    elif method == "sms":
        if not payload.phone_number:
            raise HTTPException(400, "Phone number is required for SMS 2FA setup.")
        try:
            e164 = _e164(payload.phone_number)
        except ValueError as e:
            raise HTTPException(400, str(e))
        # Twilio Verify owns the code when it is configured (no A2P campaign
        # needed); otherwise a local code is generated and stored by phone.
        if not await SMSVerification.send(e164):
            raise HTTPException(500, "Failed to send the 2FA setup SMS.")
        return {
            "status": "success",
            "method": "sms",
            "message": f"6-digit 2FA setup code sent to {e164}."
        }

    else:
        raise HTTPException(400, f"Unsupported 2FA method: {method}. Choose totp, email, or sms.")


@router.post("/2fa/verify-setup")
async def verify_two_factor_setup(
    payload: TwoFactorVerifySetupRequest,
    request: Request,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db)
):
    """Verifies the initial code to confirm and activate 2FA on the user account."""
    require_session_auth(request)
    method = payload.method.lower()

    # 2026-09-18: an unrecognised method used to fall through to the final `else`
    # branch, which verified a generic code_store code and then activated 2FA
    # WITHOUT storing any factor. `method: str` has no enum, so `""` (or any
    # typo) reached it. The account was left with 2fa_enabled=True and nothing to
    # verify against — a permanent lockout, since login and this file's disable
    # route both require a valid code. Reject unknown methods up front.
    if method not in ("totp", "email", "sms"):
        raise HTTPException(400, f"Unsupported 2FA method: {method or '(empty)'}. Choose totp, email, or sms.")

    if method == "totp":
        if not payload.secret:
            raise HTTPException(400, "TOTP secret is required for setup verification.")
        valid = totp_service.verify_code(payload.secret, payload.code)
        if not valid:
            raise HTTPException(400, "Invalid TOTP verification code.")
    elif method == "sms":
        # Resolved BEFORE the check: Twilio Verify (and the local fallback) are
        # keyed on the phone number, not the public_id.
        raw_phone = payload.phone_number or (current_user.settings or {}).get("phone_number") or ""
        try:
            e164 = _e164(raw_phone)
        except ValueError as e:
            raise HTTPException(400, f"SMS 2FA needs a valid phone number: {e}")
        valid, msg = await SMSVerification.check(e164, payload.code)
        if not valid:
            raise HTTPException(400, msg)
    else:
        valid, msg = code_store.verify_code(current_user.public_id, payload.code, purpose="2fa_setup")
        if not valid:
            raise HTTPException(400, msg)

    # Activate 2FA in user settings
    user = db.query(User).filter(User.public_id == current_user.public_id).first()
    if user:
        current_settings = dict(user.settings or {})
        # 2026-09-18: never set the flag without a verifiable factor. The old code
        # set `2fa_enabled = True` unconditionally and only stored the TOTP secret
        # `if method == "totp" and payload.secret`, so any path that reached here
        # without a secret produced an account that could never log in again.
        if method == "totp" and not payload.secret:
            raise HTTPException(400, "TOTP secret is required for setup verification.")
        if method == "sms" and not (
            payload.phone_number or current_settings.get("phone_number")
        ):
            raise HTTPException(400, "A phone number is required for SMS 2FA.")
        current_settings["2fa_enabled"] = True
        current_settings["2fa_method"] = method
        if method == "totp" and payload.secret:
            current_settings["2fa_totp_secret"] = payload.secret
        if method == "sms":
            # Persist the verified number (normalized) — login challenges read
            # settings["phone_number"]; before 09-01 nothing wrote it.
            raw_phone = payload.phone_number or current_settings.get("phone_number") or ""
            try:
                current_settings["phone_number"] = _e164(raw_phone)
            except ValueError as e:
                raise HTTPException(400, f"SMS 2FA needs a valid phone number: {e}")
        if method == "email":
            # Owner 2026-09-19: the email was never persisted, so login
            # challenges fell through to a fabricated "<public_id>@helpotron.app"
            # address. Store the verified address the same way the phone is
            # stored, in the location the login path already reads.
            raw_email = (payload.email or "").strip() or (
                (current_settings.get("profile") or {}).get("email") or ""
            ).strip()
            if not raw_email or "@" not in raw_email:
                raise HTTPException(400, "A valid email address is required for email 2FA.")
            prof = dict(current_settings.get("profile") or {})
            prof["email"] = raw_email
            current_settings["profile"] = prof
            current_settings["email"] = raw_email
        user.settings = current_settings
        db.commit()

    return {"status": "success", "message": f"Two-Factor Authentication ({method.upper()}) is now active."}


# ─── 2FA Challenge & Verification Routes (Login Flow) ─────────────────────────

_VERIFY_CHALLENGE_ATTEMPTS: dict[str, list[float]] = {}


def _check_verify_challenge_rate_limit(user_id: str) -> None:
    now = time.time()
    attempts = _VERIFY_CHALLENGE_ATTEMPTS.get(user_id, [])
    attempts = [t for t in attempts if now - t < 300.0]
    if len(attempts) >= 5:
        _VERIFY_CHALLENGE_ATTEMPTS[user_id] = attempts
        raise HTTPException(429, "Too many failed 2FA verification attempts. Try again later.")
    _VERIFY_CHALLENGE_ATTEMPTS[user_id] = attempts


def _record_verify_challenge_failure(user_id: str) -> None:
    now = time.time()
    attempts = _VERIFY_CHALLENGE_ATTEMPTS.get(user_id, [])
    attempts = [t for t in attempts if now - t < 300.0]
    attempts.append(now)
    _VERIFY_CHALLENGE_ATTEMPTS[user_id] = attempts


@router.post("/2fa/send-challenge")
async def send_two_factor_challenge(
    payload: TwoFactorChallengeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Sends a 2FA challenge code to the user via their configured method.
    Mitigates user enumeration and message generator abuse (AUTH-02).

    2026-11-04 (audit-v5 A2): the enumeration mitigation was here but the
    message-generator mitigation was not. This route is in the middleware's
    unauthenticated allowlist (it runs BEFORE a session exists), so anyone could
    post a known public_id and make the server send SMS/email over and over —
    bounded only by the 400/min per-IP flood stop. Login sends the same codes
    behind a verified password and its own per-account throttle; this sibling
    path was strictly cheaper to abuse. A per-account budget now applies, and a
    throttled request answers with the SAME uniform message as a successful one
    so the budget itself does not become an account-existence oracle.
    """
    method = payload.method.lower()
    # Unauthenticated by design (it runs before a session exists) and it makes
    # the server send an email or a billable SMS, so it needs the same per-source
    # and per-target throttle send-email-verification already has. Without it a
    # known public_id could be made to receive unlimited messages.
    client = request.client.host if request.client else "unknown"
    for throttle_key in (
        f"2fa_challenge_ip:{client}",
        f"2fa_challenge_to:{(payload.user_id or '').lower()[:120]}:{method}",
    ):
        if not limiter.allow(throttle_key, 3, window=900.0):
            raise HTTPException(429, "Too many 2FA codes requested. Please wait 15 minutes.")
    user = db.query(User).filter(User.public_id == payload.user_id).first()

    # Keyed on the CLAIMED id (not on a resolved user) so the throttle behaves
    # identically for existing and non-existent accounts, and is spent even when
    # there is nothing to send.
    if not limiter.allow(f"2fa_send:{payload.user_id.strip().lower()}", 5, window=900.0):
        if method == "email":
            return {"status": "success", "message": "12-digit 2FA verification code sent to your email."}
        if method == "sms":
            return {"status": "success", "message": "If a mobile phone is linked to this account, a 2FA code has been sent via SMS."}
        if method == "totp":
            return {"status": "ready", "message": "Please enter the 6-digit code from your authenticator app."}

    if method == "email":
        # Always return uniform generic response without leaking existence
        if not user:
            return {"status": "success", "message": "12-digit 2FA verification code sent to your email."}
        settings = user.settings or {}
        target_email = settings.get("email") or getattr(user, "email", None) or (settings.get("profile") or {}).get("email")
        if target_email and "@" in str(target_email):
            code = code_store.generate_code(payload.user_id, purpose="2fa_challenge", length=12)
            await asyncio.to_thread(
                email_service.send_verification_code, str(target_email), code, purpose_label="2FA Login"
            )
        return {"status": "success", "message": "12-digit 2FA verification code sent to your email."}

    elif method == "sms":
        if not user:
            return {"status": "success", "message": "If a mobile phone is linked to this account, a 2FA code has been sent via SMS."}
        settings = user.settings or {}
        phone = settings.get("phone_number") or (settings.get("profile") or {}).get("phone")
        try:
            phone = _e164(phone) if phone else ""
        except ValueError:
            phone = ""
        if not phone or settings.get("sms_opt_out"):
            return {"status": "success", "message": "If a mobile phone is linked to this account, a 2FA code has been sent via SMS."}
        sent = await SMSVerification.send(phone)
        if not sent:
            raise HTTPException(500, "Failed to send the 2FA SMS — Twilio rejected the message.")
        return {"status": "success", "message": "If a mobile phone is linked to this account, a 2FA code has been sent via SMS."}

    elif method == "totp":
        return {"status": "ready", "message": "Please enter the 6-digit code from your authenticator app."}

    else:
        raise HTTPException(400, f"Unsupported 2FA method: {method}")


@router.post("/2fa/verify-challenge")
async def verify_two_factor_challenge(payload: TwoFactorVerifyChallengeRequest, db: Session = Depends(get_db)):
    """Verifies a 2FA login challenge code."""
    _check_verify_challenge_rate_limit(payload.user_id)
    method = payload.method.lower()

    if method == "totp":
        user = db.query(User).filter(User.public_id == payload.user_id).first()
        if not user:
            _record_verify_challenge_failure(payload.user_id)
            raise HTTPException(400, "Invalid 6-digit authenticator code.")
        secret = (user.settings or {}).get("2fa_totp_secret")
        if not secret:
            _record_verify_challenge_failure(payload.user_id)
            raise HTTPException(400, "Invalid 6-digit authenticator code.")
        # AUTH-06: Use verify_code instead of verify_code_with_replay so valid step is not burned away from login
        valid = totp_service.verify_code(secret, payload.code)
        if not valid:
            _record_verify_challenge_failure(payload.user_id)
            raise HTTPException(400, "Invalid 6-digit authenticator code.")
    elif method == "sms":
        user = db.query(User).filter(User.public_id == payload.user_id).first()
        if not user:
            _record_verify_challenge_failure(payload.user_id)
            raise HTTPException(400, "Invalid 2FA verification code.")
        settings = user.settings or {}
        raw_phone = settings.get("phone_number") or (settings.get("profile") or {}).get("phone") or ""
        try:
            phone = _e164(raw_phone)
        except ValueError:
            phone = ""
        valid, msg = await SMSVerification.check(phone, payload.code)
        if not valid:
            _record_verify_challenge_failure(payload.user_id)
            raise HTTPException(400, msg)
    else:
        valid, msg = code_store.verify_code(payload.user_id, payload.code, purpose="2fa_challenge")
        if not valid:
            _record_verify_challenge_failure(payload.user_id)
            raise HTTPException(400, msg)

    _VERIFY_CHALLENGE_ATTEMPTS.pop(payload.user_id, None)
    return {"status": "success", "message": "2FA authentication verified successfully."}


@router.post("/2fa/disable")
async def disable_two_factor(
    payload: TwoFactorDisableRequest,
    request: Request,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db)
):
    """Disables 2FA on the user's account."""
    require_session_auth(request)
    user = current_user
    if not user:
        raise HTTPException(404, "User not found.")

    current_settings = dict(user.settings or {})
    if not current_settings.get("2fa_enabled"):
        raise HTTPException(400, "2FA is not enabled.")

    method = current_settings.get("2fa_method", "").lower()

    # 2026-09-18: escape hatch for an account already stuck by the enrollment bug
    # below — `2fa_enabled` set with no usable factor. Requiring a valid code from
    # such an account is a dead end: no value can verify, so the user could neither
    # log in nor turn 2FA off, and only a DB edit could free them. Disabling an
    # unusable second factor removes no protection, because there is none.
    _factor_available = (
        (method == "totp" and bool(current_settings.get("2fa_totp_secret")))
        or (method == "sms" and bool(current_settings.get("phone_number")))
        or method == "email"
    )
    if not _factor_available:
        logger_2fa.warning(
            "2FA disable without a usable factor for %s (method=%r) — repairing a broken enrollment",
            user.public_id, method,
        )
        current_settings["2fa_enabled"] = False
        current_settings.pop("2fa_method", None)
        current_settings.pop("2fa_totp_secret", None)
        user.settings = current_settings
        db.commit()
        return {"status": "success", "message": "Two-Factor Authentication disabled (no usable factor was configured)."}

    # A factor exists, so a real code is required (the schema now makes it optional
    # only to keep the repair branch above reachable).
    if not payload.code:
        raise HTTPException(400, "A 2FA code is required to disable two-factor authentication.")

    if method == "totp":
        secret = current_settings.get("2fa_totp_secret")
        if not secret:
            raise HTTPException(400, "TOTP secret missing.")
        if not totp_service.verify_code(secret, payload.code):
            raise HTTPException(400, "Invalid 2FA code.")
    elif method == "email":
        target = user.public_id
        valid, msg = code_store.verify_code(target, payload.code, purpose="2fa_challenge")
        if not valid:
            raise HTTPException(400, "Invalid 2FA code.")
    elif method == "sms":
        target = current_settings.get("phone_number")
        if not target:
            raise HTTPException(400, "Phone number missing.")
        valid, _msg = await SMSVerification.check(_e164(target), payload.code)
        if not valid:
            raise HTTPException(400, "Invalid 2FA code.")
    else:
        raise HTTPException(400, "Unknown 2FA method.")

    current_settings["2fa_enabled"] = False
    current_settings.pop("2fa_method", None)
    current_settings.pop("2fa_totp_secret", None)
    user.settings = current_settings
    db.commit()

    return {"status": "success", "message": "Two-Factor Authentication has been disabled."}


# ─── Mandatory 2FA Purchase Authentication Routes ─────────────────────────────

@router.post("/2fa/purchase-challenge")
async def send_purchase_challenge(
    payload: PurchaseChallengeRequest,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db)
):
    """Sends a mandatory 6-digit 2FA purchase verification code via Email or SMS."""
    method = payload.method.lower()

    if method == "email":
        # The code STORE is keyed by public_id (purchase-verify reads the same
        # key), but the code is DELIVERED to the account's real address. Those
        # two were conflated: the send went to `current_user.public_id`, so with
        # SMTP configured the mail was addressed to e.g. "RoniDev" and the SMTP
        # server rejected it, and the caller was then told "Email delivery is not
        # configured on this deployment" — a false cause for a failure that was
        # this endpoint's own. The email lane of mandatory purchase 2FA could
        # never deliver a code.
        target = current_user.public_id
        settings = current_user.settings or {}
        to_email = str(
            (settings.get("profile") or {}).get("email")
            or settings.get("email")
            or ""
        ).strip()
        if "@" not in to_email:
            raise HTTPException(
                400,
                "This account has no email address stored, so a purchase verification "
                "email cannot be sent. Add one in Account → Settings, or use SMS.",
            )
        code = code_store.generate_code(target, purpose="purchase_verification")
        sent = await asyncio.to_thread(email_service.send_verification_code, to_email, code, purpose_label="Purchase Authorization")
        if not sent:
            # Same honesty rule as the other email paths: unavailable is 503 and
            # says why, rather than a 500 that reads like a transient failure.
            raise HTTPException(
                503,
                "Email delivery is not configured on this deployment, so a purchase "
                "verification email cannot be sent. Use SMS or your authenticator app.",
            )
        local, _, domain = to_email.partition("@")
        shown = f"{local[:1]}***@{domain}" if domain else "***"
        return {
            "status": "success",
            "method": "email",
            "destination": shown,
            "message": f"6-digit purchase verification code sent to {shown}.",
        }

    elif method == "sms":
        target = (current_user.settings or {}).get("phone_number")
        if not target:
            raise HTTPException(400, "No phone number found on account for SMS verification.")
        if (current_user.settings or {}).get("sms_opt_out"):
            raise HTTPException(400, "SMS messages are disabled for this number (you replied STOP). Reply START to re-enable.")
        sent = await SMSVerification.send(target)
        if not sent:
            # 502, not 500, and with the next step spelled out: the SMS provider
            # rejected or did not accept the message, so retrying identically is
            # pointless — the user has another lane (authenticator app) available.
            raise HTTPException(
                502,
                "The purchase verification SMS could not be sent right now. Try again in "
                "a minute, or use your authenticator app to authorise this purchase.",
            )
        return {
            "status": "success",
            "method": "sms",
            "destination": target,
            "message": f"6-digit purchase verification code sent via SMS to {target}.",
        }

    else:
        raise HTTPException(400, f"Unsupported purchase 2FA method: {method}. Must be 'email' or 'sms'.")


@router.post("/2fa/purchase-verify")
async def verify_purchase_challenge(
    payload: PurchaseVerifyRequest,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db)
):
    """Validates account password + 6-digit Email/SMS 2FA code."""
    method = payload.method.lower()

    if not payload.password or not payload.password.strip():
        raise HTTPException(400, "Account password is required for purchase authorization.")

    user = current_user
    if not user:
        raise HTTPException(404, "User not found. Create an account first.")

    # Verify password if user has password set
    if user.password_hash and user.password_salt:
        if not verify_password(payload.password, user.password_hash, user.password_salt):
            raise HTTPException(401, "Invalid account password.")
    else:
        # Set initial password for user
        h, s = hash_password(payload.password)
        user.password_hash = h
        user.password_salt = s

    # Verify 6-digit 2FA code
    if method == "email":
        target = user.public_id
    elif method == "sms":
        target = (user.settings or {}).get("phone_number")
        if not target:
            raise HTTPException(400, "No phone number found on account for SMS verification.")
    else:
        raise HTTPException(400, "Unsupported purchase 2FA method.")

    if method == "sms":
        # SMS goes through the provider pair (Verify owns the code when
        # configured); email keeps the local code store.
        valid, msg = await SMSVerification.check(target, payload.code)
    else:
        valid, msg = code_store.verify_code(target, payload.code, purpose="purchase_verification")
    if not valid:
        raise HTTPException(400, msg)

    db.commit()

    return {
        "status": "success",
        "verified": True,
        "message": "✅ 2FA Verification successful!",
    }


# ── Remediation BATCH-04: TOTP verify for the authenticated user ────────────
@router.post("/2fa/verify-totp")
def verify_totp_code(
    code: str,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Verifies an authenticator-app TOTP code against the signed-in user's secret."""
    settings = dict(current_user.settings or {})
    secret = settings.get("2fa_totp_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="TOTP is not set up for this account.")
    if not totp_service.verify_code(secret, code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code.")
    return {"status": "success", "message": "TOTP code verified."}


# ─── Inbound SMS compliance (STOP/START/HELP) ─────────────────────────────────
# 08-31 (owner): Twilio bans accounts that ignore TCPA/A2P opt-outs, so inbound
# messages must be handled. Twilio auto-enforces STOP at the platform level for
# well-configured senders; this handler ALSO records the opt-out in our DB so
# our own code never texts an opted-out number (defense in depth) and replies
# with the required confirmation.

STOP_WORDS = frozenset({"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "STOPP"})
START_WORDS = frozenset({"START", "YES", "UNSTOP", "STARTALL"})
HELP_WORDS = frozenset({"HELP", "INFO", "SUPPORT", "?"})

STOP_REPLY = (
    "Helpotron: You have been unsubscribed from SMS messages. "
    "No more texts will be sent. Reply START to subscribe again."
)
START_REPLY = (
    "Helpotron: You have been re-subscribed to SMS messages. "
    "Reply STOP to unsubscribe at any time."
)
HELP_REPLY = (
    "Helpotron support: you get text messages only when a 2FA login code is "
    "requested. Reply STOP to unsubscribe. Msg & data rates may apply."
)

logger_2fa = logging.getLogger("helpotron.routes_auth_2fa")


def _verify_twilio_signature(request_url: str, form_params: Dict[str, str], signature: str) -> bool:
    """Tightly verified per Twilio docs: HMAC-SHA1 over (full URL + all form
    params sorted by key), base64, compared against X-Twilio-Signature.

    ★ FAILS CLOSED. It used to return True when TWILIO_AUTH_TOKEN was unset, which turned an
    unverifiable request into a trusted one: anyone who knew a target's phone number could POST
    ``Body=STOP`` to /sms/inbound and flip ``sms_opt_out`` on that account, blocking their 2FA.

    Twilio signs inbound webhooks with the account AUTH TOKEN, so an install configured with
    only the API key pair (as this one is — TWILIO_AUTH_TOKEN is genuinely unset) genuinely
    cannot verify them. The honest response to "I cannot verify this" is to refuse it.

    An install that needs the inbound webhook to run unverified can say so explicitly:

        TWILIO_ALLOW_UNVERIFIED_INBOUND=1

    That is deliberately a separate, loud, opt-in switch rather than a silent fallback, so the
    insecure state is always a decision rather than an accident.
    """
    token = getattr(config, "twilio_auth_token", "") or os.getenv("TWILIO_AUTH_TOKEN", "")
    if not token:
        if os.getenv("TWILIO_ALLOW_UNVERIFIED_INBOUND", "").lower() in ("1", "true", "yes", "on"):
            logger_2fa.error(
                "SMS inbound: TWILIO_AUTH_TOKEN unset and TWILIO_ALLOW_UNVERIFIED_INBOUND is on "
                "— accepting an UNVERIFIED opt-out request. Anyone can flip this account's SMS "
                "opt-out. Set TWILIO_AUTH_TOKEN to close this."
            )
            return True
        logger_2fa.error(
            "SMS inbound REJECTED: TWILIO_AUTH_TOKEN is unset, so the Twilio signature cannot be "
            "verified. Add it to .env to accept inbound SMS opt-outs (set "
            "TWILIO_ALLOW_UNVERIFIED_INBOUND=1 to accept them unverified instead)."
        )
        return False
    payload = request_url + "".join(f"{k}{v}" for k, v in sorted(form_params.items()))
    expected = base64.b64encode(
        hmac.new(token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).digest()
    )
    return hmac.compare_digest(expected, (signature or "").encode("utf-8"))


def _users_with_phone(db: Session, phone: str):
    """All accounts whose settings.phone_number matches (E.164 as Twilio sends)."""
    from sqlalchemy import func

    try:
        return (
            db.query(User)
            .filter(func.json_extract(User.settings, "$.phone_number") == phone)
            .all()
        )
    except Exception:  # noqa: BLE001 — old SQLite without JSON1: fall back to full scan
        return [u for u in db.query(User).all() if (u.settings or {}).get("phone_number") == phone]


@router.post("/sms/inbound")
async def sms_inbound(request: Request, db: Session = Depends(get_db)):
    """Twilio inbound webhook: honors SMS opt-out commands.

    Twilio POSTs form-encoded From/To/Body. The reply body (plain text) is what
    Twilio sends back to the user; <Response/> means no reply.
    """
    form = await request.form()
    params: Dict[str, str] = {str(k): str(v) for k, v in form.multi_items()}

    signature = request.headers.get("x-twilio-signature", "")
    if str(request.url).startswith("http://127.0.0.1"):
        # Behind the vite preview proxy the signed URL is the public one; Twilio
        # signs exactly the URL it posts to (helpotron.dpdns.org), so verify
        # against that canonical form when the request arrived via localhost.
        signed_url = "https://helpotron.dpdns.org" + request.url.path
        if request.url.query:
            signed_url += "?" + request.url.query
    else:
        signed_url = str(request.url)
    if not _verify_twilio_signature(signed_url, params, signature):
        raise HTTPException(401, "Invalid Twilio signature")

    body = (params.get("Body") or "").strip().upper().rstrip(".")
    from_num = params.get("From") or ""
    if not from_num:
        return Response(content="<Response/>", media_type="application/xml")

    reply = None
    if body in STOP_WORDS:
        users = _users_with_phone(db, from_num)
        changed = 0
        for u in users:
            s = dict(u.settings or {})
            if not s.get("sms_opt_out"):
                s["sms_opt_out"] = True
                u.settings = s
                changed += 1
        db.commit()
        logger_2fa.info("SMS opt-out: %s (%d accounts flagged)", from_num, changed)
        reply = STOP_REPLY
    elif body in START_WORDS:
        users = _users_with_phone(db, from_num)
        changed = 0
        for u in users:
            s = dict(u.settings or {})
            if s.get("sms_opt_out"):
                s.pop("sms_opt_out", None)
                s["sms_opt_out"] = False
                u.settings = s
                changed += 1
        db.commit()
        logger_2fa.info("SMS re-subscribe: %s (%d accounts cleared)", from_num, changed)
        reply = START_REPLY
    elif body in HELP_WORDS:
        reply = HELP_REPLY

    if reply is None:
        return Response(content="<Response/>", media_type="application/xml")

    sent = await sms_service.send_sms_async(from_num, reply)
    if not sent:
        logger_2fa.error("Failed to send SMS compliance reply to %s", from_num)
    return PlainTextResponse(reply)
