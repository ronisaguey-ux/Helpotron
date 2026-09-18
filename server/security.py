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
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from starlette.websockets import WebSocket

try:
    from .config import config
except (ImportError, ValueError):
    from server.config import config


logger = logging.getLogger('helpotron.security')
ADMIN_PUBLIC_ID = getattr(config, 'admin_public_id', 'RoniDev')

JWT_SECRET = getattr(config, 'jwt_secret', getattr(config, 'JWT_SECRET', os.getenv('JWT_SECRET', 'helpotron_jwt_secret_dev_key_32chars')))
JWT_ALGORITHM = getattr(config, 'algorithm', getattr(config, 'JWT_ALGORITHM', 'HS256'))
JWT_EXPIRATION_HOURS = 24

KNOWN_INSECURE_SECRETS = {
    'dev-insecure-secret-key-change-in-prod-32bytesmin',
    'helpotron_jwt_secret_dev_key_32chars',
    'helpotron_super_secret_jwt_signing_key_min_32_chars',
    'helpotron_super_secret_jwt_signing_key_for_docker_local_32chars',
    'helpotron_super_secret_session_key_min_32_characters',
    'secret',
    'changeme',
}

import uuid

_REVOKED_JWT_JTIS: set[str] = set()
_USER_JWT_REVOKED_BEFORE: dict[Any, float] = {}


def revoke_jwt_jti(jti: str) -> None:
    if jti:
        _REVOKED_JWT_JTIS.add(str(jti))


def revoke_user_jwts(user_id: Any) -> None:
    now_ts = time.time()
    _USER_JWT_REVOKED_BEFORE[user_id] = now_ts
    _USER_JWT_REVOKED_BEFORE[str(user_id)] = now_ts


if getattr(config, 'production_mode', False):
    if not JWT_SECRET or JWT_SECRET in KNOWN_INSECURE_SECRETS or len(JWT_SECRET) < 32 or JWT_SECRET.startswith('dev-') or 'change_me' in JWT_SECRET:
        raise RuntimeError("Production mode requires secure non-default JWT_SECRET in environment")


def create_jwt_token(user_id: Any, role: str = 'user', expires_delta: Optional[timedelta] = None) -> str:
    if isinstance(user_id, dict):
        role = user_id.get('role', role)
        user_id = user_id.get('sub', 1)
    # Ensure user_id sub is int if digit or string
    sub_val = int(user_id) if str(user_id).isdigit() else str(user_id)
    iat_ts = time.time()
    expire_ts = iat_ts + (expires_delta.total_seconds() if expires_delta else JWT_EXPIRATION_HOURS * 3600)
    payload = {
        'sub': sub_val,
        'role': role,
        'exp': expire_ts,
        'iat': iat_ts,
        'jti': uuid.uuid4().hex,
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
        jti = payload.get('jti')
        if jti and str(jti) in _REVOKED_JWT_JTIS:
            logger.warning('Revoked JWT token presented (jti %s)', jti)
            return None
        sub = payload.get('sub')
        iat = payload.get('iat')
        if sub is not None:
            rev_ts = _USER_JWT_REVOKED_BEFORE.get(sub) or _USER_JWT_REVOKED_BEFORE.get(str(sub))
            if rev_ts is not None:
                iat_ts = iat.timestamp() if isinstance(iat, datetime) else float(iat or 0.0)
                if iat_ts <= rev_ts:
                    logger.warning('Revoked JWT presented for user %s (issued before revocation)', sub)
                    return None
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

    def check_ip_auth(self, key: str, max_failures: int = 5,
                      window_seconds: float = 60.0) -> tuple[bool, int]:
        """Per-IP login throttle (audit 08-28, LOW): count only FAILED
        attempts in a sliding window. Returns (allowed, retry_after_seconds)
        so the caller can emit a 429 with Retry-After. Completely independent
        of check_auth's per-account exponential backoff — both stay active:
        the account limiter stops 5 bad logins against ONE account, this one
        stops 12 bad logins across 12 different accounts from one client."""
        now = time.time()
        cutoff = now - window_seconds
        recent = [t for t in self._failures.get(key, []) if t > cutoff]
        if len(recent) >= max_failures:
            return False, max(1, int(window_seconds - (now - recent[0])))
        return True, 0

    def log_failure(self, key: str, window_seconds: float = 3600.0) -> None:
        now = time.time()
        if key not in self._failures:
            self._failures[key] = []
        self._failures[key] = [t for t in self._failures[key] if now - t < window_seconds]
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


COMMON_BREACHED_PASSWORDS = {
    "password", "12345678", "password123", "password1", "admin123", "qwerty123",
    "passw0rd123", "passw0rd", "helpotron123", "welcome123", "letmein123",
    "changeme123", "123456789", "1234567890", "iloveyou1", "sunshine1", "princess1"
}


def validate_password_strength(password: str) -> bool:
    """Validate password: minimum 8 chars, at least one letter and one number, not common breached."""
    if not password or len(password) < 8:
        return False
    if password.lower() in COMMON_BREACHED_PASSWORDS:
        return False
    if not re.search(r'[A-Za-z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    return True

# ─── session store ────────────────────────────────────────────────────────

SESSION_COOKIE_NAME = "helpotron_session"

# API keys carry this prefix so they are unambiguously distinguishable
# from a JWT or a DB session token (see server/api_keys.py).
_API_KEY_PREFIX = "htk_"


class SessionStore:
    """Persistent session store backed by the database.

    Sessions survive server restarts and can be revoked per-user.
    """
    _session_expiry: int = 7 * 24 * 60 * 60

    @classmethod
    def create_session(cls, user_id: int, public_id: str, expiry_seconds: Optional[int] = None) -> str:
        from .database import SessionLocal, UserSession
        token = secrets.token_urlsafe(48)
        db = SessionLocal()
        duration = expiry_seconds if expiry_seconds is not None else cls._session_expiry
        try:
            session = UserSession(
                token=token,
                user_id=user_id,
                public_id=public_id,
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=duration),
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
        revoke_user_jwts(user_id)
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
    """Security headers on EVERY response — API, static assets, and the SPA.

    Registered in server/main.py (this class sat unused before audit 08-28 —
    it was defined but never added to the app, so no response carried any of
    it). Policy decisions:

    * CSP is the built SPA's real policy: the bundled JS comes from 'self'
      (Vite emits module scripts under /assets); the Inter font is hosted on
      Google Fonts (index.html preconnects to fonts.googleapis.com /
      fonts.gstatic.com); the bundle injects inline styles, so style-src
      allows 'unsafe-inline'; images may be data:/blob: (thumbnails, PDF
      previews); connect-src is 'self' (same-origin fetch + ws://same-host
      for /ws/agent/*). The framework docs pages (/docs, /redoc) are exempt —
      Swagger UI is loaded from a third-party CDN with inline bootstrap
      scripts, which a strict 'self' policy would break.
    * X-Frame-Options DENY + frame-ancestors 'none' (belt and braces;
      browsers that ignore the legacy header honor frame-ancestors).
    * Permissions-Policy is minimal but deliberately leaves microphone
      unlisted: the SPA's lecture recorder uses navigator.mediaDevices
      .getUserMedia({audio:true}) and a mic lock would kill that feature.
    * HSTS only when the request is actually secure: this box also serves
      plain HTTP (localhost / demo), and HSTS must never be emitted over
      HTTP (it is ignored there, and 'includeSubDomains' would still be wrong
      to advertise on an untrusted connection).
    """

    CSP = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; "
        # blob: audio: the SPA plays the /api/voice/tts response through
        # new Audio(URL.createObjectURL(...)) — default-src would block it.
        "media-src 'self' blob:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'"
    )
    PERMISSIONS_POLICY = "camera=(), geolocation=(), payment=(), usb=(), display-capture=()"
    # Framework doc pages load Swagger UI from a CDN with inline scripts —
    # exempt them from the strict CSP only (the other headers still apply).
    CSP_EXEMPT_PATHS = {"/docs", "/redoc", "/docs/", "/redoc/"}
    HSTS_VALUE = "max-age=31536000; includeSubDomains"

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = self.PERMISSIONS_POLICY
        if request.url.path not in self.CSP_EXEMPT_PATHS and "Content-Security-Policy" not in response.headers:
            response.headers["Content-Security-Policy"] = self.CSP
        if request.url.is_secure:
            response.headers["Strict-Transport-Security"] = self.HSTS_VALUE
        return response

# ─── user authentication ──────────────────────────────────────────────────

def is_user_banned(user) -> bool:
    """Ban enforcement (operator 08-27): settings['banned'] is only honored
    while effective — a 'banned_until' stamp in the past counts as expired.
    Also used directly by login/me endpoints for a clean 403."""
    if user is None:
        return False
    settings = getattr(user, "settings", None) or {}
    if not settings.get("banned"):
        return False
    until = settings.get("banned_until")
    if not until:
        return True  # permanent ban
    try:
        until_dt = datetime.fromisoformat(str(until))
        if until_dt.tzinfo is not None:
            until_dt = until_dt.astimezone(timezone.utc).replace(tzinfo=None)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return until_dt > now
    except (TypeError, ValueError):
        return True


def _enforce_not_banned(user):
    """Raises 403 immediately after a successful user lookup."""
    if user is not None and is_user_banned(user):
        raise HTTPException(403, "Account suspended by the operator")
    return _bind_metering(user)


def _bind_metering(user):
    """Bind the paying account for usage metering (owner 2026-09-17).

    Every authenticated request funnels through here, so this is the one place
    that can guarantee "every process costs tokens": anything deep in the call
    tree that spends money calls metering.record_service_cost() and the cost is
    attributed to this account without threading a user id through every
    signature. The AI detectors are the motivating case — they are several frames
    below the handler and previously billed for nothing.

    Safe by construction: set in the request's own asyncio task, so the binding
    is discarded when that task ends and can never leak into a concurrent
    request. A failure here must never block authentication.
    """
    try:
        from .metering import set_meter_user
        if user is not None:
            set_meter_user(getattr(user, "public_id", None))
    except Exception:
        pass
    return user


async def get_current_user(request: Request = None, websocket: WebSocket = None):
    """Authenticate via session cookie, Bearer JWT/session token, or WebSocket
    token query param. Hardened: the X-Public-ID header is never an identity.
    Banned accounts (ban / tempban) are rejected here — one choke point."""
    # 09-02: /api/me documented the Bearer session-token contract for API
    # clients (login response) but authenticated cookie-only — the extension
    # got 401 and forced a website re-login. It now goes through this route.
    conn = request or websocket
    if conn is None:
        raise HTTPException(401, "Not authenticated: valid session token required")
    from .database import SessionLocal, User
    token = conn.cookies.get(SESSION_COOKIE_NAME)
    if token:
        session = SessionStore.get_session(token)
        if session:
            SessionStore.refresh_session(token)
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.id == session['user_id']).first()
                if user:
                    return _enforce_not_banned(user)
            finally:
                db.close()

    auth_header = conn.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        bearer = auth_header.split(" ", 1)[1]

        # ── API key (owner 2026-09-17) ──────────────────────────────────────
        # The extension authenticates with a user-issued key instead of a
        # login. Checked FIRST because the prefix makes it unambiguous and
        # cheap — no JWT parse, no session lookup — and because a key must
        # never be mistaken for a session token by a future format change.
        #
        # A key is deliberately limited even though it authenticates as the
        # user: it cannot mint another key, change the password, or touch
        # billing. Those routes call require_session_auth().
        if bearer.startswith(_API_KEY_PREFIX):
            db = SessionLocal()
            try:
                from . import api_keys as _keys
                user = _keys.authenticate(db, bearer, request)
                return _enforce_not_banned(user)
            finally:
                db.close()

        payload = verify_jwt_token(bearer)
        if payload and 'sub' in payload:
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.id == payload['sub']).first()
                if user:
                    return _enforce_not_banned(user)
            finally:
                db.close()
        # Long-lived DB-backed session token (the same token the web UI's
        # helpotron_session cookie carries, and what the browser extension
        # stores after login — the 24h JWT above forced daily re-logins).
        # Survives server restarts and slides its 7-day window on use.
        session = SessionStore.get_session(bearer)
        if session:
            SessionStore.refresh_session(bearer)
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.id == session['user_id']).first()
                if user:
                    return _enforce_not_banned(user)
            finally:
                db.close()

    # Query-string tokens on WebSockets are disallowed (AUTH-07) to prevent
    # credential leakage into access logs, browser history, and Referer headers.
    if websocket is not None:
        query_params = getattr(conn, "query_params", {})
        query_token = query_params.get("token")
        if query_token:
            logger.warning("Rejected query string token on WebSocket handshake (AUTH-07)")
            raise HTTPException(401, "Query string tokens are not permitted on WebSockets; use headers or cookies")

    raise HTTPException(401, "Not authenticated: valid session token required")


def require_session_auth(request: Request) -> None:
    """Refuse an API-key-authenticated request on account-critical routes.

    A key authenticates AS the user so the extension can do its job, but it must
    not be able to escalate: minting another key, changing the password, or
    touching billing would all defeat the point of a revocable, scoped
    credential. If a key is leaked the user revokes it and the damage is bounded
    to whatever the extension can do.

    Call this at the top of those routes. A cookie/JWT request is unaffected.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith(f"Bearer {_API_KEY_PREFIX}") or getattr(request.state, "auth_via_api_key", False):
        raise HTTPException(
            403,
            "This action requires a signed-in session, not an API key. "
            "Open Helpotron and sign in to continue.",
        )


async def get_current_user_optional(request: Request = None, websocket: WebSocket = None):
    try:
        return await get_current_user(request, websocket)
    except Exception:
        return None


def is_admin_user(user) -> bool:
    """Admin = the owner account, or any account explicitly flagged admin
    (role='admin' or is_admin=True). Banned accounts are never admins."""
    if not user:
        return False
    if getattr(user, 'is_banned', False):
        return False
    banned_until = getattr(user, 'banned_until', None)
    if banned_until:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        bu = banned_until.replace(tzinfo=timezone.utc) if banned_until.tzinfo is None else banned_until
        if bu > now:
            return False

    return (
        getattr(user, 'public_id', '') == ADMIN_PUBLIC_ID
        or getattr(user, 'role', '') == 'admin'
        or bool(getattr(user, 'is_admin', False))
    )

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


# ─── Junk-content guard (operator 08-26) ─────────────────────────────────────────
# The friend test poisoned permanent memory + instructions with abusive junk and
# the agent stored it verbatim. Prompt discipline is not enough — this is a
# deterministic server-side block list for write paths (memory/instructions).
_PROHIBITED_MEMORY = re.compile(
    r"nigg[ae]r|\bfaggot\b|\bkike\b|\bspic\s|\bchink\b|\btranny\b|retard|\brape\b|fuck me deep|"
    r"fuck (my|me)( deep)? (in|up)|deep in the ass|su(ck|ck) my|\bin the ass\b|"
    r"\b(bitch|slut|whore|hoe)\b|cum(ming|shot|tits)",
    re.IGNORECASE,
)


def is_junk_content(text: str) -> bool:
    """True when the text is abusive/harassing content meant to poison the agent."""
    if not text:
        return False
    return bool(_PROHIBITED_MEMORY.search(text))


def educational_guards_on(user) -> bool:
    """'Educational only' mode (operator 08-26): guards against abusive
    memory/instructions content are ON by default; when the user switches the
    setting off there are ZERO guards."""
    try:
        settings = dict(user.settings or {})
    except Exception:
        settings = {}
    return settings.get("educationalMode", True) is not False
