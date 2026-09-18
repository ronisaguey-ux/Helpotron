"""FastAPI routes for the forgot-password / recovery flow (operator 08-28).

Public (pre-login capable):
  GET  /api/recovery/options?public_id=…   → which channels are set (masked)
  POST /api/recovery/request               → send code via email | phone | dev
  POST /api/recovery/verify                → redeem code/link + set new password
  POST /api/recovery/contact               → save email/phone (auth required)

Password hashes rotate through security.hash_password — identical to signup.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import User, get_db
from .recovery import contact_status, request_recovery, save_contacts, verify_and_reset

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


class RecoveryRequestIn(BaseModel):
    public_id: str = Field(..., min_length=1, max_length=100)
    method: str = Field(..., description="email | phone | dev")


class RecoveryVerifyIn(BaseModel):
    public_id: str = Field(..., min_length=1, max_length=100)
    new_password: str = Field(..., min_length=8, max_length=256)
    code: Optional[str] = Field(None, max_length=12)
    token: Optional[str] = Field(None, max_length=128)
    two_factor_code: Optional[str] = Field(None, max_length=64)


class ContactSaveIn(BaseModel):
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=32)


def _request_user(request, db: Session) -> User:
    from .routes_features import get_current_authenticated_user

    return get_current_authenticated_user(request, db)


@router.get("/options")
async def recovery_options(public_id: str = Query(..., max_length=100), db: Session = Depends(get_db)):
    """Which recovery channels are available for this account (values masked).
    Works pre-login (forgot-password UX).
    Mitigates user enumeration: returns default availability schema rather than 404
    when the account is not found."""
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        return {
            "status": "success",
            "has_email": False,
            "email_set": False,
            "email_masked": None,
            "has_phone": False,
            "phone_set": False,
            "phone_masked": None,
            "dev": True,
        }
    status = contact_status(user)
    has_email = bool(status.get("email_set"))
    has_phone = bool(status.get("phone_set"))
    return {
        "status": "success",
        "has_email": has_email,
        "email_set": has_email,
        "email_masked": status.get("email_masked") or None,
        "has_phone": has_phone,
        "phone_set": has_phone,
        "phone_masked": status.get("phone_masked") or None,
        "dev": True,
    }


@router.post("/request")
async def recovery_request(payload: RecoveryRequestIn, db: Session = Depends(get_db)):
    """Mint + deliver a recovery code. method=dev pings the developer on
    Telegram (plus AdminMessage row) so they can hand the user a code.
    Mitigates user enumeration: non-existent accounts receive a generic 200 response."""
    try:
        result = await request_recovery(db, payload.public_id, payload.method)
    except ValueError as exc:
        msg = str(exc)
        if msg == "No account matches that public_id.":
            return {
                "status": "success",
                "message": f"If an account exists matching '{payload.public_id}', a recovery code has been sent.",
                "method": payload.method,
            }
        raise HTTPException(400, msg)
    return {"status": "success", **result}


@router.post("/verify")
async def recovery_verify(payload: RecoveryVerifyIn, db: Session = Depends(get_db)):
    """Redeem the recovery code (or link token) and set a NEW password without
    the old one. Same hashing as signup; other sessions get revoked."""
    try:
        result = verify_and_reset(
            db,
            public_id=payload.public_id,
            new_password=payload.new_password,
            code=payload.code,
            token=payload.token,
            two_factor_code=payload.two_factor_code,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"status": "success", **result}


@router.post("/contact")
async def save_recovery_contact(payload: ContactSaveIn, request: Request, db: Session = Depends(get_db)):
    """Store the user's email / phone so the recovery sends land somewhere real."""
    if payload.email is None and payload.phone is None:
        raise HTTPException(400, "Provide an email or a phone number.")
    user = _request_user(request, db)
    try:
        result = save_contacts(db, user, email=payload.email, phone=payload.phone)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return result
