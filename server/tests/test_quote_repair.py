"""Repair, do not regenerate. Does the guard put the real quotation back?

Owner: *"Instead of discarding humanized text cuz it invented fake quotes just make sure the ai
agents that are using the humanize tool just edit the quote manually, regenerating everytime
they fake a quote is a never ending cat and mouse chase"*.

So the claim to prove is: a fabricated quotation is REPLACED with the source's real wording,
deterministically, without discarding the rest of the rewrite — and the facts that cannot be
safely auto-edited are handed to the agent instead of being silently mangled.
"""

import sys

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server.text_preservation import (  # noqa: E402
    agent_todo, check_preservation, repair_quotes,
)

REAL_QUOTE = ("The end of law is not to abolish or restrain, but to preserve and enlarge "
              "freedom.")
SRC = (f'He wrote, "{REAL_QUOTE}" His ideas about government later influenced the American '
       f'Revolution.')

# The measured failure: real quote kept, TWO invented ones added, paragraph nearly doubled.
FABRICATED = (
    f'He wrote, "{REAL_QUOTE}" He also said, "a government, by the consent of the people, is '
    f'an honest government, and it must always answer to those it serves." In his view, "no '
    f'power on earth may rightfully take from a man the liberty that is his by nature," and '
    f'his ideas about government later influenced the American Revolution.'
)

# A rewrite that ALTERED the real quote rather than adding to it.
ALTERED = ('He wrote, "The purpose of law is to expand freedom rather than to restrain it." '
           'His ideas about government later influenced the American Revolution.')

DATE_SRC = "David Hume was born on May 7, 1711 in Edinburgh."
DATE_FABRICATED = "David Hume (May 7, 1711 – February 25, 1776) was born in Edinburgh."


def main() -> int:
    ok = True

    print("\n  --- an INVENTED quotation is removed, the real one kept ---")
    r = repair_quotes(SRC, FABRICATED)
    print(f"    edits: {[e['action'] for e in r['edits']]}")
    invented_gone = "consent of the people" not in r["text"]
    real_kept = REAL_QUOTE in r["text"]
    rest_kept = "American Revolution" in r["text"]
    print(f"    {'PASS' if invented_gone else 'FAIL'} — invented quotations are gone")
    print(f"    {'PASS' if real_kept else 'FAIL'} — the real quotation survives")
    print(f"    {'PASS' if rest_kept else 'FAIL'} — the rest of the rewrite is NOT discarded")
    if not (invented_gone and real_kept and rest_kept):
        ok = False

    print("\n  --- an ALTERED quotation is restored to the source wording ---")
    r2 = repair_quotes(SRC, ALTERED)
    print(f"    edits: {[e['action'] for e in r2['edits']]}")
    restored = REAL_QUOTE in r2["text"]
    print(f"    {'PASS' if restored else 'FAIL'} — the exact source quotation is back")
    print(f"    text: {r2['text'][:120]}")
    if not restored:
        ok = False

    print("\n  --- a faithful rewrite is left ALONE ---")
    faithful = (f'He wrote, "{REAL_QUOTE}" Those ideas went on to shape the American '
                f'Revolution.')
    r3 = repair_quotes(SRC, faithful)
    untouched = r3["text"].strip() == faithful.strip() and not r3["edits"]
    print(f"    {'PASS' if untouched else 'FAIL'} — no edits made ({r3['edits']})")
    if not untouched:
        ok = False

    print("\n  --- an invented DATE is NOT silently mangled; it is handed to the agent ---")
    todos = agent_todo(DATE_SRC, DATE_FABRICATED)
    print(f"    agent instructions: {len(todos)}")
    for t in todos:
        print(f"      • {t[:110]}")
    caught = any("1776" in t or "25" in t for t in todos)
    print(f"    {'PASS' if caught else 'FAIL'} — the invented date is named for the agent")
    if not caught:
        ok = False
    # And the guard must NOT have altered the sentence in a way that leaves it broken.
    r4 = repair_quotes(DATE_SRC, DATE_FABRICATED)
    print(f"    repair left the date for the agent: {'1776' in r4['text']}")
    if "1776" not in r4["text"]:
        print("    FAIL — the date was silently removed instead of being flagged.")
        ok = False

    print("\n  --- a clean draft needs no agent work ---")
    clean = agent_todo(SRC, faithful)
    print(f"    {'PASS' if not clean else 'FAIL'} — empty todo list for a faithful rewrite")
    if clean:
        ok = False

    print("\n  " + ("ALL CLAIMS HOLD" if ok else "SOMETHING FAILED"))
    return 0 if ok else 1


def test_repair_not_regenerate():
    """Repair restores the real quote; unrepairable facts go to the agent."""
    assert main() == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
