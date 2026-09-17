"""A grammar gate, built on rules that were MEASURED sound before being kept.

THE PROBLEM. The engine optimises a measured distance to a sampled human profile.
Every corruption it produced while being built IMPROVED that distance, because the
corruptions are all moves toward the human register - shorter words, fewer
parentheticals, more connectives. Measured examples, each accepted by the metric:

    "in order to"            ->  "to"                  (correct, kept)
    "performing tasks"       ->  "playing tasks"        (wrong sense)
    "The Impact of AI on..." ->  "How much AI on..."    (title destroyed)
    "who may lack resources" ->  "who lack resources"   (modal deleted)
    "Broadly speaking, ..."  ->  "speaking, speaking,"   (looped)
    "relocate thus face"     ->  "relocate so face"     (broken)

Goodhart's law in its plainest form: once the measure is the target it stops
measuring. The metric cannot notice, because it has no model of English, so this
module is a separate check that runs BEFORE a candidate is scored.

THE MEASUREMENT THAT SHAPED IT, and the reason this file is short. The first
version had ten hand-written rules. Scored against the 32 confirmed-HUMAN essays,
which must all pass by definition, the false-positive rate per rule was:

    rule                            human FP   verdict
    bare 'be' in a finite clause       0/32    kept
    repeated gerund opener             0/32    kept
    duplicated connective              0/32    kept
    a/an disagreement                  1/32    REMOVED - "Text A is an excerpt"
    infinitive + plural                2/32    REMOVED - "to make pauses"
    duplicated word                    3/32    REMOVED - "Tweet Tweet", "bye bye"
    possible collapsed verb phrase     2/32    REMOVED - "which are aimed"
    bare 'so' used mid-clause         10/32    REMOVED - 31% false positives

Every rejection above was valid English: onomatopoeia ("Thunk, thunk"), emphasis
("dry, dry earth"), a reduplication ("bye bye"), a proper name ("Jane, Jane Doe"),
a labelled noun ("Text A"), and ordinary infinitives ("to make pauses"). The
conclusion is not that the rules needed tuning - it is that SURFACE PATTERNS
CANNOT DETECT GRAMMAR DAMAGE. English reduplicates, quotes and labels itself in
exactly the shapes a damage detector wants to flag.

So the gate is deliberately three rules with zero measured false positives over
32 real essays, and the rest of the protection lives at the source: the modal
exclusion in strip_hedges, the title guard in align, the phrase-consistent hedge
lists, the marker de-duplication, and the POS guard in the synonym tables. A gate
that fires on valid prose is worse than no gate, because it silently blocks every
transform - measured: a ten-rule version cut accepted moves from 8 to 3 while
rejecting genuine English.

`validate()` is the regression test. It asserts 0 false positives on the human
corpus, so a future rule cannot be added without being measured against real prose.
"""

from __future__ import annotations

import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

RULES = [
    # A bare "be" where a finite verb belongs: "it be a problem", "there be no
    # reason". A deleted modal leaves exactly this shape. 0/32 false positives -
    # no real essay writes a bare "be" after a subject pronoun or "there".
    (r"\b(?:it|there|this|that|he|she|they|we|you)\s+be\s+(?:a|an|the|no|not|too|so)\b",
     "bare 'be' in a finite clause"),

    # A marker loop: the same gerund opener three times, which is what a
    # self-stacking transform produces ("speaking, speaking, speaking, ...").
    # 0/32 false positives - real essays do not open three clauses that way.
    (r"\b(\w{4,}ing),\s+\1,\s+\1\b", "marker loop"),

    # The same connective twice in a row across a comma. 0/32 false positives.
    (r"\b(so|but|also|however|therefore|thus|hence),\s+\1\b",
     "duplicated connective"),
]

_COMPILED = [(re.compile(p, re.IGNORECASE | re.MULTILINE), msg) for p, msg in RULES]

def _own_markers() -> set:
    """The words THIS engine's levers insert, which is the only set worth checking.

    The general "a word appears twice in a row" rule cannot be made sound. Two
    real essays defeated it:

        "leaving the dry, dry earth without a single drop"   (emphasis)
        "my name is Jane, Jane Doe", she announced           (a name)

    Any content word can legitimately repeat in human prose, so a general rule
    either fires on real writing or needs an exception list that will always be
    incomplete. The rule that IS sound by construction: flag a repeat only when
    the repeated word is a marker one of our own levers inserted. A student does
    not write "Perhaps, perhaps," and "speaking, speaking," - only a self-stacking
    transform does - so restricting the check to our own vocabulary removes the
    false positives entirely without weakening the check that matters.
    """
    out = set()
    try:
        import levers
        out |= {h.lower() for h in levers._HEDGES_ADD}
        out |= {d.strip().lower().rstrip(",") for d in levers._DISCOURSE}
        out |= {h.lower() for h in levers._HEDGES_STRIP}
    except Exception:
        pass
    return out


_OWN = _own_markers()


def check(text: str, min_len: int = 0) -> tuple[bool, str]:
    """True when the text is fluent enough to be scored.

    Returns (ok, reason). The reason is the first failure found, so a rejection is
    always explainable. `min_len` guards against a transform having destroyed the
    document; it defaults to 0 because this is also called on short diff windows,
    where a 40-character floor would reject every legitimate fragment.
    """
    if not text or (min_len and len(text.strip()) < min_len):
        return False, "text destroyed"
    for rx, msg in _COMPILED:
        m = rx.search(text)
        if m:
            return False, f"{msg}: {m.group(0)[:60]!r}"
    # A repeated marker, restricted to the vocabulary our own levers insert.
    for m in re.finditer(r"\b([A-Za-z][A-Za-z' ]{2,}?)[,.]\s+(\1)\b", text,
                         re.IGNORECASE):
        if m.group(1).strip().lower() in _OWN:
            return False, f"duplicated marker: {m.group(0)[:50]!r}"

    # TWO DIFFERENT markers stacked at one sentence opening. This is the shape the
    # two marker levers produced when they could not see each other's output:
    #   "Perhaps, though, perhaps, though, perhaps, though, while these platforms..."
    # A repeat check for the SAME word never fires on it, because the marker
    # alternates. Two of our own markers back to back is not something a student
    # writes, so the rule is sound by the same argument as the one above.
    for m in re.finditer(r"\b([A-Za-z][A-Za-z' ]{2,25}?),\s+([A-Za-z][A-Za-z' ]{2,25}?),",
                         text):
        a = m.group(1).strip().lower()
        b = m.group(2).strip().lower()
        if a in _OWN and b in _OWN:
            return False, f"stacked markers: {m.group(0)[:52]!r}"

    # The same word three or more times in a row. No English sentence does this;
    # measured "but but but but also" and "so so so so" from repeated stripping.
    m = re.search(r"\b(\w{2,})\s+\1\s+\1\b", text, re.IGNORECASE)
    if m:
        return False, f"word repeated 3+ times: {m.group(0)[:44]!r}"

    # "a" before a vowel-initial word. The earlier version of this rule was
    # removed for a false positive on "Text A is an excerpt" - the capital A is a
    # LABEL, not the article. Requiring lowercase removes that case and keeps the
    # check, which matters because delatinate was measured producing
    # "a important psychological burden".
    m = re.search(r"\ba\s+([aeiou]\w+)", text)
    if m:
        return False, f"a/an disagreement: {m.group(0)[:44]!r}"
    return True, ""


def diff_damage(before: str, after: str) -> tuple[bool, str]:
    """Only the text that CHANGED is checked.

    A transform can only introduce damage where it edited, so scanning the diff is
    both faster and more precise than re-checking the whole document - it never
    reports a pre-existing quirk of the source as though the transform caused it.
    """
    import difflib
    sm = difflib.SequenceMatcher(None, before.split(), after.split())
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        window = " ".join(after.split()[max(0, j1 - 6):j2 + 6])
        ok, why = check(window)          # no min_len: this is a fragment
        if not ok:
            return False, why
    return True, ""


def validate(human_dir: str | None = None) -> tuple[int, int, list]:
    """0 false positives over the human corpus is the acceptance criterion.

    Returns (passed, total, failures). Called by __main__ and safe to import.
    """
    d = human_dir or os.path.join(HERE, "human_essays")
    files = sorted(glob.glob(os.path.join(d, "*.txt")))
    fails = []
    for p in files:
        ok, why = check(open(p).read())
        if not ok:
            fails.append((os.path.basename(p), why))
    return len(files) - len(fails), len(files), fails


if __name__ == "__main__":
    import sys

    # 1. the corruptions must be caught
    bad = [
        ("it be a problem for them", "bare be"),
        ("speaking, speaking, speaking here", "marker loop"),
        ("So, so, it happened anyway", "dup connective"),
        ("Perhaps, perhaps, workers plan", "dup marker"),
    ]
    caught = 0
    for text, label in bad:
        ok, why = check(text)
        mark = "ok " if not ok else "FAIL"
        if not ok:
            caught += 1
        print(f"  {mark} catch {label:<16} {why[:44]}")
    print(f"  caught {caught}/{len(bad)}")

    # 2. real human prose must pass - the binding constraint
    good = [
        ("who may lack the resources", 1),
        ("which are aimed at teenagers", 1),
        ("Time to wave bye bye to your bro", 1),
        ('"Thunk, thunk, thunk, thunk." This went on for a while.', 1),
        ("leaving the dry, dry earth without a drop", 1),
        ('"Hello everyone, my name is Jane, Jane Doe", she said.', 1),
        ("although since Text A is an excerpt from a diary", 1),
        ("To make issues worse, lack of practice hurt me", 1),
        ("she is so close to home that she can almost touch it", 1),
        ("you spend so you do not run out of cash", 1),
        ("Artificial intelligence has changed how work is done.", 1),
    ]
    goodok = 0
    for text, want in good:
        ok, why = check(text)
        mark = "ok " if ok == bool(want) else "FAIL"
        if ok == bool(want):
            goodok += 1
        print(f"  {mark} allow {text[:40]:<42} fluent={ok}")

    # 3. the regression test: no false positives over 32 real essays
    passed, total, fails = validate()
    print(f"\n  human corpus: {passed}/{total} pass")
    for f, why in fails:
        print(f"    FALSE POSITIVE {f}: {why}")

    rc = 0 if (caught == len(bad) and goodok == len(good) and passed == total) else 1
    sys.exit(rc)
