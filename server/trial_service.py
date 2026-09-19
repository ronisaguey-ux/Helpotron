"""Free Trial activation service for Helpotron (owner 09-06).

Rules:
1. Free trial is 1-time only per account.
2. Mandatory 2FA: the account must have 2FA enabled (settings['2fa_enabled'])
   before the trial can be activated.
3. Payment verification: a 1-cent payment must be verified for the account
   (Stripe checkout when configured, else a manual record the operator
   approves) — see payments.create_trial_verification.
4. Upon activation the user receives the trial token allowance, plan becomes 'trial'
   and subscription_status becomes 'trialing' for 14 days (owner 2026-09-19).
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Dict, Tuple

from sqlalchemy.orm import Session

from .database import User, utcnow

logger = logging.getLogger("helpotron.trial")

# 15,000 task tokens (owner 09-06 value of 150, rescaled 100x on 2026-09-17
# when the rate became 100 tokens = 1 cent; same value, finer unit).
# Sourced from TIER_TOKENS so the grant and the catalogue cannot drift.
from .payments import TIER_TOKENS as _TIER_TOKENS
TRIAL_CREDITS_GRANT = float(_TIER_TOKENS["trial"])
TRIAL_DURATION_DAYS = 14  # owner 2026-09-19: one-time trial, 2 weeks


class TrialVerificationService:
    """Manages the account checks and the 1-time trial activation."""

    @staticmethod
    def check_eligibility(user: User, db: Session = None) -> Tuple[bool, str]:
        """Checks whether this account may still claim the 1-time free trial.

        `db` kept for signature stability with callers/tests; the checks below
        are all account-local since the SMS phone-limit lane was retired.
        """
        if getattr(user, "trial_claimed", False):
            return False, "You have already claimed your 1-time free trial."

        if getattr(user, "plan", "none") in ("basic", "pro", "elite"):
            return False, "Your account already has an active paid plan."

        if not (user.settings or {}).get("2fa_enabled"):
            return False, "Two-factor authentication is required for the Free Trial — enable it in Account > Settings."

        if not getattr(user, "payment_verified", False):
            return False, "Complete the 1-cent payment verification before activating the Free Trial."

        return True, "Eligible"

    @classmethod
    def activate_trial(cls, user: User, db: Session) -> Dict[str, Any]:
        """Activates the 1-time Free Trial (trial token allowance)."""
        eligible, reason = cls.check_eligibility(user, db)
        if not eligible:
            raise ValueError(reason)

        user.trial_claimed = True
        user.plan = "trial"
        user.subscription_status = "trialing"
        user.trial_expires_at = utcnow() + timedelta(days=TRIAL_DURATION_DAYS)
        # Task tokens live in settings["token_balance"] — the usage budget the
        # chat/extension/dump gates enforce. user.credits is a separate discount
        # currency (routes_overlord: "Credits remain for discounts..."), so the
        # trial grant must land in token_balance, never in credits.
        user_settings = dict(user.settings or {})
        user_settings["token_balance"] = (
            float(user_settings.get("token_balance", 0) or 0) + TRIAL_CREDITS_GRANT
        )
        user.settings = user_settings

        db.commit()
        db.refresh(user)

        logger.info("Activated 1-time Free Trial for user %s (+%.1f task tokens)", user.public_id, TRIAL_CREDITS_GRANT)

        return {
            "status": "success",
            "message": f"Free trial activated! {int(TRIAL_CREDITS_GRANT)} task tokens have been added to your balance.",
            "user": {
                "public_id": user.public_id,
                "plan": user.plan,
                # 09-06 (owner rework): the trial grant lives in token_balance —
                # surface it (user.credits is a separate discount currency,
                # 0.0 here, and was previously mistaken for the grant).
                "credits": user.credits,
                "token_balance": round(float((user.settings or {}).get("token_balance", 0) or 0), 2),
                "trial_claimed": True,
                "trial_expires_at": user.trial_expires_at.isoformat() if user.trial_expires_at else None,
            },
        }
