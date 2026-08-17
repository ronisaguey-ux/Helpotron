"""Tiny dependency-free rate limiter (sliding window, in-memory with bounded cache).

Kept dependency-free on purpose: sliding-window counters with auto-pruning
and bounded maximum cache size (10,000 max keys) to prevent memory exhaustion.
"""
from __future__ import annotations

import time
from collections import deque


class RateLimiter:
    MAX_KEYS = 10_000

    def __init__(self, max_keys: int = 10_000) -> None:
        self.max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        """True if `key` is under `limit` requests per `window` seconds."""
        now = time.time()
        
        # Guard against memory exhaustion
        if len(self._hits) >= self.max_keys and key not in self._hits:
            self.prune(max_age=window * 2)
            if len(self._hits) >= self.max_keys:
                # Evict oldest entry
                oldest_key = next(iter(self._hits))
                del self._hits[oldest_key]

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
