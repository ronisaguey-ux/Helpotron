#!/usr/bin/env python3
# Auto-generated from the remediation plan (verification command 1) — do not edit; the executor runs this exact script.
# fast-exit wrapper: sandbox run_bash has a 60s tool timeout and TestClient/httpx
# threads keep the process alive past it — os._exit() bypasses thread teardown.
import os as _os, sys as _sys, traceback as _tb

def _main():
    from server.routes_user_settings import router;
    paths = [r.path for r in router.routes];
    assert '/api/user/delete-account' in paths or any('delete-account' in p for p in paths);
    print('GDPR delete route verified')

try:
    _main()
except AssertionError:
    _tb.print_exc()
    _os._exit(1)
except SystemExit as e:
    _os._exit(int(e.code or 0))
_os._exit(0)
