"""Tiny dependency-free rate limiter (sliding window, in-memory).

Kept dependency-free on purpose: the box has no redis, and slowapi would
pull in a starlette version we don't control. Per-key (ip or public_id)
sliding-window counters with auto-pruning; good enough for abuse
prevention on a personal-scale API.
"""
from __future__ import annotations

import time
from collections import deque


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        """True if `key` is under `limit` requests per `window` seconds."""
        now = time.time()
        hits = self._hits.setdefault(key, deque())
        # prune entries older than the window
        while hits and hits[0] < now - window:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True

    def prune(self, max_age: float = 3600.0) -> None:
        """Drop stale keys so the table can't grow unboundedly."""
        cutoff = time.time() - max_age
        stale = [k for k, hits in self._hits.items() if not hits or hits[-1] < cutoff]
        for k in stale:
            del self._hits[k]


limiter = RateLimiter()
