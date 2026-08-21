#!/usr/bin/env python3
# Auto-generated from the remediation plan (verification command 3) — do not edit; the executor runs this exact script.
# fast-exit wrapper: sandbox run_bash has a 60s tool timeout and TestClient/httpx
# threads keep the process alive past it — os._exit() bypasses thread teardown.
import os as _os, sys as _sys, traceback as _tb

def _main():
    from server.draft import MAX_HUMANIZER_RETRIES;
    assert MAX_HUMANIZER_RETRIES <= 3;
    print('Retry limit bounded:', MAX_HUMANIZER_RETRIES)

try:
    _main()
except AssertionError:
    _tb.print_exc()
    _os._exit(1)
except SystemExit as e:
    _os._exit(int(e.code or 0))
_os._exit(0)
