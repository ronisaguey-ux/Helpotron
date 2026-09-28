"""Pytest wrapper: the preservation guard.

Does the preservation guard catch the fabrications that were measured — and pass real work?

★ BOTH DIRECTIONS MATTER. A guard that rejects everything would "catch" fabrication while
making the humanizer useless, so every check has a positive case built from the REAL texts
this was written from (the Enlightenment biographies job).

The three failures are the ones that actually happened, not hypotheticals.
"""

import sys

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server.text_preservation import check_preservation, is_faithful  # noqa: E402

# The real source paragraph (abridged) that the fabrication happened on.
LOCKE_SRC = (
    'He wrote, "The end of law is not to abolish or restrain, but to preserve and enlarge '
    'freedom." His ideas about government later influenced the American Revolution.'
)

# What HIP actually produced: 77 -> 155 words, with two invented quotations.
LOCKE_FABRICATED = (
    'He wrote, "The end of law is not to abolish or restrain, but to preserve and enlarge '
    'freedom." He also said, "a government, by the consent of the people, is an honest '
    'government, and it must always answer to those it serves." In his view, "no power on '
    'earth may rightfully take from a man the liberty that is his by nature," and his ideas '
    'about government later influenced the American Revolution.'
)

# A faithful restyle: same facts, different wording, same quote.
FAITHFUL = (
    'He wrote, "The end of law is not to abolish or restrain, but to preserve and enlarge '
    'freedom." Those ideas went on to influence the American Revolution.'
)

DATE_SRC = "David Hume was born on May 7, 1711 in Edinburgh."
DATE_FABRICATED = "David Hume (May 7, 1711 – February 25, 1776) was born in Edinburgh."


def main() -> int:
    ok = True

    print("\n  --- the three measured fabrications are caught ---")
    cases = [
        ("invented quotations", LOCKE_SRC, LOCKE_FABRICATED),
        ("invented date + death year", DATE_SRC, DATE_FABRICATED),
        ("dropped the quotation", LOCKE_SRC, "His ideas about government influenced the revolution."),
    ]
    for name, src, out in cases:
        r = check_preservation(src, out)
        status = "REJECTED" if not r["ok"] else "ACCEPTED"
        print(f"    {name:28s} {status}")
        for v in r["violations"]:
            print(f"        • {v}")
        if r["ok"]:
            print("    FAIL — this fabrication was accepted.")
            ok = False

    print("\n  --- real rewrites still pass (a guard that blocks everything is useless) ---")
    good = [
        ("same quote, new wording", LOCKE_SRC, FAITHFUL),
        ("identical text", DATE_SRC, DATE_SRC),
        ("trivial restyle", DATE_SRC,
         "Hume was born in Edinburgh on May 7, 1711."),
    ]
    for name, src, out in good:
        r = check_preservation(src, out)
        status = "ACCEPTED" if r["ok"] else f"REJECTED {r['violations']}"
        print(f"    {name:28s} {status}")
        if not r["ok"]:
            print("    FAIL — legitimate work was blocked.")
            ok = False

    print("\n  --- a name that was never mentioned is caught ---")
    r = check_preservation("He influenced the American Revolution.",
                           "He influenced the American Revolution alongside Kant and Voltaire.")
    print(f"    introduced names -> accepted={r['ok']}  {r['violations']}")
    if r["ok"]:
        print("    FAIL — a name that was never in the source slipped through.")
        ok = False

    print("\n  --- boolean helper agrees ---")
    if is_faithful(LOCKE_SRC, LOCKE_FABRICATED) or not is_faithful(LOCKE_SRC, FAITHFUL):
        print("    FAIL — is_faithful disagrees with check_preservation.")
        ok = False
    else:
        print("    PASS — is_faithful matches.")

    print("\n  " + ("ALL CLAIMS HOLD" if ok else "SOMETHING FAILED"))
    return 0 if ok else 1


def test_guard():
    """Pytest wrapper: the preservation guard."""
    assert main() == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
