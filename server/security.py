"""Security utilities for Helpotron — JWT auth, PBKDF2 hashing, rate limiting,
session store, security headers.

Remediation BATCH-01/02 fixer pass (2026-08-21): the plan's JWT section was
written on top of a cleaned-down security.py that had lost the helper surface
the rest of the app imports (hash_password, verify_password, SessionStore,
validate_*, auth_limiter, get_current_user, ...) — main.py and the route
modules import those names and the app would not import. This is the full
merged surface: the JWT section is the plan's hardened version; the rest is
restored from the pre-plan implementation, with require_admin dropped
(main.py imports the hardened one from server.admin) and get_current_user
hardened to never accept X-Public-ID as an identity.
"""
from __future__ import annotations

import hashlib
import jwt
import logging
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

try:
    from .config import config
except (ImportError, ValueError):
    from server.config import config


logger = logging.getLogger('helpotron.security')

JWT_SECRET = getattr(config, 'JWT_SECRET', 'helpotron_production_super_secret_key_change_me_in_env')
JWT_ALGORITHM = getattr(config, 'JWT_ALGORITHM', 'HS256')
JWT_EXPIRATION_HOURS = 24


def create_jwt_token(user_id: Any, role: str = 'user', expires_delta: Optional[timedelta] = None) -> str:
    if isinstance(user_id, dict):
        role = user_id.get('role', role)
        user_id = user_id.get('sub', 1)
    # Ensure user_id sub is int if digit or string
    sub_val = int(user_id) if str(user_id).isdigit() else str(user_id)
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=JWT_EXPIRATION_HOURS))
    payload = {
        'sub': sub_val,
        'role': role,
        'exp': expire,
        'iat': datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


create_access_token = create_jwt_token



def verify_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={'verify_exp': True, 'verify_signature': True, 'verify_sub': False}
            # verify_sub=False: PyJWT>=2.10 rejects integer `sub` claims by
            # default ("Subject must be a string"), but the app contract (and
            # the remediation plan's verification) uses `sub` as the int user
            # id — `User.id == payload['sub']` queries need the int form.
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning('Expired JWT token signature presented')
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f'Invalid JWT token presented: {e}')
        return None

# ─── password hashing ──────────────────────────────────────────────────────

def hash_password(password: str) -> tuple[str, str]:
    """Hash a password using PBKDF2 with a random salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return key.hex(), salt


def verify_password(password: str, hash_hex: str, salt: str) -> bool:
    """Verify a password against a stored hash and salt."""
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return key.hex() == hash_hex

# ─── rate limiting ────────────────────────────────────────────────────────

class RateLimiter:
    """Rate limiter with per-key sliding windows plus auth-failure
    exponential backoff (5 failures → lockout, doubling up to 2^15 s)."""
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: Dict[str, list[float]] = {}
        self._failures: Dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        if key not in self._requests:
            self._requests[key] = []
        requests = [t for t in self._requests[key] if t > window_start]
        if len(requests) >= self.max_requests:
            return False
        requests.append(now)
        self._requests[key] = requests
        return True

    def check_auth(self, key: str) -> tuple[bool, int]:
        """Return (allowed, wait_seconds) for auth attempts; too many recent
        failures lock the key out with exponential backoff."""
        now = time.time()
        hour_ago = now - 3600
        recent_failures = [t for t in self._failures.get(key, []) if t > hour_ago]
        if len(recent_failures) >= 5:
            wait = 2 ** min(len(recent_failures) - 5, 15)
            return False, wait
        return True, 0

    def log_failure(self, key: str) -> None:
        now = time.time()
        if key not in self._failures:
            self._failures[key] = []
        self._failures[key] = [t for t in self._failures[key] if now - t < 3600]
        self._failures[key].append(now)

    def reset_failures(self, key: str) -> None:
        self._failures.pop(key, None)


# Shared instance for the auth endpoints (login lockout, exponential backoff).
auth_limiter = RateLimiter(max_requests=10, window_seconds=60)

# ─── input validation ──────────────────────────────────────────────────────

def sanitize_input(text: str, max_length: int = 10000) -> str:
    """Sanitize user input: strip, limit length, remove dangerous patterns."""
    if not text:
        return ""
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    text = text.strip()
    if len(text) > max_length:
        text = text[:max_length]
    return text


ADMIN_PUBLIC_ID = getattr(config, 'admin_public_id', 'RoniDev')

RESERVED_PUBLIC_IDS = {"admin", "administrator", "root", "superuser", "super_admin"}


def validate_public_id(public_id: str) -> bool:
    """Validate a public ID: alphanumeric, underscore, hyphen, 3-64 chars.
    Reserved admin-ish names are rejected so no user can register a
    privileged-looking identity (remediation: admin is config-only)."""
    if not bool(re.match(r'^[A-Za-z0-9_-]{3,64}$', public_id)):
        return False
    low = public_id.lower()
    return low not in RESERVED_PUBLIC_IDS and low != ADMIN_PUBLIC_ID.lower()


def validate_password_strength(password: str) -> bool:
    """Validate password: minimum 8 chars, at least one letter and one number."""
    if len(password) < 8:
        return False
    if not re.search(r'[A-Za-z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    return True

# ─── session store ────────────────────────────────────────────────────────

SESSION_COOKIE_NAME = "helpotron_session"


class SessionStore:
    """Persistent session store backed by the database.

    Sessions survive server restarts and can be revoked per-user.
    """
    _session_expiry: int = 7 * 24 * 60 * 60

    @classmethod
    def create_session(cls, user_id: int, public_id: str) -> str:
        from .database import SessionLocal, UserSession
        token = secrets.token_urlsafe(48)
        db = SessionLocal()
        try:
            session = UserSession(
                token=token,
                user_id=user_id,
                public_id=public_id,
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=cls._session_expiry),
            )
            db.add(session)
            db.commit()
        finally:
            db.close()
        return token

    @classmethod
    def get_session(cls, token: str) -> dict | None:
        from .database import SessionLocal, UserSession
        db = SessionLocal()
        try:
            session = db.query(UserSession).filter(UserSession.token == token).first()
            if not session:
                return None
            # Some rows store naive UTC, some aware (legacy writes) — normalize
            # both sides to naive UTC so the comparison never type-errors.
            expires = session.expires_at
            if expires is not None and expires.tzinfo is not None:
                expires = expires.astimezone(timezone.utc).replace(tzinfo=None)
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            if expires is None or expires < now:
                db.delete(session)
                db.commit()
                return None
            return {
                'user_id': session.user_id,
                'public_id': session.public_id,
                'created_at': session.created_at.isoformat(),
                'expires_at': session.expires_at.isoformat(),
            }
        finally:
            db.close()

    @classmethod
    def delete_session(cls, token: str) -> None:
        from .database import SessionLocal, UserSession
        db = SessionLocal()
        try:
            session = db.query(UserSession).filter(UserSession.token == token).first()
            if session:
                db.delete(session)
                db.commit()
        finally:
            db.close()

    @classmethod
    def refresh_session(cls, token: str) -> bool:
        from .database import SessionLocal, UserSession
        db = SessionLocal()
        try:
            session = db.query(UserSession).filter(UserSession.token == token).first()
            if not session:
                return False
            session.expires_at = datetime.now(timezone.utc) + timedelta(seconds=cls._session_expiry)
            db.commit()
            return True
        finally:
            db.close()

    @classmethod
    def get_all_sessions(cls) -> dict:
        from .database import SessionLocal, UserSession
        db = SessionLocal()
        try:
            sessions = db.query(UserSession).all()
            return {
                s.token: {
                    'user_id': s.user_id,
                    'public_id': s.public_id,
                    'created_at': s.created_at.isoformat(),
                    'expires_at': s.expires_at.isoformat(),
                }
                for s in sessions
            }
        finally:
            db.close()

    @classmethod
    def revoke_all_sessions(cls, user_id: int) -> int:
        from .database import SessionLocal, UserSession
        db = SessionLocal()
        try:
            sessions = db.query(UserSession).filter(UserSession.user_id == user_id).all()
            count = len(sessions)
            for s in sessions:
                db.delete(s)
            db.commit()
            return count
        finally:
            db.close()

# ─── security headers middleware ─────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        csp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http://localhost:5173 http://localhost:8000"
        response.headers["Content-Security-Policy"] = csp
        if not config.debug:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response

# ─── user authentication ──────────────────────────────────────────────────

async def get_current_user(request: Request):
    """Authenticate via session cookie or Bearer JWT. Hardened (remediation):
    the X-Public-ID header / public_id query fallback is gone — a forged
    header must never become an identity."""
    from .database import get_db, User
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        session = SessionStore.get_session(token)
        if session:
            SessionStore.refresh_session(token)
            db = next(get_db())
            user = db.query(User).filter(User.id == session['user_id']).first()
            if user:
                return user

    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        payload = verify_jwt_token(auth_header.split(" ", 1)[1])
        if payload and 'sub' in payload:
            db = next(get_db())
            user = db.query(User).filter(User.id == payload['sub']).first()
            if user:
                return user

    raise HTTPException(401, "Not authenticated: valid session token required")


async def get_current_user_optional(request: Request):
    try:
        return await get_current_user(request)
    except Exception:
        return None


def is_admin_user(user) -> bool:
    return getattr(user, 'public_id', '') == ADMIN_PUBLIC_ID

# ─── bot protection ──────────────────────────────────────────────────────

def is_bot(user_agent: str | None) -> bool:
    if not user_agent:
        return True
    bot_patterns = [
        r'bot', r'crawler', r'spider', r'scraper', r'scan', r'headless',
        r'curl', r'wget', r'python-requests', r'urllib', r'go-http',
        r'java', r'perl', r'ruby', r'php', r'libwww', r'httpie',
    ]
    user_agent_lower = user_agent.lower()
    for pattern in bot_patterns:
        if re.search(pattern, user_agent_lower):
            return True
    return False
