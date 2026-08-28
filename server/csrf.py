"""CSRF protection utilities.

Uses double-submit cookie pattern: a token is set as a cookie (httpOnly=false)
and must be submitted in a header or form field for state-changing requests.
"""
from __future__ import annotations

import secrets
from typing import Any
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"

EXEMPT_PATHS = {
    "/api/login",
    "/api/signup",
    "/api/csrf",
    "/api/logout",
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/csrf",
    "/api/health",
}


try:
    from .config import config
except (ImportError, ValueError):
    from server.config import config


def generate_csrf_token() -> str:
    """Generate a cryptographically secure random token."""
    return secrets.token_urlsafe(32)


def set_csrf_cookie(response: Response) -> str:
    """Set a CSRF cookie and return the token."""
    token = generate_csrf_token()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=False,   # Must be readable by JavaScript to send back
        secure=getattr(config, 'production_mode', False),
        samesite="lax",
        path="/",
    )
    return token


def validate_csrf(request: Request) -> None:
    """Validate the CSRF token from cookie vs header when session cookie is present.

    Raises HTTPException 403 if validation fails on cookie-authenticated requests.
    """
    # Skip for safe methods and exempt paths
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return
    if request.url.path in EXEMPT_PATHS or any(p.endswith("/") and request.url.path.startswith(p) for p in EXEMPT_PATHS):
        return

    # API/extension clients authenticate with an Authorization: Bearer
    # credential (JWT or DB session token). A cross-site attacker can never
    # add that header through a form submission, and such clients cannot
    # echo the double-submit token the way a page does — so CSRF double-
    # submit only applies to cookie-based auth. Without this exemption the
    # browser extension's scrape POST /api/assignments gets 403
    # "CSRF token missing" whenever a helpotron_session cookie is present.
    if request.headers.get("Authorization", "").startswith("Bearer "):
        return

    session_cookie = request.cookies.get("helpotron_session")
    if not session_cookie:
        return

    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get(CSRF_HEADER_NAME)

    if not cookie_token or not header_token:
        raise HTTPException(403, "CSRF token missing")

    # Use constant-time comparison to avoid timing attacks
    if not secrets.compare_digest(cookie_token, header_token):
        raise HTTPException(403, "CSRF token invalid")


class CSRFMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce CSRF protection on state-changing requests."""

    async def dispatch(self, request: Request, call_next):
        # Skip validation for safe methods, non-API routes, and exempt endpoints
        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return await call_next(request)

        # Only apply to API endpoints
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        if request.url.path in EXEMPT_PATHS or any(p.endswith("/") and request.url.path.startswith(p) for p in EXEMPT_PATHS):
            return await call_next(request)


        # Validate CSRF
        try:
            validate_csrf(request)
        except HTTPException as e:
            # If validation fails, return 403
            from starlette.responses import JSONResponse
            return JSONResponse(
                {"detail": e.detail},
                status_code=e.status_code
            )

        return await call_next(request)
