"""Login captcha enforcement (Cloudflare Turnstile) + operator test bypass.

08-31 (operator): every login is captcha-gated once TURNSTILE_SECRET is
configured. Test bots bypass with the X-Helpotron-Captcha-Bypass header
matching config.captcha_bypass_secret — a server-side operator secret that
never ships in a client bundle.
"""
from __future__ import annotations

import hmac
import logging

import httpx

from .config import settings

logger = logging.getLogger(__name__)

_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def captcha_required() -> bool:
    """True when Turnstile keys are configured → /api/login enforces a token."""
    return bool(settings.turnstile_secret and settings.turnstile_sitekey)


def has_valid_bypass(request) -> bool:
    """Constant-time check of the operator bypass header (test bots only)."""
    secret = settings.captcha_bypass_secret
    if not secret:
        return False
    supplied = request.headers.get("x-helpotron-captcha-bypass", "") or request.headers.get(
        "X-Helpotron-Captcha-Bypass", ""
    )
    return bool(supplied) and hmac.compare_digest(supplied, secret)


def verify_turnstile_token(token: str, remote_ip: str = "") -> bool:
    """Validate a Turnstile response token with Cloudflare's siteverify API.

    Sync (httpx.Client): called from sync FastAPI routes (login).
    """
    if not captcha_required():
        return True
    if not token:
        return False
    try:
        data = {"secret": settings.turnstile_secret, "response": token, "remoteip": remote_ip}
        with httpx.Client(timeout=10) as client:
            resp = client.post(_SITEVERIFY_URL, data=data)
            payload = resp.json()
        if payload.get("success") is True:
            return True
        logger.warning("Turnstile verify failed for ip=%s: %s", remote_ip, payload.get("error-codes"))
        return False
    except Exception as exc:  # network failure → deny closed, never fail-open
        logger.error("Turnstile verify error: %s", exc)
        return False
