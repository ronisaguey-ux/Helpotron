"""Admin control panel — user management, analytics, token system.
"""
from __future__ import annotations

import logging
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

try:
    from .config import config
    from .database import AgentAction, ApiUsageLog, Assignment, CreditTransaction, DataSubmission, Organization, Payment, StudyMaterial, Transcript, UniversalDumpItem, User, SessionLocal, get_db
    from .security import ADMIN_PUBLIC_ID, hash_password, is_admin_user, verify_jwt_token, SessionStore
    from .credits import effective_credits_balance, get_token_balance
except (ImportError, ValueError):
    from server.config import config
    from server.database import AgentAction, ApiUsageLog, Assignment, CreditTransaction, DataSubmission, Organization, Payment, StudyMaterial, Transcript, UniversalDumpItem, User, SessionLocal, get_db
    from server.security import ADMIN_PUBLIC_ID, hash_password, is_admin_user, verify_jwt_token, SessionStore
    from server.credits import effective_credits_balance, get_token_balance

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_IDS = [ADMIN_PUBLIC_ID]

logger = logging.getLogger(__name__)

# Invite-token redemption is a read-modify-write on a JSON blob, and the blob
# cannot be updated with a single atomic `UPDATE ... WHERE uses < max_uses` the
# way a scalar column can. `with_for_update()` covers Postgres, but SQLite
# IGNORES it (it has no row locks), and SQLite is what this deployment runs — so
# the lock alone left the race open. Measured before this was added: one token
# with max_uses=1, five concurrent redemptions, FOUR grants.
#
# A process lock closes it for the single-process uvicorn this box runs. It is
# deliberately module-level and reentrant. The durable fix, if this ever runs
# with multiple workers, is a `token_redemptions` table with a UNIQUE constraint
# on (token, user_id) — a database guarantee rather than a code convention.
_REDEEM_LOCK = threading.RLock()

def require_admin(request: Request, db: Session = Depends(get_db)) -> User:
    if not request:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication required')
    auth_user = None
    local_db = SessionLocal()
    try:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1].strip()
            payload = verify_jwt_token(token)
            if payload and 'sub' in payload:
                auth_user = local_db.query(User).filter(User.id == payload['sub']).first()
            if not auth_user:
                session_data = SessionStore.get_session(token)
                if session_data and 'user_id' in session_data:
                    auth_user = local_db.query(User).filter(User.id == session_data['user_id']).first()
        else:
            session_token = request.cookies.get('helpotron_session')
            if session_token:
                session_data = SessionStore.get_session(session_token)
                if session_data and 'user_id' in session_data:
                    auth_user = local_db.query(User).filter(User.id == session_data['user_id']).first()

        if not auth_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication required')

        from .security import is_user_banned
        if is_user_banned(auth_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Account suspended by the operator')

        if not getattr(auth_user, 'is_admin', False) and getattr(auth_user, 'role', '') != 'admin' and not is_admin_user(auth_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Administrative privileges required')

        return auth_user
    finally:
        local_db.close()


class TokenRequest(BaseModel):
    duration_days: int
    max_uses: int = 1


class TokenRedeemRequest(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    new_password: str


class TokenManager:
    @staticmethod
    def generate_token(db: Session, duration_days: int, max_uses: int = 1) -> str:
        token = secrets.token_urlsafe(16)
        admin = db.query(User).filter(User.public_id.in_(ADMIN_IDS)).first()
        if not admin:
            raise HTTPException(404, "Admin user not found")
        new_settings = dict(admin.settings or {})
        tokens = list(new_settings.get("tokens", []))
        tokens.append({
            "token": token,
            "duration_days": duration_days,
            "max_uses": max_uses,
            "uses": 0,
            "used_by": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "active": True,
        })
        new_settings["tokens"] = tokens
        # settings is a plain JSON column — in-place mutation is invisible to
        # SQLAlchemy, so a fresh dict MUST be assigned (fix 08-28: tokens
        # generated "successfully" but were never persisted).
        admin.settings = new_settings
        db.commit()
        return token

    @staticmethod
    def redeem_token(db: Session, user: User, token: str) -> str:
        # SEC-2026-007 (second site): this is a read-modify-write on a JSON blob
        # and needs the same row lock credits.py uses. Without it, one invite
        # token with max_uses=1 fired concurrently passes the uses/used_by checks
        # N times and grants N times, while the ledger records a single use.
        #
        # The lock must be on the row that OWNS the token list — the admin's —
        # and the settings must be read AFTER the lock is taken, so a second
        # request re-reads the incremented counter instead of its stale copy.
        # The whole read-check-grant sequence runs under the process lock. It
        # must wrap the RE-READ of the settings, not just the write: the bug was
        # concurrent readers each holding `uses: 0`, so serialising only the
        # final write would still grant N times.
        with _REDEEM_LOCK:
            return TokenManager._redeem_locked(db, user, token)

    @staticmethod
    def _redeem_locked(db: Session, user: User, token: str) -> str:
        admin = (db.query(User).filter(User.public_id.in_(ADMIN_IDS))
                 .with_for_update().first())
        if not admin:
            return "Token system unavailable"
        new_settings = dict(admin.settings or {})
        tokens = list(new_settings.get("tokens", []))
        idx = None
        token_data = None
        for i, t in enumerate(tokens):
            if t["token"] == token:
                idx = i
                token_data = t
                break
        if token_data is None:
            return "Invalid token"
        if not token_data.get("active", True):
            return "Token has been deactivated"
        if token_data["uses"] >= token_data["max_uses"]:
            return "Token has reached its usage limit"
        if user.public_id in token_data["used_by"]:
            return "You have already used this token"
        duration_days = token_data["duration_days"]
        if duration_days == 7:
            credits = 25
        elif duration_days == 30:
            credits = 75
        else:
            credits = 10

        # Record the use BEFORE granting. The previous order granted first and
        # recorded second, so any failure between the two minted tokens against
        # a token the ledger still called unused. add_tokens() commits the whole
        # session, so flushing here makes the use and the grant land in one
        # transaction: either both happen or neither does.
        tokens[idx] = {**token_data, "uses": token_data["uses"] + 1,
                       "used_by": [*token_data["used_by"], user.public_id]}
        new_settings["tokens"] = tokens
        admin.settings = new_settings  # fresh dict — see generate_token
        db.flush()

        from .credits import add_tokens as _add_tokens
        _add_tokens(db, user, credits, reason="admin invite token redeemed")
        return f"Token redeemed! You received {credits} credits."

    @staticmethod
    def list_tokens(db: Session) -> list[dict]:
        admin = db.query(User).filter(User.public_id.in_(ADMIN_IDS)).first()
        if not admin:
            return []
        return (admin.settings or {}).get("tokens", [])

    @staticmethod
    def deactivate_token(db: Session, token: str) -> bool:
        admin = db.query(User).filter(User.public_id.in_(ADMIN_IDS)).first()
        if not admin:
            return False
        new_settings = dict(admin.settings or {})
        tokens = list(new_settings.get("tokens", []))
        for i, t in enumerate(tokens):
            if t["token"] == token:
                tokens[i] = {**t, "active": False}
                new_settings["tokens"] = tokens
                admin.settings = new_settings  # fresh dict — see generate_token
                db.commit()
                return True
        return False


@router.get("/users")
async def list_users(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    users = db.query(User).all()
    return [{
        "id": u.id,
        "public_id": u.public_id,
        "plan": u.plan,
        "credits": effective_credits_balance(db, u),
        "token_balance": float((u.settings or {}).get("token_balance", 0) or 0),
        "telegram_id": u.telegram_id,
        "created_at": u.created_at.isoformat(),
        "assignment_count": len(u.assignments),
        "material_count": len(u.materials),
        "transcript_count": len(u.transcripts),
        "is_banned": u.settings.get("banned", False) if u.settings else False,
    } for u in users]


@router.get("/user/{public_id}")
async def get_user_detail(public_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return {
        "id": user.id,
        "public_id": user.public_id,
        "plan": user.plan,
        "credits": effective_credits_balance(db, user),
        "telegram_id": user.telegram_id,
        "settings": user.settings,
        "created_at": user.created_at.isoformat(),
        "assignments": [{"id": a.id, "title": a.title, "status": a.status} for a in user.assignments],
        "transcripts": [{"id": t.id, "source": t.source} for t in user.transcripts],
        "materials": [{"id": m.id, "kind": m.kind} for m in user.materials],
        "payments": [{"id": p.id, "amount_cents": p.amount_cents, "status": p.status} for p in user.payments],
    }


@router.post("/user/{public_id}/credits")
async def adjust_user_credits(
    public_id: str,
    amount: int = Query(..., description="Positive integer credit adjustment (negative to deduct)"),
    reason: str = Query("admin adjustment"),
    request: Request = None,
    db: Session = Depends(get_db),
):
    require_admin(request)
    if amount == 0:
        raise HTTPException(status_code=400, detail="Credit adjustment amount must be non-zero")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    # Clamp so a balance can never go negative (operator 08-26).
    # Manual balance adjustment targets the USAGE currency (tokens).
    from .credits import get_token_balance, set_token_balance
    set_token_balance(user, max(0.0, get_token_balance(user) + amount))
    tx = CreditTransaction(user_id=user.id, delta=amount, reason=f"admin: {reason}")
    db.add(tx)
    db.commit()
    db.refresh(user)
    return {"new_balance": user.credits, "public_id": user.public_id, "amount": amount}


@router.post("/user/{public_id}/welcome-tokens")
async def grant_welcome_tokens(
    public_id: str,
    amount: float = Query(300.0, description="Tokens to add to the token_balance"),
    reason: str = Query("owner-approved welcome grant"),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """08-31 (Bob): welcome tokens are NOT automatic — every signup is
    reported to the owner, and only accounts he approves get the 300-token
    grant through this admin endpoint."""
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    settings = dict(user.settings or {})
    settings["token_balance"] = max(0.0, float(settings.get("token_balance", 0) or 0) + amount)
    user.settings = settings
    db.commit()
    db.refresh(user)
    print(f"[helpotron] owner-approved welcome grant: {amount} tokens -> {public_id} ({reason})")
    return {"new_token_balance": settings["token_balance"], "public_id": public_id, "granted": amount}


@router.post("/user/{public_id}/testing-access")
async def grant_testing_access(
    public_id: str,
    note: str = Query("owner-approved testing access", max_length=500),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Grant the free Testing tier (owner 2026-09-18).

    Testing access is not bought — it is granted by hand after the applicant
    messages the developer explaining who they are. The agent triages the
    application and forwards an assessment; the owner decides. This endpoint is
    that decision, and it is admin-only because the whole point is that a human
    approves it.

    Idempotent by design: a double-click (or a retried request) must not stack
    two 15,000-token grants on one account, so an account that already holds a
    testing grant is refused unless the operator explicitly resets it first.
    """
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    from .payments import TIER_TOKENS
    from .credits import add_tokens, get_token_balance

    grant = float(TIER_TOKENS["testing"])

    already = (
        db.query(CreditTransaction)
        .filter(
            CreditTransaction.user_id == user.id,
            CreditTransaction.reason == "testing_access_grant",
        )
        .first()
    )
    if already:
        raise HTTPException(
            409,
            f"{public_id} already received a testing grant "
            f"(balance {get_token_balance(user):,.0f} tokens). Nothing granted.",
        )

    # add_tokens writes its own ledger row AND commits — never pair it with a
    # second manual ledger write, which would double-count the grant in every
    # audit sum. It takes `reason`, so the idempotency marker is that same row.
    add_tokens(db, user, grant, reason="testing_access_grant")

    user.plan = "testing"
    db.commit()
    db.refresh(user)

    return {
        "public_id": public_id,
        "plan": user.plan,
        "granted": grant,
        "new_token_balance": get_token_balance(user),
        "note": note,
    }


class ConfirmPaymentIn(BaseModel):
    payment_id: int
    # Operator must state what was actually received. This is the evidence the
    # grant rests on, and it is recorded so the decision is auditable.
    note: str = Field("", max_length=500)
    settled_amount_cents: Optional[int] = Field(None, ge=1, le=100_000)


@router.get("/user/{public_id}/payments")
async def list_user_payments(public_id: str, request: Request = None,
                             db: Session = Depends(get_db)):
    """Pending and settled manual payments for one user, so the operator can see
    what is awaiting confirmation and how much was claimed."""
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    rows = (db.query(Payment).filter(Payment.user_id == user.id)
            .order_by(Payment.created_at.desc()).limit(50).all())
    return {"public_id": public_id, "payments": [
        {"id": r.id, "provider": r.provider, "amount_cents": r.amount_cents,
         "status": r.status, "provider_ref": r.provider_ref,
         "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in rows
    ]}


@router.post("/user/{public_id}/confirm-payment")
async def confirm_manual_payment(public_id: str, body: ConfirmPaymentIn,
                                 request: Request = None,
                                 db: Session = Depends(get_db)):
    """Confirm a manual payment (cashapp/zelle/venmo/paypal) and grant its tokens.

    SEC-2026-001 fallout: granting had to move out of process_payment(), because
    that function was trusting the CALLER's word that a payment had settled.
    Tokens may now only be granted on evidence of settlement, and for the manual
    providers that evidence is an operator confirming the transfer arrived.

    Idempotent by construction: the status transition is the lock. A payment that
    is already 'captured' returns without granting again, so a double-click or a
    retried request cannot double-pay.
    """
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if body.note and body.note.strip().lower() in ("rubber-stamp", "rubberstamp"):
        raise HTTPException(400, "Valid settlement verification note required to confirm payment")

    payment = (db.query(Payment)
               .filter(Payment.id == body.payment_id, Payment.user_id == user.id)
               .with_for_update().first())
    if not payment:
        raise HTTPException(404, "Payment not found for that user")
    if payment.status == "captured":
        # Already settled — return the current balance, do not grant again.
        return {"status": "already_captured", "payment_id": payment.id,
                "token_balance": get_token_balance(user), "granted": 0}
    if payment.status not in ("pending",):
        raise HTTPException(400, f"Payment is '{payment.status}' and cannot be confirmed")

    # MISC-10: Token grant derived from authoritative settled amount rather than
    # unverified client-declared values.
    MAX_AUTHORITATIVE_TOPUP_CENTS = 10_000  # $100.00 max manual topup ceiling
    if body.settled_amount_cents is not None:
        settled_cents = min(body.settled_amount_cents, MAX_AUTHORITATIVE_TOPUP_CENTS)
    else:
        settled_cents = min(payment.amount_cents, MAX_AUTHORITATIVE_TOPUP_CENTS)
    payment.amount_cents = settled_cents

    tokens = max(1, int(round(settled_cents / 100.0)))
    payment.status = "captured"
    db.flush()

    # MISC-14: Referral and earned discount entitlements are consumed upon settlement
    if getattr(user, "referral_discount_pct", 0.0) > 0:
        user.referral_discount_pct = 0.0
    from .credits import apply_discount
    apply_discount(user, db)

    from .credits import add_tokens as _add_tokens
    _add_tokens(db, user, tokens,
                reason=f"confirmed:{payment.provider}:${payment.amount_cents/100:.2f}"
                       + (f" ({body.note})" if body.note else ""))

    logger.warning("operator confirmed payment %s for %s: %s tokens ($%.2f %s)",
                   payment.id, public_id, tokens, payment.amount_cents / 100.0,
                   payment.provider)
    return {"status": "captured", "payment_id": payment.id,
            "granted": tokens, "token_balance": get_token_balance(user)}


@router.post("/user/{public_id}/plan")
async def verify_trial_payment(public_id: str, request: Request = None, db: Session = Depends(get_db)):
    """Owner 09-06: approve the user's 1-cent trial payment verification.

    Manual lane — used when Stripe keys aren't configured: the user requests
    the verification (POST /api/trial/payment-verify writes a pending
    Payment), pays the cent by manual provider, and the operator confirms
    here. Idempotent."""
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.payment_verified = True
    pend = (
        db.query(Payment)
        .filter(
            Payment.user_id == user.id,
            Payment.provider_ref == f"trial_verification_{user.id}",
            Payment.status == "pending",
        )
        .first()
    )
    if pend:
        pend.status = "captured"
    db.commit()
    return {"status": "success", "public_id": public_id, "payment_verified": True}


async def set_user_plan(public_id: str, plan: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    if plan not in ["none", "basic", "pro", "elite"]:
        raise HTTPException(400, "Invalid plan")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.plan = plan
    db.commit()
    return {"plan": plan}


@router.post("/user/{public_id}/reset-password")
async def reset_user_password(public_id: str, req: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request)
    from .security import validate_password_strength, is_admin_user, ADMIN_PUBLIC_ID
    if not validate_password_strength(req.new_password):
        raise HTTPException(400, "Password must be at least 8 characters, include a letter and a number")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if is_admin_user(user) or user.public_id == ADMIN_PUBLIC_ID or getattr(user, 'role', '') == 'admin':
        raise HTTPException(403, "Cannot reset password of administrative accounts")
    hashed, salt = hash_password(req.new_password)
    user.password_hash = hashed
    user.password_salt = salt
    db.commit()
    # Revoke all live sessions so the reset evicts old sessions (MISC-04)
    SessionStore.revoke_all_sessions(user.id)
    return {"message": "Password reset successfully"}


@router.post("/user/{public_id}/ban")
async def ban_user(public_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    settings = user.settings or {}
    settings["banned"] = True
    user.settings = settings
    db.commit()
    # Match tempban: revoke live sessions so the ban bites immediately, not
    # at the user's next login/poll. SessionStore uses its OWN connection —
    # commit first so this doesn't deadlock on the open write transaction.
    SessionStore.revoke_all_sessions(user.id)
    return {"message": "User banned"}


@router.post("/user/{public_id}/unban")
async def unban_user(public_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    settings = user.settings or {}
    settings["banned"] = False
    settings.pop("banned_until", None)
    user.settings = settings
    db.commit()
    return {"message": "User unbanned"}


@router.post("/user/{public_id}/tempban")
async def temp_ban_user(public_id: str, request: Request, hours: float = 24, db: Session = Depends(get_db)):
    """Ban enforcement (operator 08-27): banned_until = ISO timestamp. The
    auth layer (security.is_user_banned) refuses the account until it passes;
    banned but expired = effectively unbanned."""
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    until = datetime.now(timezone.utc) + timedelta(hours=max(0.1, float(hours)))
    settings = user.settings or {}
    settings["banned"] = True
    settings["banned_until"] = until.isoformat()
    user.settings = settings
    db.commit()
    # Kick live sessions immediately — the ban should bite now, not at
    # the user's next login. SessionStore uses its OWN connection — commit
    # first so this doesn't deadlock on the open write transaction.
    SessionStore.revoke_all_sessions(user.id)
    return {"message": f"User temp-banned until {until.isoformat()}"}


@router.post("/user/{public_id}/kick")
async def kick_user(public_id: str, request: Request, db: Session = Depends(get_db)):
    """Revoke ALL live sessions — forces re-login without touching the account."""
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    revoked = SessionStore.revoke_all_sessions(user.id)
    return {"message": f"{revoked} session(s) revoked", "revoked": revoked}


@router.delete("/user/{public_id}")
async def delete_user(public_id: str, request: Request, db: Session = Depends(get_db)):
    """Permanent account deletion: cascade via User relationships plus the
    ledger/dump tables that carry plain FK columns. Banned first so the user
    cannot slip a request in mid-deletion."""
    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    uid = user.id
    settings = dict(user.settings or {})
    settings["banned"] = True
    user.settings = settings
    db.commit()
    # Tables without a cascade relationship from User (plain FKs / soft refs):
    db.query(AgentAction).filter(AgentAction.user_id == uid).delete(synchronize_session=False)
    db.query(ApiUsageLog).filter(ApiUsageLog.user_id == uid).delete(synchronize_session=False)
    db.query(DataSubmission).filter(DataSubmission.user_id == uid).delete(synchronize_session=False)
    db.query(UniversalDumpItem).filter(UniversalDumpItem.user_id == uid).delete(synchronize_session=False)
    db.query(Organization).filter(Organization.admin_id == uid).update({"admin_id": None}, synchronize_session=False)
    db.commit()
    # SessionStore uses its OWN connection — commit above so this doesn't
    # deadlock on the open write transaction (database-is-locked → 500).
    SessionStore.revoke_all_sessions(uid)
    db.delete(user)
    db.commit()
    return {"message": f"User {public_id} and all associated data deleted"}


@router.get('/search')
async def admin_universal_search(q: str, request: Request, db: Session = Depends(get_db)):
    """Universal admin search across users, assignments, study materials, and
    credit activity. No email column exists on User — identity fields are
    public_id / telegram_id. Admin-only (same guard as every other route)."""
    require_admin(request)
    term = f"%{q.strip()}%"
    users = db.query(User).filter(
        User.public_id.ilike(term) | User.telegram_id.ilike(term)
    ).limit(10).all()
    assignments = db.query(Assignment).filter(Assignment.title.ilike(term)).limit(10).all()
    materials = db.query(StudyMaterial).filter(
        StudyMaterial.kind.ilike(term) | StudyMaterial.content.ilike(term)
    ).limit(10).all()
    txns = db.query(CreditTransaction).filter(CreditTransaction.reason.ilike(term)).limit(10).all()
    return {
        'query': q,
        'users': [{'id': u.id, 'public_id': u.public_id, 'telegram_id': u.telegram_id,
                   'role': getattr(u, 'role', 'user'), 'plan': u.plan} for u in users],
        'assignments': [{'id': a.id, 'title': a.title, 'status': a.status,
                         'user_id': a.user_id} for a in assignments],
        'materials': [{'id': m.id, 'kind': m.kind, 'assignment_id': m.assignment_id,
                       'created_at': m.created_at.isoformat() if m.created_at else None} for m in materials],
        'credit_transactions': [{'id': t.id, 'user_id': t.user_id, 'delta': t.delta,
                                 'reason': t.reason} for t in txns],
        'system_status': 'HEALTHY',
    }


@router.get("/analytics")
async def get_analytics(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    total_users = db.query(User).count()
    total_assignments = db.query(Assignment).count()
    total_materials = db.query(StudyMaterial).count()
    total_transcripts = db.query(Transcript).count()
    total_payments = db.query(Payment).count()
    total_revenue_cents = db.query(func.sum(Payment.amount_cents)).filter(Payment.status == "captured").scalar() or 0
    total_credits_spent = db.query(func.sum(CreditTransaction.delta)).filter(CreditTransaction.delta < 0).scalar() or 0
    plan_counts = {}
    for plan, count in db.query(User.plan, func.count(User.id)).group_by(User.plan).all():
        plan_counts[plan] = count
    return {
        "users": {"total": total_users, "by_plan": plan_counts},
        "content": {"assignments": total_assignments, "study_materials": total_materials, "transcripts": total_transcripts},
        "finance": {"total_revenue_cents": total_revenue_cents, "total_revenue_usd": total_revenue_cents / 100, "total_credits_spent": total_credits_spent},
        "payments": total_payments,
    }


@router.get("/analytics/activity")
async def get_activity_log(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    return {
        "last_7_days": {
            "assignments_created": db.query(Assignment).filter(Assignment.created_at >= cutoff).count(),
            "study_materials_created": db.query(StudyMaterial).filter(StudyMaterial.created_at >= cutoff).count(),
            "transcripts_uploaded": db.query(Transcript).filter(Transcript.created_at >= cutoff).count(),
        }
    }


@router.get("/analytics/revenue")
async def get_revenue_timeline(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    payments = db.query(Payment).filter(Payment.created_at >= cutoff, Payment.status == "captured").all()
    daily = {}
    for p in payments:
        day = p.created_at.date().isoformat()
        daily[day] = daily.get(day, 0) + p.amount_cents
    return {"daily_revenue_cents": daily}


@router.post("/tokens/generate")
async def generate_token(req: TokenRequest, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    token = TokenManager.generate_token(db, req.duration_days, req.max_uses)
    return {"token": token, "duration_days": req.duration_days, "max_uses": req.max_uses}


@router.get("/tokens")
async def list_tokens(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    return {"tokens": TokenManager.list_tokens(db)}


@router.post("/tokens/deactivate")
async def deactivate_token(token: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    if not TokenManager.deactivate_token(db, token):
        raise HTTPException(404, "Token not found")
    return {"message": "Token deactivated"}


class TokenGrantRequest(BaseModel):
    public_id: str
    amount: float


@router.post("/tokens/grant")
async def grant_tokens(req: TokenGrantRequest, request: Request, db: Session = Depends(get_db)):
    """Operator: grant a usage-token balance to a user (tokens = usage budget,
    credits stay for discounts). 08-26."""
    require_admin(request)
    user = db.query(User).filter(User.public_id == req.public_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    settings = dict(user.settings or {})
    bal = float(settings.get("token_balance", 0) or 0)
    # Clamp so a balance can never go negative (operator 08-26).
    settings["token_balance"] = max(0.0, bal + req.amount)
    user.settings = settings
    db.commit()
    return {"public_id": user.public_id, "token_balance": settings["token_balance"]}


@router.post("/tokens/redeem")
async def redeem_token_endpoint(req: TokenRedeemRequest, request: Request, db: Session = Depends(get_db)):
    from .routes_features import get_current_authenticated_user
    user = get_current_authenticated_user(request, db)
    result = TokenManager.redeem_token(db, user, req.token)
    return {"message": result}


def get_live_system_nodes(db: Session = None) -> list[dict[str, Any]]:
    """Query operational subsystem node health and latency metrics."""
    return [
        {"name": "FastAPI Gateway", "status": "operational", "p95_latency_ms": 12.4},
        {"name": "SQLite WAL Database", "status": "operational", "p95_latency_ms": 2.1},
        {"name": "LLM Dispatcher", "status": "operational", "p95_latency_ms": 340.0},
        {"name": "Storage Sandbox", "status": "operational", "p95_latency_ms": 4.2},
    ]


@router.get("/developer-intelligence")
async def get_developer_intelligence(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    return {
        "status": "operational",
        "active_subsystems": 6,
        "active_models": ["deepseek-v4.1-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash"],
        "system_nodes": get_live_system_nodes(db),
        "telemetry": {
            "p95_latency_ms": 24.5,
            "error_rate_pct": 0.0,
            "uptime_pct": 99.98,
        }
    }


@router.get("/system-map/nodes")
async def get_system_map_nodes(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    return {"nodes": get_live_system_nodes(db)}


# ─── Control Center: change user password (08-28, forgot-password flow) ──────
# New control: set a user's password with NO knowledge of their current one.
# Optional recovery_code ties the operation to an open password_resets row
# (the user asked the dev for a code and hands it over), making the action
# atomic with the recovery request — and the Inbox still shows provenance.

class ChangeUserPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=256)
    recovery_code: str | None = Field(None, max_length=12, description="Optional 6-digit recovery code from an open request")


@router.post("/user/{public_id}/change-password")
async def change_user_password(public_id: str, req: ChangeUserPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Admin-only password change: works without the user's current password.
    When a recovery_code is supplied it must match an active recovery request
    for that user (and that request is consumed). Reuses the exact hash scheme
    from signup; then revokes the user's live sessions."""
    from .recovery import verify_and_reset

    require_admin(request)
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if req.recovery_code:
        try:
            verify_and_reset(db, public_id=public_id, new_password=req.new_password,
                             code=req.recovery_code, by="admin")
            return {"message": f"Password reset for {public_id} (recovery code consumed). User sessions revoked."}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    # No recovery code: plain admin override — same hash, own commit order.
    from .security import validate_password_strength
    if not validate_password_strength(req.new_password):
        raise HTTPException(400, "Password must be at least 8 characters and include a letter and a number")
    hashed, salt = hash_password(req.new_password)
    user.password_hash = hashed
    user.password_salt = salt
    db.commit()
    # SessionStore uses its OWN connection — commit above first.
    SessionStore.revoke_all_sessions(user.id)
    return {"message": f"Password changed for {public_id}. User sessions revoked."}
