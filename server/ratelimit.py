"""Rate limiting utilities for Helpotron API endpoints.

Provides both a class-based RateLimiter and a FastAPI dependency factory.
"""
from __future__ import annotations

import math
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request, status


class RateLimiter:
    """Sliding window rate limiter (in-memory, bounded cache)."""
    MAX_KEYS = 10_000

    def __init__(self, max_keys: int = 10_000) -> None:
        self.max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        """True if `key` is under `limit` requests per `window` seconds."""
        now = time.time()
        if len(self._hits) >= self.max_keys and key not in self._hits:
            self.prune(max_age=window * 2)
            if len(self._hits) >= self.max_keys:
                oldest_key = next(iter(self._hits))
                del self._hits[oldest_key]
        q = self._hits.setdefault(key, deque())
        cutoff = now - window
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True

    def retry_after(self, key: str, limit: int, window: float = 60.0) -> int:
        """Seconds until the caller's `allow()` starts permitting again.

        Must be called right after `allow()` returned False for the same
        (key, limit, window) — allow() has already pruned the deque down to
        in-window hits, so its oldest entry is the one that keeps the key
        blocked; this is the Retry-After value for a 429."""
        q = self._hits.get(key)
        if not q:
            return 0
        return max(1, int(math.ceil(window - (time.time() - q[0]))))

    def prune(self, max_age: float = 120.0) -> None:
        cutoff = time.time() - max_age
        stale = [k for k, q in self._hits.items() if not q or q[-1] < cutoff]
        for k in stale:
            del self._hits[k]


# Module-level singleton (used by main.py routes and conftest.py cleanup)
limiter = RateLimiter()

# ─── FastAPI dependency factory ───────────────────────────────────────────

# The tunnel is the only ingress, so the socket peer is always 127.0.0.1 and a
# per-socket key collapses every user onto one bucket. Trust the forwarding header
# ONLY from that hop — honoured unconditionally it is attacker-controlled, and a
# spoofed value would give every request its own bucket and no limit at all.
TRUSTED_PROXY_HOSTS = {"127.0.0.1", "::1"}


def client_identity(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if peer in TRUSTED_PROXY_HOSTS:
        headers = getattr(request, "headers", {})
        fwd = headers.get("cf-connecting-ip") or headers.get("x-forwarded-for", "")
        first = fwd.split(",")[0].strip()
        if first:
            return first
    return peer


RATE_LIMITS: dict[str, list[float]] = defaultdict(list)


def rate_limit(max_requests: int = 10, window_seconds: int = 60):
    """FastAPI dependency factory for route-level rate limiting."""
    def dependency(request: Request):
        client_ip = client_identity(request)
        now = time.time()
        key = f"{client_ip}:{request.url.path}"

        timestamps = [t for t in RATE_LIMITS[key] if now - t < window_seconds]
        if len(timestamps) >= max_requests:
            retry_after = int(window_seconds - (now - timestamps[0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {max_requests} requests per {window_seconds}s. Try again in {retry_after}s.",
                headers={"Retry-After": str(max(1, retry_after))}
            )
        timestamps.append(now)
        RATE_LIMITS[key] = timestamps
        return True
    return dependency


# ── Cost-incurring routes ─────────────────────────────────────────────────────
#
# Every route that calls a paid model had NO rate limit at all (measured
# 2026-09-23: 13 files call call_llm/stream_llm, 0 of them referenced the
# limiter). The token balance bounds an ordinary account, but:
#
#   * the operator account is UNMETERED by design (credits.is_unmetered), so a
#     loop there has no ceiling at all, and
#   * the balance gate is a `> 0` check taken at the START of a task, so a
#     thousand concurrent requests all pass it and all bill.
#
# A per-account request limit is what stops that. It is deliberately generous —
# a human typing quickly, or the extension's multi-round action loop, must not
# trip it. It exists to break a runaway, not to meter normal use.

# key -> (limit, window) defaults, overridable per call.
DEFAULT_COSTLY_LIMITS: dict[str, tuple[int, float]] = {
    "agent_turn": (60, 60.0),     # chat turns (web + extension)
    "agent_task": (20, 60.0),     # a whole agent task — far more expensive each
    "humanize": (30, 60.0),       # HIP is local; the LLM fallback is not
    "detect": (20, 60.0),         # paid detectors: Pangram is 5c per scan
    "typing": (90, 60.0),         # one call per round of a multi-action loop
    "dump": (20, 60.0),           # page/assignment ingestion
}


def _caller_key(request: "Request") -> tuple[str, str]:
    """Who is asking. Prefers the authenticated account over the IP.

    Keying on the account is the point: an attacker rotating IPs behind a shared
    office NAT or a VPN cannot dodge an account-scoped limit, and one noisy
    household does not throttle another.
    """
    user = getattr(getattr(request, "state", None), "auth_user_public_id", None)
    if user:
        return f"user:{user}", "account"
    # Fall back to the client address for anonymous callers.
    client = request.client.host if request.client else "unknown"
    return f"ip:{client}", "address"


def costly_guard(kind: str, limit: int | None = None, window: float | None = None):
    """FastAPI dependency: rate-limit a cost-incurring route per caller.

    Usage:  reasons: None = Depends(costly_guard("agent_turn"))

    Deliberately dependency-shaped rather than middleware: a middleware would
    have to pattern-match paths, and a new expensive route would silently miss
    it. Attaching this to the route is explicit and greppable.
    """
    from fastapi import Depends, HTTPException, Request
    from .routes_features import get_current_authenticated_user

    def _dep(request: Request, user=Depends(get_current_authenticated_user)):
        default_limit, default_window = DEFAULT_COSTLY_LIMITS.get(kind, (60, 60.0))
        eff_limit = limit if limit is not None else default_limit
        eff_window = window if window is not None else default_window

        # Prefer the authenticated identity; request.state is set by the auth
        # dependency above, but fall back to the resolved user object so this
        # works whether or not that state attribute is populated.
        public_id = getattr(user, "public_id", None)
        base = f"user:{public_id}" if public_id else _caller_key(request)[0]
        key = f"costly:{kind}:{base}"

        if not limiter.allow(key, eff_limit, window=eff_window):
            retry_after = limiter.retry_after(key, eff_limit, window=eff_window)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "That was a lot of requests at once. "
                    f"Try again in {retry_after} seconds."
                ),
                headers={"Retry-After": str(retry_after)},
            )
        return user

    return _dep
