"""A generative structural engine for prose, in the shape of the typing engine.

THE ARGUMENT FOR THIS. Every LLM-based humanization failed, measured 70+ ways.
The one thing that moved the detectors was a structural rewrite. And the typing
engine already proved the working pattern on this project:

    typing engine                     structural prose engine
    ------------------------------    ------------------------------------
    explicit parameters (12 knobs)    explicit distribution targets
    draws samples (bursts, gaps)      draws sentence/paragraph lengths
    features measured (149)           features measured (56)
    oracle (human_typing_score)       oracle (ensemble mega-score)
    search loop over knobs            search loop over targets

WHY THE PREVIOUS ATTEMPT UNDERDELIVERED. `surgical.py` applied one-way transforms:
it split long sentences and `sentence_length_variance` went 57 -> 53, i.e. the
WRONG WAY. Splitting lowers the maximum, and variance needs both extremes present.
A transform cannot fix a distribution; it has to be regated to one. This engine
therefore works from TARGET DISTRIBUTIONS measured on human prose, and reshapes the
document to match - including deliberately manufacturing very short sentences,
which no split operation can produce.

The operations are all deterministic text surgery - split, merge, isolate, inject -
so there is no AI model in the loop and the whole thing runs on CPU in seconds.

    python structure.py --text baseline.txt --targets
    python structure.py --text baseline.txt --apply
"""
from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent

import argparse
import json
import os
import random
import re
import statistics as st
import sys

from levers import split_sentences, split_paragraphs

HERE = os.path.dirname(os.path.abspath(__file__))
TARGETS_PATH = os.path.join(HERE, "structure_targets.json")

# Sentence-length classes, in words. Human expository prose is strongly bimodal -
# a mass of short declaratives plus a few very long periodic sentences - while LLM
# output clusters around a narrow middle. These bands are what a generator samples.
BANDS = {
    "very_short": (3, 7),
    "short": (8, 14),
    "mid": (15, 24),
    "long": (25, 39),
    "very_long": (40, 70),
}


def sentence_lengths(text: str) -> list[int]:
    out = []
    for p in split_paragraphs(text):
        out += [len(s.split()) for s in split_sentences(p)]
    return out


def band_of(n: int) -> str:
    for name, (lo, hi) in BANDS.items():
        if lo <= n <= hi:
            return name
    return "very_long" if n > 70 else "very_short"


def distribution(lens: list[int]) -> dict:
    if not lens:
        return {}
    c = {b: 0 for b in BANDS}
    for n in lens:
        c[band_of(n)] += 1
    return {k: v / len(lens) for k, v in c.items()}


# --------------------------------------------------------------- target fitting
def fit_targets() -> dict:
    """Measure the target distribution band-share on genre-matched HUMAN prose.

    This is the equivalent of the typing engine's fitted keystroke profile: the
    numbers come from real human writing, not from a guess, and they are stored so
    the engine and the validator cannot disagree about them.
    """
    import warnings
    warnings.filterwarnings("ignore")
    sys.path.insert(0, HERE)
    corpus_path = os.path.join(HERE, "calibration", "corpus.json")
    if not os.path.exists(corpus_path):
        raise SystemExit("need calibration/corpus.json - run calibrate.py --build")
    corpus = json.load(open(corpus_path))
    hs = [distribution(sentence_lengths(t)) for _, t in corpus["human"]]
    as_ = [distribution(sentence_lengths(t)) for _, t in corpus["ai"]]
    bands = list(BANDS)
    human = {b: st.mean([d.get(b, 0) for d in hs]) for b in bands}
    ai = {b: st.mean([d.get(b, 0) for d in as_]) for b in bands}
    out = {"bands": {k: list(v) for k, v in BANDS.items()},
           "human_band_share": human, "ai_band_share": ai,
           "n_human": len(hs), "n_ai": len(as_)}
    json.dump(out, open(TARGETS_PATH, "w"), indent=1, default=float)
    return out


def targets() -> dict:
    if not os.path.exists(TARGETS_PATH):
        return fit_targets()
    return json.load(open(TARGETS_PATH))


# ------------------------------------------------------------------ operations
def split_at_midpoint(s: str) -> tuple[str, str] | None:
    """Split a sentence into two, preferring a real clause boundary.

    Returns None when the sentence has no sensible break, so the caller can try a
    different operation rather than producing a sentence fragment.
    """
    words = s.split()
    if len(words) < 12:
        return None
    # Prefer a comma+conjunction, then a semicolon, then a comma before a
    # conjunction-like word, then the midpoint as a last resort.
    for pat in (r",\s+(?:and|but|which|while|because|although|so|yet|or)\s+",
                r";\s+", r",\s+(?:however|therefore|thus|moreover|furthermore)\s+",
                r"\s+(?:and|but|which|while|because|although)\s+"):
        m = re.search(pat, s)
        if m and 4 <= len(s[:m.start()].split()) and 4 <= len(s[m.end():].split()):
            head = s[:m.start()].rstrip(",; ").rstrip()
            tail = s[m.end():]
            tail = tail[:1].upper() + tail[1:]
            if not head.endswith("."):
                head += "."
            if not tail.endswith((".", "!", "?")):
                tail = tail.rstrip(".") + "."
            return head, tail
    # Fallback: break at a comma near the middle.
    commas = [m.start() for m in re.finditer(r",\s+", s)]
    if commas:
        mid = len(s) // 2
        cut = min(commas, key=lambda c: abs(c - mid))
        head = s[:cut].rstrip(", ").rstrip() + "."
        tail = s[cut:].lstrip(", ").strip()
        tail = tail[:1].upper() + tail[1:]
        if not tail.endswith("."):
            tail += "."
        if len(head.split()) >= 4 and len(tail.split()) >= 4:
            return head, tail
    return None


def shorten(s: str, floor: int = 3) -> list[str]:
    """Reduce a sentence to a short one by dropping a trailing adjunct.

    Manufacturing SHORT sentences is the half of the distribution a transform can
    never reach: no amount of splitting a 30-word sentence yields a 4-word one.
    """
    parts = re.split(r",\s+(?:which|that|while|although|because|and|but)\s+", s, maxsplit=1)
    if len(parts) == 2 and len(parts[0].split()) >= floor:
        head = parts[0].strip().rstrip(",") + "."
        rest = parts[1].strip()
        if rest and not rest.endswith("."):
            rest += "."
        return [head, rest]
    m = re.search(r"\s+(?:in|by|through|with|for|from|during|after|before)\s+[^,]{8,}$", s)
    if m:
        head = s[:m.start()].strip().rstrip(",")
        tail = s[m.start():].strip()
        if len(head.split()) >= floor:
            if not head.endswith("."):
                head += "."
            tail = tail[:1].upper() + tail[1:]
            if not tail.endswith("."):
                tail += "."
            return [head, tail]
    return [s]


def merge_two(a: str, b: str) -> str:
    """Join two adjacent sentences into one long one.

    Supplies the LONG tail. Uses a semicolon rather than 'and', because a semicolon
    raises a feature where human prose already outstrips LLM prose.
    """
    left = a.rstrip().rstrip(".!?")
    right = b.strip()
    right = right[:1].lower() + right[1:]
    return f"{left}; {right}"


# ------------------------------------------------------------------- reshaping
def reshape(text: str, tgt: dict | None = None, strength: float = 1.0,
            seed: int = 0, params: dict | None = None) -> tuple[str, dict]:
    """Regate the document's sentence-length distribution toward the human target.

    PARAMETERIZED, because the first version had a bug that is worth recording: it
    split long sentences and pushed variance 60 -> 26, the WRONG direction. Two
    causes, both real:
      * splitting a long sentence yields two MID sentences, and the baseline was
        already short of short ones, not long ones (baseline long 0.400 vs human
        0.206 - it had TOO MANY long sentences)
      * the merge pass required both sentences <= 14 words, which after splitting
        almost never held, so the long tail was never rebuilt (0.400 -> 0.000)

    So the operations are now weighted by explicit parameters and the direction of
    each is driven by the measured gap between the document and the human target,
    rather than by a fixed pipeline. That is what makes it searchable.
    """
    tgt = tgt or targets()
    want = tgt["human_band_share"]
    rng = random.Random(seed)
    q = {"p_split": 0.15, "p_shorten": 0.85, "p_merge": 0.90,
         "split_at": 34, "merge_max": 16}
    if params:
        q.update(params)
    notes = {"split": 0, "shorten": 0, "merge": 0, "kept": 0}

    paras_out = []
    for para in split_paragraphs(text):
        sents = split_sentences(para)
        if not sents:
            continue

        # Pass 1: shorten. This is the operation the baseline actually needs -
        # its deficit is at the SHORT end (very_short 0.057 vs human 0.161).
        # Only applies to sentences already longer than the short band, and only
        # where a real adjunct boundary exists to detach.
        stage = []
        for s in sents:
            n = len(s.split())
            if n >= 15 and rng.random() < q["p_shorten"] * strength:
                parts = shorten(s)
                if len(parts) == 2:
                    stage += parts
                    notes["shorten"] += 1
                    continue
            stage.append(s)

        # Pass 2: split the genuinely long ones. Threshold is a parameter because
        # splitting too eagerly is what created the mid-band pile-up.
        stage2 = []
        for s in stage:
            n = len(s.split())
            if n >= q["split_at"] and rng.random() < q["p_split"] * strength:
                parts = split_at_midpoint(s)
                if parts:
                    stage2 += list(parts)
                    notes["split"] += 1
                    continue
            stage2.append(s)

        # Pass 3: rebuild the long tail by merging adjacent SHORT sentences.
        # The previous version demanded both be <= 14 words and so never fired;
        # the ceiling is now a parameter and the semicolon keeps the result long.
        stage3 = []
        i = 0
        while i < len(stage2):
            if (i + 1 < len(stage2) and rng.random() < q["p_merge"] * strength
                    and len(stage2[i].split()) <= q["merge_max"]
                    and len(stage2[i + 1].split()) <= q["merge_max"]):
                stage3.append(merge_two(stage2[i], stage2[i + 1]))
                notes["merge"] += 1
                i += 2
            else:
                stage3.append(stage2[i])
                i += 1
                notes["kept"] += 1
        paras_out.append(" ".join(stage3))

    return "\n\n".join(paras_out), notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text")
    ap.add_argument("--targets", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--strength", type=float, default=1.0)
    ap.add_argument("--out", default=str(_HERE / "structured.txt"))
    args = ap.parse_args()

    if args.targets:
        t = fit_targets()
        print(f"  fitted on {t['n_human']} human / {t['n_ai']} AI documents")
        print(f"  {'band':12} {'human':>8} {'AI':>8} {'gap':>8}")
        for b in BANDS:
            h, a = t["human_band_share"][b], t["ai_band_share"][b]
            print(f"  {b:12} {h:8.3f} {a:8.3f} {h - a:+8.3f}")
        print(f"  wrote {TARGETS_PATH}")
        return 0

    if not args.text:
        ap.error("pass --text or --targets")
    text = open(args.text, encoding="utf-8", errors="replace").read()
    before = sentence_lengths(text)
    print(f"  before: {len(before)} sentences, variance {st.pvariance(before):.1f}")
    out, notes = reshape(text, strength=args.strength)
    after = sentence_lengths(out)
    print(f"  after:  {len(after)} sentences, variance {st.pvariance(after):.1f}")
    print(f"  ops: {notes}")
    t = targets()
    print(f"  {'band':12} {'before':>8} {'after':>8} {'human':>8}")
    db, da = distribution(before), distribution(after)
    for b in BANDS:
        print(f"  {b:12} {db.get(b, 0):8.3f} {da.get(b, 0):8.3f} "
              f"{t['human_band_share'][b]:8.3f}")
    if args.apply:
        open(args.out, "w").write(out)
        print(f"  wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
