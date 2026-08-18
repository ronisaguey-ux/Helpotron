"""FastAPI routes for User Verification & Two-Factor Authentication (2FA)."""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from .config import config
from .database import User, Payment, get_db
from .security import verify_password, hash_password
from .auth_2fa import code_store, email_service, sms_service, totp_service

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
    sent = email_service.send_verification_code(payload.email, code, purpose_label="Email Verification")
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
async def setup_two_factor(payload: TwoFactorSetupRequest, db: Session = Depends(get_db)):
    """Initiates 2FA setup for TOTP, Email, or SMS."""
    if not config.enable_2fa:
        raise HTTPException(400, "2FA is currently disabled globally by administrator.")

    method = payload.method.lower()

    if method == "totp":
        secret = totp_service.generate_secret()
        qr_uri = totp_service.get_provisioning_uri(secret, payload.user_id)
        return {
            "status": "success",
            "method": "totp",
            "secret": secret,
            "qr_uri": qr_uri,
            "message": "Scan the QR code in your Authenticator app and submit the 6-digit code to confirm."
        }

    elif method == "email":
        target_email = payload.email or payload.user_id
        code = code_store.generate_code(target_email, purpose="2fa_setup")
        email_service.send_verification_code(target_email, code, purpose_label="2FA Setup")
        return {
            "status": "success",
            "method": "email",
            "message": f"6-digit 2FA setup code sent to {target_email}."
        }

    elif method == "sms":
        if not payload.phone_number:
            raise HTTPException(400, "Phone number is required for SMS 2FA setup.")
        code = code_store.generate_code(payload.user_id, purpose="2fa_setup")
        await sms_service.send_sms_code(payload.phone_number, code)
        return {
            "status": "success",
            "method": "sms",
            "message": f"6-digit 2FA setup code sent to {payload.phone_number}."
        }

    else:
        raise HTTPException(400, f"Unsupported 2FA method: {method}. Choose totp, email, or sms.")


@router.post("/2fa/verify-setup")
async def verify_two_factor_setup(payload: TwoFactorVerifySetupRequest, db: Session = Depends(get_db)):
    """Verifies the initial code to confirm and activate 2FA on the user account."""
    method = payload.method.lower()

    if method == "totp":
        if not payload.secret:
            raise HTTPException(400, "TOTP secret is required for setup verification.")
        valid = totp_service.verify_code(payload.secret, payload.code)
        if not valid:
            raise HTTPException(400, "Invalid TOTP verification code.")
    else:
        valid, msg = code_store.verify_code(payload.user_id, payload.code, purpose="2fa_setup")
        if not valid:
            raise HTTPException(400, msg)

    # Activate 2FA in user settings
    user = db.query(User).filter(User.public_id == payload.user_id).first()
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
        email_service.send_verification_code(payload.user_id, code, purpose_label="2FA Login")
        return {"status": "success", "message": "2FA verification code sent to your email."}

    elif method == "sms":
        user = db.query(User).filter(User.public_id == payload.user_id).first()
        phone = (user.settings or {}).get("phone_number") if user else None
        if not phone:
            raise HTTPException(400, "No phone number found on account for SMS 2FA.")
        code = code_store.generate_code(payload.user_id, purpose="2fa_challenge")
        await sms_service.send_sms_code(phone, code)
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
        secret = (user.settings or {}).get("2fa_totp_secret") if user else config.totp_secret
        valid = totp_service.verify_code(secret, payload.code)
        if not valid:
            raise HTTPException(400, "Invalid 6-digit authenticator code.")
    else:
        valid, msg = code_store.verify_code(payload.user_id, payload.code, purpose="2fa_challenge")
        if not valid:
            raise HTTPException(400, msg)

    return {"status": "success", "message": "2FA authentication verified successfully."}


@router.post("/2fa/disable")
async def disable_two_factor(payload: TwoFactorDisableRequest, db: Session = Depends(get_db)):
    """Disables 2FA on the user's account."""
    user = db.query(User).filter(User.public_id == payload.user_id).first()
    if not user:
        raise HTTPException(404, "User not found.")

    current_settings = dict(user.settings or {})
    current_settings["2fa_enabled"] = False
    current_settings.pop("2fa_method", None)
    current_settings.pop("2fa_totp_secret", None)
    user.settings = current_settings
    db.commit()

    return {"status": "success", "message": "Two-Factor Authentication has been disabled."}


# ─── Mandatory 2FA Purchase Authentication Routes ─────────────────────────────

@router.post("/2fa/purchase-challenge")
async def send_purchase_challenge(payload: PurchaseChallengeRequest, db: Session = Depends(get_db)):
    """Sends a mandatory 6-digit 2FA purchase verification code via Email or SMS."""
    method = payload.method.lower()
    target = payload.destination or payload.public_id

    if not target or not target.strip():
        raise HTTPException(400, "Destination email or phone number is required.")

    code = code_store.generate_code(target.strip(), purpose="purchase_verification")

    if method == "email":
        sent = email_service.send_verification_code(target.strip(), code, purpose_label="Purchase Authorization")
        if not sent:
            raise HTTPException(500, "Failed to send purchase verification email.")
        return {
            "status": "success",
            "method": "email",
            "destination": target.strip(),
            "message": f"6-digit purchase verification code sent to {target.strip()}.",
        }

    elif method == "sms":
        sent = await sms_service.send_sms_code(target.strip(), code)
        if not sent:
            raise HTTPException(500, "Failed to send purchase verification SMS.")
        return {
            "status": "success",
            "method": "sms",
            "destination": target.strip(),
            "message": f"6-digit purchase verification code sent via SMS to {target.strip()}.",
        }

    else:
        raise HTTPException(400, f"Unsupported purchase 2FA method: {method}. Must be 'email' or 'sms'.")


@router.post("/2fa/purchase-verify")
async def verify_purchase_challenge(payload: PurchaseVerifyRequest, db: Session = Depends(get_db)):
    """Validates account password + 6-digit Email/SMS 2FA code, and finalizes purchase."""
    method = payload.method.lower()
    target = (payload.destination or payload.public_id).strip()

    if not payload.password or not payload.password.strip():
        raise HTTPException(400, "Account password is required for purchase authorization.")

    user = db.query(User).filter(User.public_id == payload.public_id).first()
    if not user:
        # Create user if new
        user = User(public_id=payload.public_id, plan="free", credits=1000)
        h, s = hash_password(payload.password)
        user.password_hash = h
        user.password_salt = s
        db.add(user)
        db.flush()
    else:
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
    valid, msg = code_store.verify_code(target, payload.code, purpose="purchase_verification")
    if not valid:
        raise HTTPException(400, msg)

    # Process Plan & Credits Grant
    plan = payload.plan.lower()
    credits_to_add = 0
    if plan == "elite":
        user.plan = "elite"
        credits_to_add = 4000
    elif plan == "pro":
        user.plan = "pro"
        credits_to_add = 2000
    elif plan == "basic":
        user.plan = "basic"
        credits_to_add = 1000
    else:
        credits_to_add = max(100, (payload.amount_cents or 500) * 10)

    user.credits = (user.credits or 0) + credits_to_add

    # Create Payment record
    payment_rec = Payment(
        user_id=user.id,
        provider=f"2fa_{method}",
        amount_cents=payload.amount_cents or 0,
        status="captured",
        provider_ref=f"2fa_{code_store.generate_code(user.public_id, purpose='receipt')}",
    )
    db.add(payment_rec)
    db.commit()
    db.refresh(user)

    return {
        "status": "success",
        "verified": True,
        "new_plan": user.plan,
        "new_credits": user.credits,
        "credits_added": credits_to_add,
        "payment_id": payment_rec.id,
        "message": f"✅ 2FA Verification successful! Plan upgraded to {user.plan.upper()} with +{credits_to_add} Credits.",
    }
