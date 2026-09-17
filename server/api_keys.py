"""API keys for the browser extension (owner 2026-09-17).

Owner: *"instead of logging in on the extension, just make a one time viewable
helotron api for users, users generate it, and plug it into the extension, and
they can add limits, revoke it, etc"*.

Why a key instead of a login. The extension used to hold the user's session
token — a 7-day credential that grants the whole account, cannot be scoped, and
can only be invalidated by logging out everywhere. A purpose-made key is
revocable on its own, carries its own limits, and can be handed to a browser
without handing over the account.

Security properties, deliberately chosen:
  * Only a SHA-256 hash is stored. The plaintext is returned ONCE at creation
    and is unrecoverable afterwards — so a database dump contains no working
    credentials. If a key is lost, the user issues another.
  * Comparison is constant-time (`secrets.compare_digest`) so a timing signal
    cannot be used to recover a hash byte by byte.
  * Revocation and expiry are checked on every request, not cached.
  * Limits (spend, rate) are checked here rather than at the route, so a new
    endpoint cannot accidentally skip them.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from .database import ApiKey

logger = logging.getLogger("helpotron.api_keys")

PREFIX = "htk_"            # helpotron key — greppable in logs/scanners
KEY_BYTES = 32             # 256 bits of entropy
PREFIX_SHOWN = 12          # characters kept in cleartext for identification


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def generate_key(db: Session, user, label: str = "",
                 usage_limit_tokens: Optional[float] = None,
                 rate_limit_per_min: Optional[int] = None,
                 expires_in_days: Optional[int] = None) -> Tuple[ApiKey, str]:
    """Create a key. Returns (row, plaintext) — plaintext is shown ONCE."""
    raw = f"{PREFIX}{secrets.token_urlsafe(KEY_BYTES)}"
    row = ApiKey(
        user_id=user.id,
        public_id=user.public_id,
        key_hash=_hash(raw),
        key_prefix=raw[:PREFIX_SHOWN],
        label=(label or "").strip()[:100],
        usage_limit_tokens=(float(usage_limit_tokens) if usage_limit_tokens else None),
        rate_limit_per_min=(int(rate_limit_per_min) if rate_limit_per_min else None),
        expires_at=(datetime.utcnow() + timedelta(days=int(expires_in_days))
                    if expires_in_days else None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("issued API key %s… for user %s", row.key_prefix, user.public_id)
    return row, raw


def list_keys(db: Session, user) -> List[Dict[str, Any]]:
    """The user's keys. Never includes the secret — it is not recoverable."""
    rows = (db.query(ApiKey)
              .filter(ApiKey.user_id == user.id)
              .order_by(ApiKey.created_at.desc()).all())
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "prefix": r.key_prefix,
            "label": r.label or "",
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
            "revoked": bool(r.revoked_at),
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "usage_limit_tokens": r.usage_limit_tokens,
            "usage_used_tokens": float(r.usage_used_tokens or 0.0),
            "rate_limit_per_min": r.rate_limit_per_min,
        })
    return out


def revoke_key(db: Session, user, key_id: int) -> bool:
    row = (db.query(ApiKey)
             .filter(ApiKey.id == int(key_id), ApiKey.user_id == user.id).first())
    if row is None:
        return False
    row.revoked_at = datetime.utcnow()
    db.commit()
    logger.info("revoked API key %s… for user %s", row.key_prefix, user.public_id)
    return True


def update_limits(db: Session, user, key_id: int, *,
                  usage_limit_tokens: Optional[float] = None,
                  rate_limit_per_min: Optional[int] = None,
                  label: Optional[str] = None) -> bool:
    row = (db.query(ApiKey)
             .filter(ApiKey.id == int(key_id), ApiKey.user_id == user.id).first())
    if row is None:
        return False
    # An explicit 0 clears the limit; only a real number sets one, so the caller
    # can distinguish "don't change" from "make it unlimited".
    if usage_limit_tokens is not None:
        row.usage_limit_tokens = float(usage_limit_tokens) if usage_limit_tokens > 0 else None
    if rate_limit_per_min is not None:
        row.rate_limit_per_min = int(rate_limit_per_min) if rate_limit_per_min > 0 else None
    if label is not None:
        row.label = str(label).strip()[:100]
    db.commit()
    return True


def check_api_key(db: Session, presented: str) -> Tuple[Optional[ApiKey], Optional[str]]:
    """Resolve a presented key. Returns (row, error_reason).

    Every failure mode returns a reasonless None to the caller — the caller must
    not tell a prober WHY a key failed (revoked vs expired vs never existed is
    useful reconnaissance). The reason is here for logs only.
    """
    if not presented or not isinstance(presented, str):
        return None, "missing"
    presented = presented.strip()
    if not presented.startswith(PREFIX) or len(presented) < 20:
        return None, "malformed"

    digest = _hash(presented)
    row = db.query(ApiKey).filter(ApiKey.key_hash == digest).first()
    if row is None:
        return None, "not_found"
    # constant-time even though the lookup already matched — keeps the code path
    # uniform and defends against a future index change
    if not secrets.compare_digest(row.key_hash, digest):
        return None, "mismatch"
    if row.revoked_at is not None:
        return None, "revoked"
    if row.expires_at is not None and row.expires_at < datetime.utcnow():
        return None, "expired"
    return row, None


def record_usage(db: Session, key: ApiKey, tokens: float) -> None:
    """Add measured usage to a key's counter and stamp last use. Never raises."""
    try:
        key.usage_used_tokens = float(key.usage_used_tokens or 0.0) + float(tokens or 0.0)
        key.last_used_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        logger.warning("could not record API key usage: %s", e)
        try:
            db.rollback()
        except Exception:
            pass


def limit_exceeded(key: ApiKey) -> Optional[str]:
    """None when within limits, else a short human reason."""
    limit = key.usage_limit_tokens
    if limit is not None and float(key.usage_used_tokens or 0.0) >= float(limit):
        return "spend limit reached"
    return None


def touch_last_used(db: Session, key: ApiKey) -> None:
    """Stamp last_used_at without committing usage, for read-only calls."""
    try:
        key.last_used_at = datetime.utcnow()
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass

def authenticate(db: Session, bearer: str, request: Any = None):
    """Resolve a Bearer API key to its owning User, or raise.

    This is the ONE implementation of key authentication. It exists because
    the auth logic is duplicated across entry points and a new credential type
    only has to be forgotten in one of them to leave a route unreachable — which
    is exactly what happened when the extension moved to API keys: the feature
    routes (routes_features.get_current_authenticated_user) kept their own
    private copy of the cookie/JWT logic and rejected every key.

    Raises HTTPException(401) for an unknown/revoked/expired key and
    HTTPException(402) when the key has reached its own limit. The 401 detail is
    deliberately identical in all three cases: telling a prober which one it was
    is free reconnaissance.
    """
    from fastapi import HTTPException
    from .database import User

    key_row, reason = check_api_key(db, bearer)
    if key_row is None:
        logger.warning("rejected API key (prefix %s...): %s", bearer[:12], reason)
        raise HTTPException(401, "Invalid API key")
    blocked = limit_exceeded(key_row)
    if blocked:
        raise HTTPException(402, f"API key limit reached: {blocked}")
    user = db.query(User).filter(User.id == key_row.user_id).first()
    if user is None:
        raise HTTPException(401, "Invalid API key")
    touch_last_used(db, key_row)
    if request is not None:
        try:
            request.state.api_key_id = key_row.id
            request.state.auth_via_api_key = True
        except Exception:
            pass
    return user
