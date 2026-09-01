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

from .config import config
from .database import User, Payment, get_db
from .security import verify_password, hash_password, get_current_user
from .auth_2fa import code_store, email_service, sms_service, totp_service
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
    code: str = Field(..., min_length=6, max_length=12)


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
        raise HTTPException(500, "Failed sending verification email. Please check SMTP configuration.")
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
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db)
):
    """Initiates 2FA setup for TOTP, Email, or SMS."""
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
        target_email = payload.email or current_user.public_id
        code = code_store.generate_code(target_email, purpose="2fa_setup")
        await asyncio.to_thread(email_service.send_verification_code, target_email, code, purpose_label="2FA Setup")
        return {
            "status": "success",
            "method": "email",
            "message": f"6-digit 2FA setup code sent to {target_email}."
        }

    elif method == "sms":
        if not payload.phone_number:
            raise HTTPException(400, "Phone number is required for SMS 2FA setup.")
        try:
            e164 = _e164(payload.phone_number)
        except ValueError as e:
            raise HTTPException(400, str(e))
        code = code_store.generate_code(current_user.public_id, purpose="2fa_setup")
        await sms_service.send_sms_code(e164, code)
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
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db)
):
    """Verifies the initial code to confirm and activate 2FA on the user account."""
    method = payload.method.lower()

    if method == "totp":
        if not payload.secret:
            raise HTTPException(400, "TOTP secret is required for setup verification.")
        valid = totp_service.verify_code(payload.secret, payload.code)
        if not valid:
            raise HTTPException(400, "Invalid TOTP verification code.")
    else:
        valid, msg = code_store.verify_code(current_user.public_id, payload.code, purpose="2fa_setup")
        if not valid:
            raise HTTPException(400, msg)

    # Activate 2FA in user settings
    user = db.query(User).filter(User.public_id == current_user.public_id).first()
    if user:
        current_settings = dict(user.settings or {})
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
        user.settings = current_settings
        db.commit()

    return {"status": "success", "message": f"Two-Factor Authentication ({method.upper()}) is now active."}


# ─── 2FA Challenge & Verification Routes (Login Flow) ─────────────────────────

@router.post("/2fa/send-challenge")
async def send_two_factor_challenge(payload: TwoFactorChallengeRequest, db: Session = Depends(get_db)):
    """Sends a 2FA challenge code to the user via their configured method.

    08-31 (owner): login codes are 12-digit (not 6).
    """
    method = payload.method.lower()

    if method == "email":
        code = code_store.generate_code(payload.user_id, purpose="2fa_challenge", length=12)
        sent = await asyncio.to_thread(
            email_service.send_verification_code, payload.user_id, code, purpose_label="2FA Login"
        )
        if not sent:
            raise HTTPException(500, "Failed to send the 2FA email.")
        return {"status": "success", "message": "12-digit 2FA verification code sent to your email."}

    elif method == "sms":
        user = db.query(User).filter(User.public_id == payload.user_id).first()
        if not user:
            raise HTTPException(404, "User not found.")
        settings = user.settings or {}
        phone = settings.get("phone_number") or (settings.get("profile") or {}).get("phone")
        try:
            phone = _e164(phone) if phone else ""
        except ValueError:
            phone = ""
        if not phone:
            raise HTTPException(400, "No phone number found on account for SMS 2FA.")
        # SMS opt-out (08-31, owner): numbers that replied STOP are never
        # texted again — the user must reply START to re-subscribe.
        if (user.settings or {}).get("sms_opt_out"):
            raise HTTPException(
                400,
                "SMS messages are disabled for this number (you replied STOP). "
                "Reply START from that phone to re-enable, or use email/authenticator 2FA.",
            )
        code = code_store.generate_code(payload.user_id, purpose="2fa_challenge", length=12)
        sent = await sms_service.send_sms_code(phone, code)
        if not sent:
            raise HTTPException(500, "Failed to send the 2FA SMS — Twilio rejected the message.")
        return {"status": "success", "message": f"12-digit 2FA code sent via SMS to {phone}."}

    elif method == "totp":
        return {"status": "ready", "message": "Please enter the 6-digit code from your authenticator app."}

    else:
        raise HTTPException(400, f"Unsupported 2FA method: {method}")


@router.post("/2fa/verify-challenge")
async def verify_two_factor_challenge(payload: TwoFactorVerifyChallengeRequest, db: Session = Depends(get_db)):
    """Verifies a 2FA login challenge code."""
    method = payload.method.lower()

    if method == "totp":
        user = db.query(User).filter(User.public_id == payload.user_id).first()
        if not user:
            # never fall back to a server-wide secret (config default was a
            # well-known public example value) — a missing account is a 404
            raise HTTPException(404, "User not found.")
        secret = (user.settings or {}).get("2fa_totp_secret")
        valid = totp_service.verify_code_with_replay(user.id, secret, payload.code)
        if not valid:
            raise HTTPException(400, "Invalid 6-digit authenticator code.")
    else:
        valid, msg = code_store.verify_code(payload.user_id, payload.code, purpose="2fa_challenge")
        if not valid:
            raise HTTPException(400, msg)

    return {"status": "success", "message": "2FA authentication verified successfully."}


@router.post("/2fa/disable")
async def disable_two_factor(
    payload: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db)
):
    """Disables 2FA on the user's account."""
    user = current_user
    if not user:
        raise HTTPException(404, "User not found.")

    current_settings = dict(user.settings or {})
    if not current_settings.get("2fa_enabled"):
        raise HTTPException(400, "2FA is not enabled.")

    method = current_settings.get("2fa_method", "").lower()
    
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
        valid, msg = code_store.verify_code(user.public_id, payload.code, purpose="2fa_challenge")
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
        target = current_user.public_id
        code = code_store.generate_code(target, purpose="purchase_verification")
        sent = await asyncio.to_thread(email_service.send_verification_code, target, code, purpose_label="Purchase Authorization")
        if not sent:
            raise HTTPException(500, "Failed to send purchase verification email.")
        return {
            "status": "success",
            "method": "email",
            "destination": target,
            "message": f"6-digit purchase verification code sent to {target}.",
        }

    elif method == "sms":
        target = (current_user.settings or {}).get("phone_number")
        if not target:
            raise HTTPException(400, "No phone number found on account for SMS verification.")
        if (current_user.settings or {}).get("sms_opt_out"):
            raise HTTPException(400, "SMS messages are disabled for this number (you replied STOP). Reply START to re-enable.")
        code = code_store.generate_code(target, purpose="purchase_verification")
        sent = await sms_service.send_sms_code(target, code)
        if not sent:
            raise HTTPException(500, "Failed to send purchase verification SMS.")
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

    Requires the account auth token (TWILIO_AUTH_TOKEN). That key is NOT in
    .env today (the account uses API-key auth), so without it we cannot verify
    and accept anyway with a loud warning — anyone who spoofs From/Body could
    otherwise toggle opt-outs. Add TWILIO_AUTH_TOKEN to .env to enable strict
    verification.
    """
    token = getattr(config, "twilio_auth_token", "") or os.getenv("TWILIO_AUTH_TOKEN", "")
    if not token:
        logger_2fa.warning("SMS inbound: TWILIO_AUTH_TOKEN unset — Twilio signature NOT verified")
        return True
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
