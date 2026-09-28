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
