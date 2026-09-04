"""Routes for Free Trial SMS verification and 1-time activation."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import get_db, User
from .routes_features import get_current_authenticated_user
from .trial_service import TrialVerificationService, mask_phone_number

logger = logging.getLogger("helpotron.routes_trial")

router = APIRouter(prefix="/api/trial", tags=["Free Trial"])


class TrialSmsRequestIn(BaseModel):
    phone_number: str = Field(..., description="Mobile phone number in E.164 or national format")


class TrialSmsVerifyIn(BaseModel):
    phone_number: str = Field(..., description="Mobile phone number used for SMS challenge")
    code: str = Field(..., min_length=4, max_length=10, description="6-digit SMS verification code")


def _get_client_ip(request: Request) -> str:
    """Extract client IP respecting forward headers."""
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


@router.get("/status")
async def get_trial_status(
    request: Request,
    db: Session = Depends(get_db),
):
    """Returns trial eligibility and current activation status for the authenticated user."""
    user = get_current_authenticated_user(request, db)
    eligible, reason = TrialVerificationService.check_eligibility(user, None, db)

    return {
        "status": "success",
        "eligible": eligible,
        "reason": reason if not eligible else None,
        "trial_claimed": bool(getattr(user, "trial_claimed", False)),
        "phone_verified": bool(getattr(user, "phone_verified", False)),
        "phone_masked": mask_phone_number(user.phone_number) if getattr(user, "phone_number", None) else None,
        "plan": getattr(user, "plan", "none"),
        "credits": getattr(user, "credits", 0.0),
        "trial_expires_at": user.trial_expires_at.isoformat() if getattr(user, "trial_expires_at", None) else None,
    }


@router.post("/sms/request")
async def request_trial_sms(
    payload: TrialSmsRequestIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Sends a 6-digit SMS verification code to claim the 1-time Free Trial."""
    user = get_current_authenticated_user(request, db)
    client_ip = _get_client_ip(request)

    try:
        result = await TrialVerificationService.request_sms_code(
            user=user,
            raw_phone=payload.phone_number,
            ip_address=client_ip,
            db=db,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error("Error in request_trial_sms: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error processing SMS verification request.")


@router.post("/sms/verify")
async def verify_trial_sms(
    payload: TrialSmsVerifyIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Verifies the 6-digit SMS code and activates the 1-time Free Trial (granting 100 task tokens)."""
    user = get_current_authenticated_user(request, db)
    client_ip = _get_client_ip(request)

    try:
        result = TrialVerificationService.verify_sms_and_activate_trial(
            user=user,
            raw_phone=payload.phone_number,
            code=payload.code,
            ip_address=client_ip,
            db=db,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error in verify_trial_sms: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error activating free trial.")
