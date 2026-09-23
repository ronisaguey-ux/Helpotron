"""Session visibility + revocation (owner 2026-09-23).

A user could not see or end their own sessions. 2FA only guards sign-in; once a
session exists, a stolen cookie was invisible and unkillable from inside the
app. This is the surface that closes that gap.

    GET    /api/user/sessions                list the caller's OWN sessions
    DELETE /api/user/sessions/{id}           end one of them
    POST   /api/user/sessions/revoke-others  end every other one ("sign out
                                             everywhere else")

A session token is a bearer credential, so the token is NEVER returned — not the
raw value and not its hash. The client learns which row is current from
`is_current`, computed server-side by comparing the presented token's digest.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user/sessions", tags=["sessions"])


async def _current_user(request: Request):
    """Session/JWT auth only.

    An API key must not be able to read the session list or revoke sessions: an
    extension credential that can end the owner's browser sessions is a denial
    of service, and the list itself reveals where the account is being used.
    """
    from .security import get_current_user, require_session_auth
    user = await get_current_user(request=request)
    require_session_auth(request)
    return user


def _coarse_ua(ua: str | None) -> str:
    """A readable device label — never the full agent string.

    The full UA is a fingerprint; a person deciding "is this me?" needs
    "Chrome on Linux", not 200 characters of build numbers.
    """
    if not ua:
        return "Unknown device"
    u = ua.lower()
    browser = (
        "Edge" if "edg/" in u else
        "Chrome" if "chrome/" in u and "chromium" not in u else
        "Firefox" if "firefox/" in u else
        "Safari" if "safari/" in u and "chrome" not in u else
        "Mobile app" if "helpotron" in u else
        "Browser"
    )
    os_name = (
        "Windows" if "windows" in u else
        "macOS" if "mac os" in u or "macintosh" in u else
        "Android" if "android" in u else
        "iOS" if "iphone" in u or "ipad" in u else
        "Linux" if "linux" in u else
        ""
    )
    return f"{browser} on {os_name}".strip() if os_name else browser


def _presented_token(request: Request) -> str | None:
    """The token this request arrived with — cookie first, then Bearer."""
    token = request.cookies.get("helpotron_session")
    if token:
        return token
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def _shape(row, current_id: int | None) -> Dict[str, Any]:
    return {
        "id": row.id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        "device": _coarse_ua(row.user_agent),
        "ip": row.ip,
        "is_current": row.id == current_id,
    }


@router.get("")
async def list_sessions(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    user = await _current_user(request)
    from .database import UserSession
    from .security import _hash_token

    token = _presented_token(request)
    digest = _hash_token(token) if token else None

    rows = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id)
        .order_by(UserSession.created_at.desc())
        .all()
    )
    current = next((r for r in rows if digest and r.token == digest), None)
    return {
        "status": "success",
        "current_session_id": current.id if current else None,
        "sessions": [_shape(r, current.id if current else None) for r in rows],
    }


@router.delete("/{session_id}")
async def revoke_session(session_id: int, request: Request,
                         db: Session = Depends(get_db)) -> Dict[str, Any]:
    """End one of the caller's sessions.

    Ownership is enforced in the query, not by loading a row and comparing after
    — a foreign id must be indistinguishable from a missing one, or the error
    tells an attacker which ids exist.
    """
    user = await _current_user(request)
    from .database import UserSession

    row = (
        db.query(UserSession)
        .filter(UserSession.id == session_id, UserSession.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "session not found")
    db.delete(row)
    db.commit()
    return {"status": "success", "revoked": session_id}


@router.post("/revoke-others")
async def revoke_others(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Sign out everywhere except here. Keeps the session making the request."""
    user = await _current_user(request)
    from .database import UserSession

    token = _presented_token(request)
    if not token:
        raise HTTPException(400, "no session token presented")

    rows = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id)
        .all()
    )
    # Resolve the caller's own row the same way every other lookup does, so a
    # legacy un-hashed row is kept rather than deleted by its own request.
    from .security import SessionStore
    current = SessionStore._find(db, token)
    if current is None:
        raise HTTPException(401, "current session not found")

    revoked = 0
    for r in rows:
        if r.id != current.id:
            db.delete(r)
            revoked += 1
    db.commit()
    return {"status": "success", "revoked": revoked}
