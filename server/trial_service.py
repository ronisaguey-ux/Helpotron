"""Free Trial SMS verification service for Helpotron.

Rules:
1. Free trial is 1-time only per account and 1-time only per phone number.
2. Phone number must be SMS-verified via a 6-digit OTP (15 min TTL) before trial activation.
3. Upon verification, the user receives 500 trial credits, plan is set to 'trial',
   subscription_status is 'trialing', and a ClaimedTrialPhone record is persisted.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from .auth_2fa import TwilioSMSService, verification_store
from .database import ClaimedTrialPhone, CreditTransaction, User, utcnow
from .ratelimit import limiter

logger = logging.getLogger("helpotron.trial")

TRIAL_PURPOSE = "free_trial_sms"
TRIAL_CREDITS_GRANT = 100.0  # 100 task tokens ($1.00 USD tool budget, 1 token = $0.01)
TRIAL_DURATION_DAYS = 7


def normalize_phone_number(raw_phone: str) -> str:
    """Normalizes phone number to E.164 format (+1XXXXXXXXXX or +<country><digits>)."""
    if not raw_phone:
        raise ValueError("Phone number is required.")
    cleaned = re.sub(r"[\s\-\(\)\.]+", "", raw_phone.strip())
    if not cleaned:
        raise ValueError("Invalid phone number format.")
    
    # If 10 digits without leading +, assume US (+1)
    if re.fullmatch(r"\d{10}", cleaned):
        cleaned = f"+1{cleaned}"
    elif not cleaned.startswith("+"):
        if re.fullmatch(r"1\d{10}", cleaned):
            cleaned = f"+{cleaned}"
        elif re.fullmatch(r"\d{10,15}", cleaned):
            cleaned = f"+{cleaned}"
        else:
            raise ValueError("Phone number must contain a valid country code (e.g. +1 555 123 4567).")

    if not re.fullmatch(r"\+\d{10,15}", cleaned):
        raise ValueError("Phone number must be 10 to 15 digits in international format (e.g. +12125551234).")
    
    return cleaned


def hash_phone_number(normalized: str) -> str:
    """Generates a SHA-256 fingerprint of the normalized phone number."""
    salt = "helpotron_trial_salt_2026"
    return hashlib.sha256(f"{salt}:{normalized}".encode("utf-8")).hexdigest()


def mask_phone_number(normalized: str) -> str:
    """Masks phone number for secure UI display (e.g. +1 (***) ***-1234)."""
    if len(normalized) >= 4:
        return f"{normalized[:3]} ***-***-{normalized[-4:]}"
    return "***"


class TrialVerificationService:
    """Manages SMS challenges and trial activation."""

    @staticmethod
    def check_eligibility(user: User, normalized_phone: Optional[str], db: Session) -> Tuple[bool, str]:
        """Checks if a user and phone number are eligible for the 1-time free trial."""
        if getattr(user, "trial_claimed", False):
            return False, "You have already claimed your 1-time free trial."
        
        user_plan = getattr(user, "plan", "none")
        if user_plan in ("basic", "pro", "elite"):
            return False, "Your account already has an active paid plan."

        if normalized_phone:
            p_hash = hash_phone_number(normalized_phone)
            existing_claim = db.query(ClaimedTrialPhone).filter(ClaimedTrialPhone.phone_hash == p_hash).first()
            if existing_claim:
                return False, "This phone number has already been used to claim a free trial. Trials are limited to 1 per phone number."
            
            # Also check existing users with this phone
            existing_user = db.query(User).filter(
                User.phone_number == normalized_phone,
                User.trial_claimed == True,
                User.id != user.id
            ).first()
            if existing_user:
                return False, "This phone number has already been used to claim a free trial."

        return True, "Eligible"

    @classmethod
    async def request_sms_code(
        cls,
        user: User,
        raw_phone: str,
        ip_address: str,
        db: Session,
    ) -> Dict[str, Any]:
        """Sends a 6-digit SMS verification code to the user's phone number."""
        # 1. Rate limiting: max 4 SMS requests per 15 minutes per IP
        if not limiter.allow(f"trial_sms_ip:{ip_address}", 4, window=900.0):
            retry_after = limiter.retry_after(f"trial_sms_ip:{ip_address}", 4, window=900.0)
            raise ValueError(f"Too many SMS requests from this IP. Please wait {retry_after} seconds.")

        # 2. Normalize and validate format
        normalized = normalize_phone_number(raw_phone)

        # 3. Rate limiting per phone number: max 3 requests per 15 minutes
        if not limiter.allow(f"trial_sms_phone:{normalized}", 3, window=900.0):
            retry_after = limiter.retry_after(f"trial_sms_phone:{normalized}", 3, window=900.0)
            raise ValueError(f"Too many verification requests for this phone number. Try again in {retry_after} seconds.")

        # 4. Check eligibility
        eligible, reason = cls.check_eligibility(user, normalized, db)
        if not eligible:
            raise ValueError(reason)

        # 5. Generate 6-digit OTP
        code = verification_store.generate_code(normalized, purpose=TRIAL_PURPOSE)

        # 6. Send SMS
        msg = f"Your Helpotron Free Trial verification code is: {code}. Valid for 15 minutes (1-time use)."
        sent = await TwilioSMSService.send_sms_async(normalized, msg)
        if not sent:
            raise RuntimeError("Failed to deliver SMS verification code. Please check your phone number and try again.")

        logger.info("Sent free trial SMS OTP to %s for user %s", mask_phone_number(normalized), user.public_id)
        return {
            "status": "success",
            "message": f"Verification code sent to {mask_phone_number(normalized)}.",
            "phone_masked": mask_phone_number(normalized),
            "expires_in_seconds": 900,
        }

    @classmethod
    def verify_sms_and_activate_trial(
        cls,
        user: User,
        raw_phone: str,
        code: str,
        ip_address: str,
        db: Session,
    ) -> Dict[str, Any]:
        """Verifies the 6-digit OTP and activates the 1-time Free Trial."""
        normalized = normalize_phone_number(raw_phone)

        # 1. Check eligibility again (lock against race condition)
        eligible, reason = cls.check_eligibility(user, normalized, db)
        if not eligible:
            raise ValueError(reason)

        # 2. Verify code
        clean_code = str(code or "").strip()
        if not clean_code:
            raise ValueError("Verification code is required.")

        ok, msg = verification_store.verify_code(normalized, clean_code, purpose=TRIAL_PURPOSE)
        if not ok:
            raise ValueError(msg or "Invalid or expired verification code.")

        # 3. Record phone claim
        p_hash = hash_phone_number(normalized)
        claim_record = ClaimedTrialPhone(
            phone_hash=p_hash,
            phone_masked=mask_phone_number(normalized),
            user_id=user.id,
            claimed_at=utcnow(),
            ip_address=ip_address,
        )
        db.add(claim_record)

        # 4. Activate trial on user
        user.trial_claimed = True
        user.phone_verified = True
        user.phone_number = normalized
        user.plan = "trial"
        user.subscription_status = "trialing"
        user.trial_expires_at = utcnow() + timedelta(days=TRIAL_DURATION_DAYS)
        user.credits = (user.credits or 0.0) + TRIAL_CREDITS_GRANT

        # Also store phone in settings profile for recovery compatibility
        settings = dict(user.settings or {})
        settings["phone"] = normalized
        settings["phone_verified"] = True
        user.settings = settings

        # 5. Ledger entry
        db.add(
            CreditTransaction(
                user_id=user.id,
                delta=TRIAL_CREDITS_GRANT,
                reason="free_trial_sms_activation",
            )
        )

        db.commit()
        db.refresh(user)

        logger.info(
            "Activated 1-time Free Trial for user %s with phone %s (+%.1f credits)",
            user.public_id,
            mask_phone_number(normalized),
            TRIAL_CREDITS_GRANT,
        )

        return {
            "status": "success",
            "message": f"Free trial activated! {int(TRIAL_CREDITS_GRANT)} task tokens have been added to your balance.",
            "user": {
                "public_id": user.public_id,
                "plan": user.plan,
                "credits": user.credits,
                "phone_verified": True,
                "trial_claimed": True,
                "trial_expires_at": user.trial_expires_at.isoformat() if user.trial_expires_at else None,
            },
        }
