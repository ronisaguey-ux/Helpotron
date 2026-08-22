"""Rate limiting regression tests (remediation BATCH-06).

Covers the sliding-window RateLimiter directly and the per-IP 429 path
through the app middleware.
"""
import os
import time

# Must be set before any `server.*` import — the engine binds at import time.
os.environ["DATABASE_URL"] = "sqlite:///./test_rate_limiting.db"
os.environ["JWT_SECRET"] = "test-secret-key-minimum-32-characters!"

from server.ratelimit import RateLimiter


def test_under_limit_allowed():
    lim = RateLimiter()
    for _ in range(5):
        assert lim.allow("unit:key", limit=10), "requests under limit must pass"


def test_exact_limit_allowed():
    lim = RateLimiter()
    for _ in range(10):
        assert lim.allow("unit:key", limit=10)
    assert lim.allow("unit:key", limit=10) is False, "11th request over limit must block"


def test_over_limit_blocked():
    lim = RateLimiter()
    for _ in range(10):
        lim.allow("unit:key", limit=10)
    assert lim.allow("unit:key", limit=10) is False


def test_keys_are_independent():
    lim = RateLimiter()
    for _ in range(10):
        lim.allow("unit:a", limit=10)
    assert lim.allow("unit:b", limit=10), "different keys must not share a bucket"


def test_window_slides():
    lim = RateLimiter()
    for _ in range(2):
        lim.allow("unit:win", limit=2, window=0.05)
    assert lim.allow("unit:win", limit=2, window=0.05) is False
    time.sleep(0.07)  # window elapsed -> budget restored
    assert lim.allow("unit:win", limit=2, window=0.05), "sliding window must recover"


def test_max_keys_prunes_old_entries():
    lim = RateLimiter(max_keys=100)
    for i in range(150):
        lim.allow(f"unit:mass{i}", limit=1)
    assert len(lim._hits) <= 100, "cache must stay bounded"


def test_ip_rate_limit_returns_429():
    """121 rapid GETs against an /api/ path must produce 429 on the last."""
    from fastapi.testclient import TestClient
    from server.ratelimit import limiter

    limiter._hits.clear()  # deterministic start for the shared singleton

    from server.main import app
    with TestClient(app) as c:
        codes = [c.get("/api/status/dev-rl-user").status_code for _ in range(121)]
    assert codes[-1] == 429, f"expected 429 on request 121, got {codes[-1]}"
    assert 429 not in codes[:-1], "requests under the limit must not be blocked"


def test_frontend_static_assets_not_rate_limited():
    """Static/HTML paths are exempt from the API rate limiter."""
    from fastapi.testclient import TestClient
    from server.ratelimit import limiter

    limiter._hits.clear()
    from server.main import app
    with TestClient(app) as c:
        res = c.get("/")
    # Either the frontend route serves (200/404) or it redirects — but never 429.
    assert res.status_code != 429
