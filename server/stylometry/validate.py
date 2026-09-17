"""Calibrate the instrument against labelled corpora.

The manifesto's ranges come from BNC/COCA and an LLM perplexity model we do not
have. Before any of them can steer a rewrite, we need to know which ones our
formulas actually reproduce. This script answers that with data:

  * builds genre samples from corpora that carry real labels
      technical  <- Brown 'learned'      (peer-reviewed / academic prose)
      biography  <- Brown 'belles_lettres' (essays, biographies, memoirs)
      fiction    <- Brown 'fiction' + 'romance'
      poetry     <- Gutenberg verse (Blake, Whitman, Milton)
  * measures every parameter on every sample
  * reports, per parameter: our mean, the manifesto's range, and whether we land
    inside it

Output `reference_profile.json` is the instrument's OWN empirical baseline:
per genre, per parameter, mean and spread across independent samples. rubric.py
can then express a draft's deviation in standard deviations of real prose, which
is meaningful even where the manifesto's absolute scale is not reproducible.

    python validate.py                # full run
    python validate.py --quick        # fewer, smaller samples
"""

from __future__ import annotations

import argparse
import json
import os
import statistics as st
import sys
import warnings

import ranges as R
from refmodel import load_ref_model

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "reference_profile.json")

BROWN_GENRE = {
    "technical": ["learned"],
    "biography": ["belles_lettres"],
    "fiction": ["fiction", "romance"],
}
GUTENBERG_POETRY = ["blake-poems.txt", "whitman-leaves.txt",
                    "milton-paradise.txt"]


def _chunks(words, size, count, stride=None):
    """Non-overlapping-ish word chunks, so samples are independent documents
    rather than re-measurements of the same passage."""
    out = []
    n = len(words)
    if n < size:
        return out
    stride = stride or size
    for i in range(0, n - size, stride):
        out.append(" ".join(words[i:i + size]))
        if len(out) >= count:
            break
    return out


def _clean(tokens):
    """Drop editorial marks, keep punctuation.

    The first version dropped every token with no alphabetic character, which
    silently removed all punctuation - so comma/em-dash/semicolon densities read
    exactly 0 on every corpus sample and character entropy came out low. The
    target was Brown's bracketed editorial marks, not the commas.
    """
    out = []
    for t in tokens:
        if not t:
            continue
        if t.startswith("[") or t.endswith("]"):
            continue
        out.append(t)
    return out


def build_samples(quick: bool) -> dict:
    warnings.filterwarnings("ignore")
    from nltk.corpus import brown, gutenberg

    size = 900 if quick else 1400
    count = 3 if quick else 8
    samples = {}

    for genre, cats in BROWN_GENRE.items():
        words = []
        for c in cats:
            for sent in brown.sents(categories=c):
                words.extend(_clean(sent))
        samples[genre] = _chunks(words, size, count)

    poems = []
    for fid in GUTENBERG_POETRY:
        try:
            poems.extend(_clean(gutenberg.words(fid)))
        except Exception as e:
            print(f"  skip {fid}: {e}", file=sys.stderr)
    samples["poetry"] = _chunks(poems, size, count)

    return samples


def run(quick: bool = False, verbose: bool = True) -> dict:
    from rubric import measure

    ref = load_ref_model()
    samples = build_samples(quick)
    per_genre = {}

    for genre, texts in samples.items():
        if verbose:
            print(f"  measuring {genre}: {len(texts)} samples "
                  f"x ~{len(texts[0].split()) if texts else 0} words", flush=True)
        runs = []
        for t in texts:
            try:
                runs.append(measure(t, genre, ref=ref))
            except Exception as e:
                print(f"    sample failed: {type(e).__name__}: {e}",
                      file=sys.stderr)
        if not runs:
            continue
        prof = {}
        for p in R.PARAMS:
            vals = [r[p["name"]] for r in runs
                    if r.get(p["name"]) is not None]
            if not vals:
                continue
            prof[p["name"]] = {
                "mean": st.mean(vals),
                "sd": st.pstdev(vals) if len(vals) > 1 else 0.0,
                "min": min(vals),
                "max": max(vals),
                "n": len(vals),
            }
        per_genre[genre] = prof

    out = {"samples": {g: len(v) for g, v in samples.items()},
           "profile": per_genre}
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, default=float)
    return out


def calibration_table(result: dict, stream=sys.stdout) -> None:
    """Where our formula reproduces the manifesto's range and where it does not.

    A parameter is `in range` when our measured corpus mean for that genre sits
    inside the manifesto's band. `ratio` is our mean divided by the nearer edge,
    so a ratio of 2 means we measure twice the published value - a scale
    difference between two formulas, not a property of the text.
    """
    prof = result["profile"]
    print(f"{'id':>3} {'parameter':42} "
          + " ".join(f"{g[:9]:>10}" for g in R.GENRES) + "   verdict",
          file=stream)
    print("-" * 110, file=stream)

    verdicts = {"reproducible": [], "scale_mismatch": [], "unmeasured": []}
    for p in R.PARAMS:
        row = []
        worst_ratio = 1.0
        checked = 0
        for g in R.GENRES:
            rng = p["ranges"].get(g)
            m = prof.get(g, {}).get(p["name"], {}).get("mean")
            if m is None:
                row.append("   --")
                continue
            if rng is None:
                row.append(f"{m:>10.3g}")
                continue
            checked += 1
            lo, hi = rng
            if lo <= m <= hi:
                row.append(f"{m:>9.3g}*")
            else:
                edge = lo if m < lo else hi
                ratio = m / edge if edge else float("inf")
                if edge and abs(ratio) > worst_ratio:
                    worst_ratio = abs(ratio)
                row.append(f"{m:>10.3g}")
        if checked == 0:
            verdict = "unmeasured"
        elif worst_ratio <= 1.15:
            verdict = "reproducible"
        else:
            verdict = f"scale x{worst_ratio:.1f}"
        verdicts["reproducible" if verdict == "reproducible" else
                 ("unmeasured" if verdict == "unmeasured" else "scale_mismatch")
                 ].append(p["name"])
        print(f"{p['id']:>3} {p['name']:42} " + " ".join(row)
              + f"   {verdict}", file=stream)

    print("-" * 110, file=stream)
    print(f"  * = our corpus mean lands inside the manifesto's range",
          file=stream)
    print(f"  reproducible {len(verdicts['reproducible'])}  |  "
          f"scale mismatch {len(verdicts['scale_mismatch'])}  |  "
          f"unmeasured {len(verdicts['unmeasured'])}", file=stream)
    if verdicts["reproducible"]:
        print("\n  REPRODUCIBLE - safe to steer a rewrite loop on the "
              "manifesto's ranges:", file=stream)
        for n in verdicts["reproducible"]:
            print(f"    {n}", file=stream)
    if verdicts["scale_mismatch"]:
        print("\n  SCALE MISMATCH - our formula and theirs disagree on the "
              "unit; use the empirical profile instead:", file=stream)
        for n in verdicts["scale_mismatch"]:
            print(f"    {n}", file=stream)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--json-only", action="store_true")
    args = ap.parse_args()
    print("building labelled samples and measuring...", flush=True)
    res = run(quick=args.quick)
    if not args.json_only:
        calibration_table(res)
        print(f"\n  wrote {OUT}")
    else:
        print(json.dumps(res, indent=1, default=float)[:2000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
