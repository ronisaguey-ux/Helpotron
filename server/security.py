"""Security module: password hashing, rate limiting, session management, CORS, and production hardening.

For VPS + domain deployment.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple

from fastapi import Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .config import config

# ─── password hashing (bcrypt-style, no external lib) ────────────────────

SALT_LENGTH = 32
HASH_ITERATIONS = 100000
HASH_LENGTH = 64

def hash_password(password: str, salt: Optional[bytes] = None) -> Tuple[str, str]:
    """Return (hashed_password, salt_hex) for storage."""
    if salt is None:
        salt = secrets.token_bytes(SALT_LENGTH)
    salt_hex = salt.hex()
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        HASH_ITERATIONS,
        HASH_LENGTH
    )
    return hashed.hex(), salt_hex

def verify_password(password: str, hashed_hex: str, salt_hex: str) -> bool:
    """Verify a password against its stored hash and salt."""
    salt = bytes.fromhex(salt_hex)
    hashed, _ = hash_password(password, salt)
    return hmac.compare_digest(hashed, hashed_hex)

# ─── session management ────────────────────────────────────────────────────

class SessionStore:
    """In-memory session store with expiration."""
    _sessions: Dict[str, dict] = {}

    @classmethod
    def create_session(cls, user_id: int, public_id: str) -> str:
        """Create a new session token."""
        token = secrets.token_urlsafe(48)
        cls._sessions[token] = {
            'user_id': user_id,
            'public_id': public_id,
            'created_at': datetime.now(timezone.utc),
            'expires_at': datetime.now(timezone.utc) + timedelta(days=7),
        }
        return token

    @classmethod
    def get_session(cls, token: str) -> Optional[dict]:
        session = cls._sessions.get(token)
        if session and session['expires_at'] < datetime.now(timezone.utc):
            del cls._sessions[token]
            return None
        return session

    @classmethod
    def delete_session(cls, token: str) -> None:
        if token in cls._sessions:
            del cls._sessions[token]

# ─── rate limiting ────────────────────────────────────────────────────────

class RateLimiter:
    """Token bucket rate limiter per IP/public_id."""
    def __init__(self, rate: int, window: int = 60):
        self.rate = rate
        self.window = window
        self.buckets: Dict[str, dict] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        bucket = self.buckets.get(key)
        if not bucket:
            self.buckets[key] = {'tokens': self.rate - 1, 'last': now}
            return True
        elapsed = now - bucket['last']
        bucket['tokens'] = min(self.rate, bucket['tokens'] + elapsed * (self.rate / self.window))
        bucket['last'] = now
        if bucket['tokens'] >= 1:
            bucket['tokens'] -= 1
            return True
        return False

# ─── middleware ───────────────────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to responses."""
    async def dispatch(self, request: Request, call_next):
        # Skip security headers for OPTIONS requests
        if request.method == "OPTIONS":
            return await call_next(request)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:;"
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
        response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=(), payment=()'
        return response

# ─── dependencies ─────────────────────────────────────────────────────────

from fastapi import Header, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .database import User, get_db

SESSION_COOKIE_NAME = 'helpotron_session'

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Dependency to get the current authenticated user from the session cookie."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = SessionStore.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = db.query(User).filter(User.id == session['user_id']).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Optional dependency for endpoints that can work without authentication."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    session = SessionStore.get_session(token)
    if not session:
        return None
    return db.query(User).filter(User.id == session['user_id']).first()

# ─── admin auth ─────────────────────────────────────────────────────────

def is_admin_user(user: User) -> bool:
    """Check if a user is the admin."""
    return user.public_id == config.admin_public_id

def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require admin privileges."""
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ─── security settings for production ──────────────────────────────────

SECURE_COOKIE = True
SECURE_HSTS = True

def get_session_config() -> dict:
    """Get session configuration for FastAPI's SessionMiddleware."""
    return {
        'secret_key': config.session_secret or secrets.token_urlsafe(32),
        'session_cookie': SESSION_COOKIE_NAME,
        'max_age': 7 * 24 * 60 * 60,
        'same_site': 'lax',
        'secure': config.production_mode,
        'httponly': True,
    }
