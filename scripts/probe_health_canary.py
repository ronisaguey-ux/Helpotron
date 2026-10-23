#!/usr/bin/env python3
"""Synthetic canary probe for Helpotron.

Verifies:
1. Origin HTTP 200 on /api/health?deep=true (FastAPI + SQLite connectivity)
2. Content-Security-Policy header contains 'frame-src' (prevents Turnstile auth outage)
3. Dispatches Telegram alert via tele-report if any assertion fails.
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request

BASE_URL = "http://127.0.0.1:5000"


def send_alert(message: str) -> None:
    print(f"🚨 [ALERT] {message}", file=sys.stderr)
    try:
        subprocess.run(["tele-report", f"🚨 Helpotron Canary Failure: {message}"], timeout=15)
    except Exception as exc:
        print(f"Failed to dispatch tele-report: {exc}", file=sys.stderr)


def check_health() -> bool:
    url = f"{BASE_URL}/api/health?deep=true"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "helpotron-canary/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                send_alert(f"/api/health returned HTTP {resp.status}")
                return False
            data = json.loads(resp.read().decode())
            if data.get("status") != "ok" or data.get("database") != "ok":
                send_alert(f"/api/health reported degraded state: {data}")
                return False
    except Exception as exc:
        send_alert(f"/api/health unreachable: {exc}")
        return False
    return True


def check_csp() -> bool:
    try:
        req = urllib.request.Request(f"{BASE_URL}/", headers={"User-Agent": "helpotron-canary/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            csp = resp.headers.get("Content-Security-Policy", "")
            if "frame-src" not in csp or "challenges.cloudflare.com" not in csp:
                send_alert("CSP missing required frame-src for Turnstile (Auth outage hazard)")
                return False
    except Exception as exc:
        send_alert(f"Failed to fetch CSP headers from root: {exc}")
        return False
    return True


def main() -> int:
    ok = check_health() and check_csp()
    if ok:
        print("✅ Canary checks passed.")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
