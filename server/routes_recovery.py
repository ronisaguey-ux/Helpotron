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
def recovery_verify(payload: RecoveryVerifyIn, db: Session = Depends(get_db)):
    """Redeem the recovery code (or link token) and set a NEW password without
    the old one. Same hashing as signup; other sessions get revoked.

    Sync on purpose: verify_and_reset uses SMSVerification.send_sync/check_sync
    (asyncio.run) for SMS 2FA and Twilio Verify phone codes. Inside an `async def`
    that raises "asyncio.run() cannot be called from a running event loop" and
    every SMS-2FA reset answered 500. FastAPI runs a sync route in its threadpool,
    which has no running loop — the same arrangement as the sync /api/login."""
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


class HelpTicketIn(BaseModel):
    """A ticket from someone who may not be able to log in at all.

    `public_id` is a LABEL the sender types — it is explicitly NOT an identity,
    because the whole point of this endpoint is that the sender cannot prove who
    they are. It is never used as a credential and never grants access.
    """
    public_id: str = Field("", max_length=100)
    subject: str = Field("Account Recovery Assistance", max_length=256)
    message: str = Field(..., min_length=3, max_length=10000)
    contact: str = Field("", max_length=200)
    turnstile_token: str = Field("", max_length=4096)


@router.post("/help-ticket")
async def submit_help_ticket(payload: HelpTicketIn, request: Request,
                             db: Session = Depends(get_db)):
    """Reach the developer WITHOUT being logged in.

    The "Ask the Developer" option in the recovery flow is for users who cannot
    sign in — a locked-out account, a forgotten password, a broken credential.
    Requiring authentication for it defeats its purpose: the people who need it
    most are exactly the ones who cannot authenticate. It was gated behind
    `_get_current_user`, so the ticket form returned
    "Authentication required to access feature" to every locked-out user.

    Public by necessity, so it is defended by what a public endpoint CAN use:
    a per-IP rate limit and the Turnstile gate when it is configured. The ticket
    is stored with an `unverified:` sender marker so the admin knows it did not
    come from an authenticated session and must not be acted on as if it had.
    """
    from .database import AdminMessage
    from . import ratelimit

    client = request.client.host if request.client else "unknown"
    # Tighter than the global budget: a human sends one ticket, not twenty.
    if not ratelimit.limiter.allow(f"helpticket:{client}", 5, window=3600.0):
        retry_after = ratelimit.limiter.retry_after(f"helpticket:{client}", 5, window=3600.0)
        raise HTTPException(
            429,
            f"Too many tickets from this address. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    # Same CAPTCHA gate as signup/login, when it is configured.
    from .captcha import captcha_required, has_valid_bypass, verify_turnstile_token
    token = request.headers.get("X-Turnstile-Token", "") or (payload.turnstile_token or "")
    if captcha_required() and not has_valid_bypass(request):
        if not verify_turnstile_token(token, client):
            raise HTTPException(403, "Security check required — complete the captcha and try again.")

    sender = (payload.public_id or "").strip() or "unknown"
    contact = (payload.contact or "").strip()
    body = payload.message.strip()
    if contact:
        body += f"\n\nReply-to (self-reported): {contact}"

    msg = AdminMessage(
        # NOT a verified identity: this marks the row as coming from an
        # unauthenticated sender so the admin never mistakes it for a session.
        user_id=f"unverified:{sender}",
        subject=payload.subject or "Account Recovery Assistance",
        category="recovery",
        message=body,
        status="sent",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # NO direct Telegram forward to the owner on purpose (owner directive
    # 2026-09-18): a ticket is an unverified claim from someone who could not
    # prove who they are, so the owner gets the agent's ASSESSMENT, not the raw
    # text. The row above is durable and the wake monitor
    # (~/.local/bin/oc_helpticket_wake.py) starts an agent run to triage it;
    # the agent investigates and forwards its own findings for the decision.

    return {
        "status": "success",
        "message": "Your message reached the developer. If you left a contact address, expect a reply there.",
        "message_id": msg.id,
    }


class TestingAccessIn(BaseModel):
    """Application for the free Testing tier (owner 2026-09-18).

    `public_id` is the account the grant should land on. It is NOT a credential
    and this endpoint does not authenticate it — an applicant who cannot log in
    must still be able to apply, and the agent verifies the account exists
    during triage rather than leaking "does this account exist?" to any caller.
    """
    public_id: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=10, max_length=10000)
    contact: str = Field("", max_length=200)
    turnstile_token: str = Field("", max_length=4096)


@router.post("/testing-access")
async def apply_for_testing_access(payload: TestingAccessIn, request: Request,
                                  db: Session = Depends(get_db)):
    """Apply for free Testing-tier access. Public by design.

    Owner: *"add a Testing tier, for users who use it to test the platform and
    report issues, they get 15k tokens for free, but need to send the dev a
    message explaining who they are, when that happens, make it wake u up, and
    then u send me the info for my approval."*

    So this endpoint does exactly two things: record the application durably,
    and let the wake monitor start an agent run. Approval is a human decision on
    Telegram — this handler grants nothing.
    """
    from .database import AdminMessage
    from . import ratelimit

    client = request.client.host if request.client else "unknown"
    if not ratelimit.limiter.allow(f"testapply:{client}", 3, window=3600.0):
        retry_after = ratelimit.limiter.retry_after(f"testapply:{client}", 3, window=3600.0)
        raise HTTPException(
            429,
            f"Too many applications from this address. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    from .captcha import captcha_required, has_valid_bypass, verify_turnstile_token
    token = request.headers.get("X-Turnstile-Token", "") or (payload.turnstile_token or "")
    if captcha_required() and not has_valid_bypass(request):
        if not verify_turnstile_token(token, client):
            raise HTTPException(403, "Security check required — complete the captcha and try again.")

    applicant = payload.public_id.strip()
    contact = payload.contact.strip()
    body = payload.message.strip()
    if contact:
        body += f"\n\nReply-to (self-reported): {contact}"

    msg = AdminMessage(
        # Category is fixed server-side, never client-supplied: a caller must not
        # be able to file a testing application under a label that skips triage.
        user_id=f"unverified:{applicant}",
        subject=f"Testing access application — {applicant}",
        category="testing_access",
        message=body,
        status="sent",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return {
        "status": "success",
        "message": (
            "Application received. Testing access is granted by hand — you will be "
            "notified on this account if it is approved."
        ),
        "application_id": msg.id,
    }
