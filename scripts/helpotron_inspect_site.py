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

PROBES = [
    # (label, method, url, expect_status)
    ("frontend root", "GET", f"{FRONTEND}/", 200),
    ("api status", "GET", f"{API}/api/status", 200),
    ("api health", "GET", f"{API}/api/health", 200),
    ("me endpoint", "GET", f"{API}/api/me", 200),
    ("assignments list", "GET", f"{API}/api/assignments", 200),
    ("dashboard", "GET", f"{API}/api/dashboard", 200),
    ("study tools", "GET", f"{API}/api/study-tools", 200),
    ("user account erasure (unauth -> 401)", "DELETE", f"{API}/api/user/account", 401),
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
