"""Routes for the Free Trial: mandatory 2FA + 1-cent payment verification.

Owner 09-06: the SMS-verified trial is retired. A signup must (1) enable
2FA in Account > Settings and (2) pass a 1-cent payment verification
(Stripe checkout when configured, else a manual record the operator
approves) before activating the 7-day, 150-token trial.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import User, get_db
from .payments import create_trial_verification
from .ratelimit import limiter
from .routes_features import get_current_authenticated_user
from .trial_service import TrialVerificationService

logger = logging.getLogger("helpotron.routes_trial")

router = APIRouter(prefix="/api/trial", tags=["Free Trial"])


def _trial_state(user: User) -> dict:
    """Live trial state for the client's activation card."""
    two_fa = bool((user.settings or {}).get("2fa_enabled"))
    return {
        "trial_claimed": bool(getattr(user, "trial_claimed", False)),
        "payment_verified": bool(getattr(user, "payment_verified", False)),
        "requires_2fa": True,
        "requires_1c_payment": True,
        "two_fa_enabled": two_fa,
        "credits_grant": 150,
        "trial_days": 7,
    }


@router.get("/status")
async def get_trial_status(
    request: Request,
    db: Session = Depends(get_db),
):
    """Trial eligibility and activation status for the authenticated user."""
    user = get_current_authenticated_user(request, db)
    eligible, reason = TrialVerificationService.check_eligibility(user, db)

    return {
        "status": "success",
        "eligible": eligible,
        "reason": reason if not eligible else None,
        **_trial_state(user),
        "plan": getattr(user, "plan", "none"),
        "credits": getattr(user, "credits", 0.0),
        "trial_expires_at": user.trial_expires_at.isoformat() if getattr(user, "trial_expires_at", None) else None,
    }


@router.post("/payment-verify")
async def request_trial_payment_verification(
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a 1-cent payment verification for the Free Trial.

    One pending verification at a time per user (rate-limit lane), and no
    new verification once payment/activation has completed."""
    user = get_current_authenticated_user(request, db)

    if getattr(user, "trial_claimed", False):
        raise HTTPException(status_code=400, detail="Free trial already claimed.")
    if getattr(user, "payment_verified", False):
        return {
            "status": "success",
            "mode": "already_verified",
            "message": "Payment already verified.",
        }

    if not limiter.allow(f"trial_verify:{user.public_id}", 5, window=3600.0):
        raise HTTPException(
            429,
            "Too many verification attempts. Try again in a few minutes.",
        )

    try:
        result = create_trial_verification(db, user)
    except Exception as e:  # Stripe-side failures must not 500 the flow
        logger.error("Trial payment verification failed for %s: %s", user.public_id, e)
        raise HTTPException(status_code=502, detail="Could not create the payment verification. Please try again.")

    return {"status": "success", **result}


@router.post("/activate")
async def activate_free_trial(
    request: Request,
    db: Session = Depends(get_db),
):
    """Activate the 7-day Free Trial (150 task tokens).

    Enforcement: 2FA enabled AND payment verified — otherwise a 403 with the
    exact missing requirement."""
    user = get_current_authenticated_user(request, db)

    if getattr(user, "trial_claimed", False):
        raise HTTPException(status_code=400, detail="Free trial already claimed.")

    # 403 with the missing requirement as the detail (client renders the step).
    if not (user.settings or {}).get("2fa_enabled"):
        raise HTTPException(
            403,
            "Two-factor authentication is required for the Free Trial — enable it in Account > Settings.",
        )
    if not getattr(user, "payment_verified", False):
        raise HTTPException(
            403,
            "Complete the 1-cent payment verification before activating the Free Trial.",
        )

    try:
        return TrialVerificationService.activate_trial(user, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Trial activation failed for %s: %s", user.public_id, e)
        raise HTTPException(status_code=500, detail="Internal server error activating free trial.")
