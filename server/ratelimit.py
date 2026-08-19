"""Rate limiting utilities for Helpotron API endpoints.

Provides both a class-based RateLimiter and a FastAPI dependency factory.
"""
from __future__ import annotations

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

    def prune(self, max_age: float = 120.0) -> None:
        cutoff = time.time() - max_age
        stale = [k for k, q in self._hits.items() if not q or q[-1] < cutoff]
        for k in stale:
            del self._hits[k]


# Module-level singleton (used by main.py routes and conftest.py cleanup)
limiter = RateLimiter()

# ─── FastAPI dependency factory ───────────────────────────────────────────

RATE_LIMITS: dict[str, list[float]] = defaultdict(list)


def rate_limit(max_requests: int = 10, window_seconds: int = 60):
    """FastAPI dependency factory for route-level rate limiting."""
    def dependency(request: Request):
        client_ip = request.client.host if request.client else "unknown"
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
