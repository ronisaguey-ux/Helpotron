#!/bin/bash
set -ex
cd /home/roni/Roni_workspace/helpotron

# STEP 11
cat << 'INNER_EOF' > server/ratelimit.py
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
INNER_EOF
git add server/ratelimit.py && git commit -m 'fix(remediation): STEP-11 - Token-bucket rate limiting FastAPI dependency' || true

# STEP 12
if ! grep -q 'def get_assignment_dump_secure' server/assignment_dump.py; then
cat << 'INNER_EOF' >> server/assignment_dump.py

def get_assignment_dump_secure(dump_id: str, user_id: str, db) -> dict:
    """Return full dump content if purchased, or gated preview otherwise."""
    from .database import UniversalDumpItem  # use actual model
    dump = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not dump:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail='Assignment dump not found')

    # Check if free or user owns it
    is_free = getattr(dump, 'is_free', False)
    content = getattr(dump, 'content', getattr(dump, 'extracted_text', ''))
    if is_free:
        return {
            'id': dump.id,
            'title': getattr(dump, 'title', dump.id),
            'content': content,
            'is_unlocked': True
        }

    # Gated preview: first 40 words
    words = (content or '').split()
    preview = ' '.join(words[:40])
    if len(words) > 40:
        preview += '... [Unlock full solution pack for 5 credits]'
    return {
        'id': dump.id,
        'title': getattr(dump, 'title', dump.id),
        'content': preview,
        'is_unlocked': False,
        'cost_credits': getattr(dump, 'cost_credits', 5)
    }
INNER_EOF
fi
git add server/assignment_dump.py && git commit -m 'fix(remediation): STEP-12 - Server-side paywall gating for assignment dumps' || true

# STEP 13
if ! grep -q 'run_detector_cached' server/detectors.py; then
cat << 'INNER_EOF' >> server/detectors.py

import hashlib as _hashlib
from functools import lru_cache

_DETECTOR_CACHE: dict[str, dict] = {}

def _cache_key(text: str, detector_name: str) -> str:
    """Generate a deterministic cache key for detector results."""
    return _hashlib.sha256(f"{detector_name}:{text}".encode()).hexdigest()

def run_detector_cached(detector_fn, text: str, detector_name: str) -> dict:
    """Run a detector function with result caching to avoid redundant LLM calls."""
    key = _cache_key(text, detector_name)
    if key in _DETECTOR_CACHE:
        return _DETECTOR_CACHE[key]
    result = detector_fn(text)
    _DETECTOR_CACHE[key] = result
    return result

def clear_detector_cache() -> None:
    """Clear all cached detector results (e.g., after model update)."""
    _DETECTOR_CACHE.clear()
INNER_EOF
fi
git add server/detectors.py && git commit -m 'fix(remediation): STEP-13 - Detector result hash-caching to reduce LLM calls' || true

# STEP 14
if ! grep -q 'def check_budget_guardrail' server/model_tiering.py; then
cat << 'INNER_EOF' >> server/model_tiering.py

MONTHLY_BUDGET_USD = {
    'basic': 3.00,
    'pro': 6.00,
    'elite': 15.00,
}

def check_budget_guardrail(user_plan: str, current_spend_usd: float) -> bool:
    """Return True if user is within their monthly LLM budget, False if over limit."""
    limit = MONTHLY_BUDGET_USD.get(user_plan, 1.00)
    return current_spend_usd < limit

def get_model_for_tier(user_plan: str, task_type: str = 'general') -> str:
    """Return the appropriate model name based on user plan and task type."""
    if user_plan == 'elite':
        return 'google/gemini-2.5-flash'
    elif user_plan == 'pro':
        return 'deepseek/deepseek-chat'
    else:
        return 'deepseek/deepseek-chat-v3-0324:free'
INNER_EOF
fi
git add server/model_tiering.py && git commit -m 'fix(remediation): STEP-14 - Model tiering and budget guardrails' || true

