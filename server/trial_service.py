"""Free Trial activation service for Helpotron (owner 09-06).

Rules:
1. Free trial is 1-time only per account.
2. Mandatory 2FA: the account must have 2FA enabled (settings['2fa_enabled'])
   before the trial can be activated.
3. Payment verification: a 1-cent payment must be verified for the account
   (Stripe checkout when configured, else a manual record the operator
   approves) — see payments.create_trial_verification.
4. Upon activation the user receives 150 task tokens, plan becomes 'trial'
   and subscription_status becomes 'trialing' for 7 days.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Dict, Tuple

from sqlalchemy.orm import Session

from .database import CreditTransaction, User, utcnow

logger = logging.getLogger("helpotron.trial")

TRIAL_CREDITS_GRANT = 150.0  # 150 task tokens (owner 09-06)
TRIAL_DURATION_DAYS = 7


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
        """Activates the 1-time Free Trial (150 task tokens)."""
        eligible, reason = cls.check_eligibility(user, db)
        if not eligible:
            raise ValueError(reason)

        user.trial_claimed = True
        user.plan = "trial"
        user.subscription_status = "trialing"
        user.trial_expires_at = utcnow() + timedelta(days=TRIAL_DURATION_DAYS)
        user.credits = (user.credits or 0.0) + TRIAL_CREDITS_GRANT

        db.add(
            CreditTransaction(
                user_id=user.id,
                delta=TRIAL_CREDITS_GRANT,
                reason="free_trial_2fa_payment_activation",
            )
        )
        db.commit()
        db.refresh(user)

        logger.info("Activated 1-time Free Trial for user %s (+%.1f task tokens)", user.public_id, TRIAL_CREDITS_GRANT)

        return {
            "status": "success",
            "message": f"Free trial activated! {int(TRIAL_CREDITS_GRANT)} task tokens have been added to your balance.",
            "user": {
                "public_id": user.public_id,
                "plan": user.plan,
                "credits": user.credits,
                "trial_claimed": True,
                "trial_expires_at": user.trial_expires_at.isoformat() if user.trial_expires_at else None,
            },
        }
