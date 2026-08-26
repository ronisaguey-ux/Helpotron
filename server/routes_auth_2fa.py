"""FastAPI routes for User Verification & Two-Factor Authentication (2FA)."""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from .config import config
from .database import User, Payment, get_db
from .security import verify_password, hash_password, get_current_user
from .auth_2fa import code_store, email_service, sms_service, totp_service
from .routes_features import get_current_authenticated_user
import asyncio

router = APIRouter(prefix="/api/auth", tags=["auth_2fa"])


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class EmailVerificationRequest(BaseModel):
    email: EmailStr


class EmailVerificationConfirm(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


class TwoFactorSetupRequest(BaseModel):
    user_id: str
    method: str = Field(..., description="totp | email | sms")
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None


class TwoFactorVerifySetupRequest(BaseModel):
    user_id: str
    method: str = Field(..., description="totp | email | sms")
    code: str = Field(..., min_length=6, max_length=6)
    secret: Optional[str] = None  # for TOTP


class TwoFactorChallengeRequest(BaseModel):
    user_id: str
    method: str = Field(..., description="totp | email | sms")


class TwoFactorVerifyChallengeRequest(BaseModel):
    user_id: str
    method: str = Field(..., description="totp | email | sms")
    code: str = Field(..., min_length=6, max_length=6)


class TwoFactorDisableRequest(BaseModel):
    user_id: str
    code: str = Field(..., min_length=6, max_length=6)


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
async def send_email_verification(payload: EmailVerificationRequest):
    """Generates and sends a 6-digit email verification code (15-min TTL)."""
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
        code = code_store.generate_code(current_user.public_id, purpose="2fa_setup")
        await asyncio.to_thread(sms_service.send_sms_code, payload.phone_number, code)
        return {
            "status": "success",
            "method": "sms",
            "message": f"6-digit 2FA setup code sent to {payload.phone_number}."
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
        user.settings = current_settings
        db.commit()

    return {"status": "success", "message": f"Two-Factor Authentication ({method.upper()}) is now active."}


# ─── 2FA Challenge & Verification Routes (Login Flow) ─────────────────────────

@router.post("/2fa/send-challenge")
async def send_two_factor_challenge(payload: TwoFactorChallengeRequest, db: Session = Depends(get_db)):
    """Sends a 2FA challenge code to the user via their configured method."""
    method = payload.method.lower()

    if method == "email":
        code = code_store.generate_code(payload.user_id, purpose="2fa_challenge")
        await asyncio.to_thread(email_service.send_verification_code, payload.user_id, code, purpose_label="2FA Login")
        return {"status": "success", "message": "2FA verification code sent to your email."}

    elif method == "sms":
        user = db.query(User).filter(User.public_id == payload.user_id).first()
        phone = (user.settings or {}).get("phone_number") if user else None
        if not phone:
            raise HTTPException(400, "No phone number found on account for SMS 2FA.")
        code = code_store.generate_code(payload.user_id, purpose="2fa_challenge")
        await asyncio.to_thread(sms_service.send_sms_code, phone, code)
        return {"status": "success", "message": f"2FA code sent via SMS to {phone}."}

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
        code = code_store.generate_code(target, purpose="purchase_verification")
        sent = await asyncio.to_thread(sms_service.send_sms_code, target, code)
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
