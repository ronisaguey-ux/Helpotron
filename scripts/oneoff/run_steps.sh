#!/bin/bash
set -ex
cd /home/roni/Roni_workspace/helpotron
source .venv/bin/activate

# STEP 01
python3 -c "from fastapi.testclient import TestClient; from server.main import app; client = TestClient(app); res = client.get('/api/admin/stats'); print('Status:', res.status_code); assert res.status_code == 401" || true

cat << 'INNER_EOF' > /tmp/step1_part1.py
"""Security utilities for Helpotron - input validation, rate limiting, headers, password hashing."""
from __future__ import annotations

import hashlib
import jwt
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Any

from fastapi import HTTPException, Request, Response, Depends
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from .config import config, JWT_SECRET, JWT_ALGORITHM

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

# ─── JWT helpers ──────────────────────────────────────────────────────────

def verify_jwt_token(token: str) -> dict | None:
    """Decode and validate a JWT token. Returns payload dict or None on failure."""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM or 'HS256'],
            options={'verify_exp': True, 'verify_signature': True}
        )
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def create_jwt_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM or 'HS256')

# ─── rate limiting ────────────────────────────────────────────────────────

class RateLimiter:
    """Basic in-memory sliding window rate limiter."""
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: Dict[str, list[float]] = {}

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


class AdaptiveRateLimiter(RateLimiter):
    """Adaptive rate limiter with exponential backoff on repeated failures."""
    def __init__(self, max_requests: int, window_seconds: int):
        super().__init__(max_requests, window_seconds)
        self._failures: Dict[str, list[float]] = {}

    def check_auth(self, key: str) -> tuple[bool, int]:
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
auth_limiter = AdaptiveRateLimiter(max_requests=10, window_seconds=60)

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


def validate_public_id(public_id: str) -> bool:
    """Validate a public ID: alphanumeric, underscore, hyphen, 3-64 chars."""
    return bool(re.match(r'^[A-Za-z0-9_-]{3,64}$', public_id))


def validate_password_strength(password: str) -> bool:
    """Validate password: minimum 8 chars, at least one letter and one number."""
    if len(password) < 8:
        return False
    if not re.search(r'[A-Za-z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    return True

def is_admin_user(user_id: str) -> bool:
    """Check if user is admin by public_id."""
    from .config import config
    admin_ids = getattr(config, 'admin_ids', [])
    if isinstance(admin_ids, str):
        admin_ids = [x.strip() for x in admin_ids.split(',') if x.strip()]
    return user_id in admin_ids

# ─── session store ────────────────────────────────────────────────────────

SESSION_COOKIE_NAME = "helpotron_session"
INNER_EOF

sed -n '120,$p' server/security.py > /tmp/step1_part2.py
cat /tmp/step1_part1.py /tmp/step1_part2.py > server/security.py
git add -A && git commit -m "fix(remediation): STEP-01 - Clean security.py JWT structure" || true

