"""Measure which parameters each lever actually moves.

The manifesto's second step: "apply levers one at a time and measure which
parameters each lever truly moves. That is a measurement run - no corpus, no API
cost - and it replaces assumption with data."

A lever's stated intent is a hypothesis. This script tests it and reports the
truth, including the cases where the answer is "nothing" - a lever that moves
nothing is a lever that does not exist, however plausible its name.

    python measure_levers.py                       # default essays
    python measure_levers.py --strength 0.3 0.5 0.8
    python measure_levers.py --text foo.txt --genre technical
"""

from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent

import argparse
import json
import os
import statistics as st
import sys

import ranges as R
from levers import LEVERS, apply_lever
from refmodel import load_ref_model
from rubric import measure

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "lever_effects.json")

# Only parameters whose deviation we can compare are useful here, so a lever's
# effect is reported on the 56 rubric parameters plus the reference model.
DEFAULT_TEXTS = [
    str(_HERE / "essay_draft.txt"),
    str(_HERE / "essay500.txt"),
    str(_HERE / "essay300.txt"),
]

# A change smaller than this is treated as no change. Chosen from the corpus
# calibration: the spread of a parameter's own mean across independent samples
# of the same genre is the noise it must beat. 2% of the value is a conservative
# floor for that.
REL_THRESHOLD = 0.02


def _load(paths):
    out = []
    for p in paths:
        if os.path.exists(p):
            with open(p, encoding="utf-8", errors="replace") as f:
                out.append((os.path.basename(p), f.read()))
    return out


def _delta_effect(before: float, after: float) -> float:
    """Signed relative change, guarded against a zero baseline."""
    if before is None or after is None:
        return 0.0
    denom = abs(before) if abs(before) > 1e-9 else 1.0
    return (after - before) / denom


def run(texts, genre: str, strength: float, ref):
    """For each lever, the per-parameter effect aggregated across texts.

    Aggregation is the MEDIAN relative change, not the mean: one text where a
    regex happened to fire 40 times should not dominate two texts where it fired
    twice.
    """
    results = {}
    for name in LEVERS:
        per_param = {}
        intents = []
        for fname, text in texts:
            base = measure(text, genre, ref=ref)
            new, notes, intent = apply_lever(name, text, strength=strength)
            intents.append(intent)
            after = measure(new, genre, ref=ref)
            for p in R.PARAMS:
                k = p["name"]
                if base.get(k) is None or after.get(k) is None:
                    continue
                per_param.setdefault(k, []).append(_delta_effect(base[k], after[k]))
        effects = {}
        for k, deltas in per_param.items():
            med = st.median(deltas)
            if abs(med) >= REL_THRESHOLD:
                effects[k] = med
        results[name] = {
            "intent": intents[0] if intents else "",
            "moved": dict(sorted(effects.items(), key=lambda kv: -abs(kv[1]))),
            "n_texts": len(texts),
        }
    return results


def report(results, strength: float, stream=sys.stdout) -> None:
    print(f"LEVER EFFECTS at strength {strength:.2f}", file=stream)
    print(f"(|median relative change| >= {REL_THRESHOLD:.0%} across the texts "
          f"counts as a move)", file=stream)
    print(file=stream)

    dead = []
    for name, r in results.items():
        moved = r["moved"]
        if not moved:
            dead.append((name, r["intent"]))
            print(f"  {name}", file=stream)
            print(f"      intent: {r['intent']}", file=stream)
            print(f"      ACTUAL: moves nothing", file=stream)
            print(file=stream)
            continue
        print(f"  {name}", file=stream)
        print(f"      intent: {r['intent']}", file=stream)
        top = list(moved.items())[:6]
        print(f"      ACTUAL: moves {len(moved)} parameter(s); strongest:",
              file=stream)
        for k, v in top:
            print(f"        {k:44} {v:+.1%}", file=stream)
        # Intent check: does the strongest actual move match the stated intent?
        intent_words = set(r["intent"].replace(",", " ").split())
        head = list(moved)[0]
        # A crude but honest check: does any word of the intent appear in the
        # name of the parameter that actually moved most?
        agrees = any(w.strip("s") and w.strip("s") in head
                     for w in intent_words if len(w) > 3)
        if not agrees:
            print(f"      NOTE: strongest actual move is {head!r}, which does "
                  f"not match the stated intent", file=stream)
        print(file=stream)

    if dead:
        print(file=stream)
        print(f"  {len(dead)} lever(s) move nothing on this corpus: "
              + ", ".join(n for n, _ in dead), file=stream)
        print("  A lever that moves nothing is not a lever. Either its trigger "
              "phrases are absent from these texts, or its hypothesis is wrong.",
              file=stream)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", action="append", dest="texts")
    ap.add_argument("--genre", default="technical", choices=list(R.GENRES))
    ap.add_argument("--strength", type=float, nargs="+", default=[0.5])
    ap.add_argument("--out")
    args = ap.parse_args()

    paths = args.texts or DEFAULT_TEXTS
    texts = _load(paths)
    if not texts:
        print("no readable texts; pass --text", file=sys.stderr)
        return 1
    print(f"texts: {', '.join(n for n, _ in texts)}", flush=True)
    ref = load_ref_model()
    all_res = {}
    for s in args.strength:
        res = run(texts, args.genre, s, ref)
        report(res, s)
        all_res[f"{s:.2f}"] = res
        print("=" * 70, file=sys.stdout)

    out = args.out or OUT
    with open(out, "w") as f:
        json.dump({"genre": args.genre, "texts": [n for n, _ in texts],
                   "results": all_res}, f, indent=1, default=float)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
