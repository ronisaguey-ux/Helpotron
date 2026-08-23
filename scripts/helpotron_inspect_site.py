#!/usr/bin/env python3
"""helpotron_inspect_site.py — post-plan API inspection (directive 08-22).

Probes the live stack on localhost (frontend 5173, API 8000) and prints a
plain-text report of what responds, what breaks, and any anomalies. Used by
the post-plan vision inspection subagent to verify "everything's actually
done" before signing off.
"""
import json
import urllib.error
import urllib.request

FRONTEND = "http://localhost:5173"
API = "http://localhost:8000"

# Real route map from openapi.json (verified 2026-08-22).
# Unauthenticated probes of protected routes EXPECT 401 — the auth gate is
# the correct behavior; anything else is a bug.
PROBES = [
    # (label, method, url, expect_status)
    ("frontend root", "GET", f"{FRONTEND}/", 200),
    ("health (public)", "GET", f"{API}/health", 200),
    ("api health (public)", "GET", f"{API}/api/health", 200),
    ("me (auth gate -> 401)", "GET", f"{API}/api/me", 401),
    ("assignments create (auth -> 401)", "POST", f"{API}/api/assignments", 401),
    ("assignments cards (auth -> 401)", "GET", f"{API}/api/assignments/cards", 401),
    ("assignments router (auth -> 401)", "GET", f"{API}/assignments", 401),
    ("user settings (auth -> 401)", "GET", f"{API}/api/user/settings", 401),
    ("erasure legacy (auth -> 401, was 500)", "DELETE", f"{API}/api/user/account", 401),
    ("erasure gdpr (auth -> 401)", "DELETE", f"{API}/api/user/delete-account", 401),
    ("erasure canonical (auth -> 401)", "DELETE", f"{API}/user/account", 401),
    ("admin system-health (auth -> 401)", "GET", f"{API}/api/admin/system-health", 401),
]


def probe(label, method, url, expect):
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read(2000).decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read(500).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001 - report anything
        print(f"FAIL {label}: {e}")
        return False
    ok = status == expect
    snippet = body.strip()[:120].replace("\n", " ")
    print(f"{'OK  ' if ok else 'FAIL'} {label}: HTTP {status} (expect {expect}) -> {snippet}")
    return ok


def main():
    print(f"helpotron_inspect_site {__file__}")
    print("=" * 78)
    results = [probe(*p) for p in PROBES]
    print("=" * 78)
    passed = sum(results)
    print(f"RESULT: {passed}/{len(results)} probes passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
