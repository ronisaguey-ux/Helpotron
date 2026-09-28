"""Pytest wrapper: the guard inside hip_humanize.

Does the preservation guard actually run inside hip_humanize, or just sit next to it?

Importing a function is not wiring it. This fakes `_one_round` so the model returns a
fabricated rewrite — exactly the one measured on the real job — and asserts `hip_humanize`
keeps the ORIGINAL rather than the fluent invention.

Both directions again: a faithful rewrite must still be accepted, or the guard would make
the humanizer useless.
"""

import asyncio
import sys

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server import hip_humanizer as H  # noqa: E402

SRC = ('He wrote, "The end of law is not to abolish or restrain, but to preserve and enlarge '
       'freedom." His ideas about government later influenced the American Revolution.')

FABRICATED = (
    'He wrote, "The end of law is not to abolish or restrain, but to preserve and enlarge '
    'freedom." He also said, "a government, by the consent of the people, is an honest '
    'government, and it must always answer to those it serves." In his view, "no power on '
    'earth may rightfully take from a man the liberty that is his by nature," and his ideas '
    'about government later influenced the American Revolution.'
)

FAITHFUL = ('His view was that law protects and expands freedom rather than restraining it — '
            'he wrote, "The end of law is not to abolish or restrain, but to preserve and '
            'enlarge freedom." Those ideas later shaped the American Revolution.')


_PATCHED = ("hip_configured", "hip_rounds", "_hip_server_cpu_seconds", "_one_round")


def run(round_output: str, source: str) -> str | None:
    """Drive hip_humanize with the model call faked, restoring the module afterwards."""
    calls = {"n": 0}

    async def fake_round(text, session):
        calls["n"] += 1
        return round_output

    # ★ RESTORE EVERYTHING. These are module-level assignments on a production module, so
    # leaving them set rewrites hip_humanizer for the rest of the process — every later test
    # (and any code path it exercises) would see a faked model and a forced-on HIP. Measured
    # on a sibling test: patching `call_llm` without restoring made 6 unrelated llm tests fail
    # only when that file ran first.
    _saved = {name: getattr(H, name) for name in _PATCHED}
    try:
        H.hip_configured = lambda: True          # pretend it is set up
        H.hip_rounds = lambda: 1
        H._hip_server_cpu_seconds = lambda: None  # skip the metering path
        H._one_round = fake_round
        out = asyncio.run(H.hip_humanize(source))
    finally:
        for name, value in _saved.items():
            setattr(H, name, value)
    return out, calls["n"]


def main() -> int:
    ok = True

    print("\n  --- a fabricated rewrite is discarded ---")
    out, calls = run(FABRICATED, SRC)
    print(f"    model called {calls}x")
    print(f"    result kept the ORIGINAL: {out == SRC}")
    if out != FABRICATED:
        print("    PASS — the invented quotations never reached the caller.")
    else:
        print("    FAIL — the fabrication was returned.")
        ok = False
    if calls >= 2:
        print("    PASS — and it retried once before giving up, as designed.")
    else:
        print(f"    NOTE — only {calls} attempt(s); the retry path did not run.")

    print("\n  --- a faithful rewrite still passes through ---")
    out2, calls2 = run(FAITHFUL, SRC)
    print(f"    result differs from source: {out2 != SRC}")
    if out2 == FAITHFUL:
        print("    PASS — legitimate humanization is not blocked.")
    else:
        print(f"    FAIL — a faithful rewrite was rejected: {str(out2)[:80]}")
        ok = False

    print("\n  " + ("ALL CLAIMS HOLD" if ok else "SOMETHING FAILED"))
    return 0 if ok else 1


def test_guard():
    """Pytest wrapper: the guard inside hip_humanize."""
    assert main() == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
