"""Refuse a humanizer rewrite that changed the FACTS.

Owner, 2026-09-28: *"build in the quote research+preserving guard for humanization"*.

★ THIS EXISTS BECAUSE THE DAMAGE WAS MEASURED, NOT IMAGINED. Humanizing real work through HIP
produced all three of these, on a single four-biography job:

  1. **A fabricated quotation.** Rewriting a Locke paragraph, the model grew it 77 → 155 words
     by inventing TWO quotations in the style of the real one ("a government, by the consent
     of the people, is an honest government…"). A base model handed a quotation treats it as a
     cue to produce more of them.
  2. **A fabricated date.** It appended a birth-death range that was never in the source and got
     the death date WRONG — `David Hume (May 7 1711 – February 25 1776)`; Hume died 25 August
     1776.
  3. **A fabricated correction reversal.** After a fake quote was replaced with a real one, a
     rewrite pass paraphrased the FAKE quote back in — undoing a factual correction upstream.

**⇒ A "humanizer" that invents facts is not a style tool, it is a misinformation tool.** For
anything factual, an unrewritten sentence is worth more than a fluent invented one. That is the
whole trade this module makes: when the guard cannot verify, it keeps the original.

★ THE GUARD IS A CONTENT DIFF, NOT A LENGTH CHECK. Length catches case 1 only, and only in one
direction: the existing shrink guard already rejected rewrites that LOST content, so growth was
the unguarded direction — and growth is the shape fabrication takes. Numbers, dates and proper
nouns are the checkable facts, so they are what gets compared.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

# A rewrite may not grow beyond this share of its input. Fabrication inflates; a faithful
# rewrite of the same content stays close to the original length.
#
# ★ THIS IS A BACKSTOP, NOT THE DETECTOR. The measured fabrication ran 77 -> 155 words (2.0x),
# and the PRECISE checks (quotations, numbers, names) caught it independently. 1.6x was too
# tight: a faithful restyle that adds a short lead-in clause reached 1.67x and was refused, and
# a guard that blocks real work gets switched off. 1.8x still catches near-doubling while
# leaving room for ordinary expansion.
MAX_GROWTH_RATIO = 1.8
# A quotation of at least this many characters is a claim about what someone said, so it must
# be accounted for in both directions.
QUOTE_MIN_CHARS = 20

_QUOTE_RE = re.compile(r'"[^"]{%d,}"' % QUOTE_MIN_CHARS)
# Numbers, dates and year ranges: the things a fabricated fact usually is.
_NUMBER_RE = re.compile(r"\b\d{1,4}(?:[./-]\d{1,4})*\b")
# Capitalised runs — proper nouns. Deliberately excludes a sentence's first word only by
# comparing against the source as a whole rather than trying to parse grammar.
_PROPER_RE = re.compile(r"\b[A-Z][a-zA-Z\u00C0-\u024F]+(?:\s+[A-Z][a-zA-Z\u00C0-\u024F]+)*\b")


def _quotes(text: str) -> List[str]:
    return [q.strip() for q in _QUOTE_RE.findall(text or "")]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def check_preservation(source: str, rewritten: str) -> Dict[str, Any]:
    """Whether `rewritten` is a faithful restyle of `source`.

    Returns a verdict dict. `ok=False` means the rewrite must be discarded and the source
    kept. `violations` names each reason, because "rejected" without a reason cannot be
    reviewed or tuned.
    """
    src = source or ""
    out = rewritten or ""
    violations: List[str] = []

    src_words = len(src.split())
    out_words = len(out.split())
    if src_words and out_words > src_words * MAX_GROWTH_RATIO:
        violations.append(
            f"grew {src_words}->{out_words} words "
            f"({out_words / max(1, src_words):.2f}x, limit {MAX_GROWTH_RATIO}x)")

    # ── quotations: never more, never fewer, never different ────────────────
    src_q, out_q = _quotes(src), _quotes(out)
    src_set = {_norm(q) for q in src_q}
    out_set = {_norm(q) for q in out_q}
    added = [q for q in out_q if _norm(q) not in src_set]
    dropped = [q for q in src_q if _norm(q) not in out_set]
    if added:
        violations.append(
            f"invented {len(added)} quotation(s): {added[0][:70]!r}")
    if dropped:
        violations.append(
            f"dropped {len(dropped)} quotation(s): {dropped[0][:70]!r}")

    # ── numbers and dates ───────────────────────────────────────────────────
    src_nums = set(_NUMBER_RE.findall(src))
    out_nums = set(_NUMBER_RE.findall(out))
    invented = sorted(out_nums - src_nums)
    if invented:
        violations.append(f"invented number/date(s): {', '.join(invented[:6])}")

    # ── proper nouns ────────────────────────────────────────────────────────
    # ★ ONLY MID-SENTENCE CAPITALISATION COUNTS. A word at the start of a sentence is
    # capitalised by grammar, not by being a name — measured: "Those ideas went on to…" was
    # reported as introducing the name "Those", and a guard that fires on ordinary English
    # gets switched off. A new name used MID-sentence ("…alongside Kant and Voltaire") is
    # unambiguous, because nothing but a proper noun is capitalised there.
    src_lower = src.lower()
    src_tokens = {w.lower().strip(".,;:!?") for w in src.split()}
    new_names = []
    for m in _PROPER_RE.finditer(out):
        name = m.group(0).strip()
        # Sentence-initial? Look back past whitespace and quote characters.
        prefix = out[:m.start()].rstrip()
        if not prefix or prefix[-1] in '.!?"':
            continue
        if name.lower() in src_lower:
            continue
        if len(name.split()) == 1 and name.lower() in src_tokens:
            continue
        new_names.append(name)
    if new_names:
        # Bounded to a few so the message stays readable.
        violations.append(f"introduced name(s) not in the source: {', '.join(new_names[:5])}")

    return {
        "ok": not violations,
        "violations": violations,
        "src_words": src_words,
        "out_words": out_words,
        "quotes_in": len(src_q),
        "quotes_out": len(out_q),
    }


def is_faithful(source: str, rewritten: str) -> bool:
    """Boolean form for a caller that only needs the gate."""
    return check_preservation(source, rewritten)["ok"]


# ── AUGMENT, DO NOT DISCARD (owner 2026-09-28) ───────────────────────────────────
#
# Owner, after the guard shipped: *"Instead of discarding humanized text cuz it invented fake
# quotes just make sure the ai agents that are using the humanize tool just edit the quote
# manually, regenerating everytime they fake a quote is a never ending cat and mouse chase"*.
#
# He is right, and this is the better design. Asking the model to regenerate until it happens
# to produce a faithful quotation is a lottery: each attempt is an independent draw with no
# memory of the last failure, so a task can burn its whole budget and still come back with an
# invented Locke. Repairing the text is DETERMINISTIC — the source holds the true wording, so
# restoring it dictates the answer rather than hoping for one.
#
# The split is by what can be repaired SAFELY:
#   • QUOTATIONS are repaired automatically. The source is ground truth for the exact wording,
#     so putting it back cannot introduce an error of its own.
#   • NUMBERS, DATES and NAMES are only FLAGGED. Deleting an invented year can leave a sentence
#     nonsense ("Hume (May 7 1711 – ) was born…"), so an agent — which can read the sentence —
#     makes that edit. Handing over a sentence that needs judgement is honest; mangling it to
#     look automatic is not.

# A quote this short is more likely to be a scare-quoted word than a citation.
_CITATION_MIN_WORDS = 4


def _citation_quotes(text: str) -> List[str]:
    """Quotations long enough to be a claim about what someone said."""
    out = []
    for q in _quotes(text):
        if len(q.split()) >= _CITATION_MIN_WORDS:
            out.append(q)
    return out


def repair_quotes(source: str, rewritten: str) -> Dict[str, Any]:
    """Put the source's real quotations back into `rewritten`.

    Drops any quotation the rewrite invented, and replaces an ALTERED one IN PLACE with the
    source's exact wording. Returns the repaired text plus a record of every edit, so the
    caller can report what it changed rather than silently rewriting the user's prose.

    ★ IN PLACE, NOT APPENDED. A first version removed the altered quotation and appended the
    real one as a new sentence, which produced `He wrote, His ideas ... Revolution. He wrote,
    ""The end of law...""` — a dangling clause, doubled quote marks, and the quotation now
    sitting in the wrong part of the paragraph. Replacing the span keeps the sentence the
    rewrite built and only dictates the words inside it, which is the whole point.

    Deliberately does NOT touch numbers, dates or names — see the section comment.
    """
    src_quotes = _citation_quotes(source)
    out_quotes = _citation_quotes(rewritten)
    src_by_key = {_norm(q): q for q in src_quotes}
    surviving = {_norm(q) for q in out_quotes if _norm(q) in src_by_key}

    repaired = rewritten
    edits: List[Dict[str, str]] = []

    # The source quotations this rewrite does not contain. One missing means the rewrite
    # almost certainly ALTERED it, so it is restored in place rather than thrown away.
    missing = [q for q in src_quotes if _norm(q) not in surviving]

    # 1. Walk the rewrite's quotations. Longest first so a nested span is handled before its
    #    own substring.
    for q in sorted(out_quotes, key=lambda s: -len(s)):
        if _norm(q) in src_by_key:
            continue                                     # already correct
        if len(missing) == 1 and not edits:
            # ALTERED — swap the words inside the existing quotation marks, keeping position.
            replacement = f'"{missing[0]}"'
            if f'"{q}"' in repaired:
                repaired = repaired.replace(f'"{q}"', replacement, 1)
            else:
                repaired = repaired.replace(q, missing[0], 1)
            edits.append({"action": "restored_quote_in_place", "quote": missing[0]})
        else:
            # INVENTED — remove the quotation entirely, marks included.
            repaired = repaired.replace(f'"{q}"', "", 1)
            if q in repaired:                            # was not quote-wrapped
                repaired = repaired.replace(q, "", 1)
            edits.append({"action": "removed_invented_quote", "quote": q})

    # 2. A source quotation still absent after the pass cannot be placed without guessing where
    #    it belongs — that is the agent's call, not ours.
    final_keys = {_norm(q) for q in _citation_quotes(repaired)}
    for q in src_quotes:
        if _norm(q) not in final_keys:
            edits.append({"action": "quote_missing_needs_agent", "quote": q})

    # 3. Tidy what the excisions left behind: doubled spaces, an orphaned quote mark, empty
    #    quote pairs, punctuation with a space before it, and dangling connectives.
    repaired = repaired.replace('""', "")
    repaired = re.sub(r'\s*"\s*"', " ", repaired)
    repaired = re.sub(r"\s{2,}", " ", repaired)
    repaired = re.sub(r"\s+([.,;:!?])", r"\1", repaired)
    repaired = re.sub(r"\.\s*\.", ".", repaired)
    # "He wrote, ." and "He wrote, His" — a quotation tag left without its quotation.
    repaired = re.sub(r",\s*(?=[.,;:!?]|$)", "", repaired)
    repaired = re.sub(r"\b(wrote|said|stated|argued|noted|claimed)\s*,\s*"
                      r"(?=[A-Z])", r"\1 that ", repaired)
    repaired = repaired.strip()

    verdict = check_preservation(source, repaired)
    return {
        "text": repaired,
        "edits": edits,
        "still_unfaithful": [] if verdict["ok"] else verdict["violations"],
        "repaired": bool(edits),
    }


def agent_todo(source: str, rewritten: str) -> List[str]:
    """What an AGENT must fix by hand in a humanized draft, in plain instructions.

    Deliberately narrow: only the facts that cannot be repaired automatically. An empty list
    means the draft is safe to use as-is.
    """
    v = check_preservation(source, rewritten)
    if v["ok"]:
        return []

    todos: List[str] = []
    for violation in v["violations"]:
        if violation.startswith("invented number/date"):
            todos.append(
                "A number or date was introduced that is not in the original: "
                f"{violation.split(':', 1)[1].strip()}. Check it against the source and either "
                "correct it or remove it — do NOT leave an unverified figure in place."
            )
        elif violation.startswith("introduced name"):
            todos.append(
                "A person or place was introduced that is not in the original: "
                f"{violation.split(':', 1)[1].strip()}. Verify each one or remove it."
            )
        elif violation.startswith("dropped") or violation.startswith("invented") and "quot" in violation:
            todos.append(
                "A quotation does not match the original. Restore the source's exact wording — "
                "quotations must be character-for-character."
            )
        elif violation.startswith("grew"):
            todos.append(
                "The rewrite is much longer than the original, which usually means content was "
                "invented. Read it against the source and cut anything that is not in it."
            )
        else:
            todos.append(violation)
    # De-duplicate while keeping order — the same instruction twice reads like a bug.
    seen, out = set(), []
    for t in todos:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out
