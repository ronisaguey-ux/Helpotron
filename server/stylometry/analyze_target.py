"""Analyze a the detector-confirmed human essay against the AI baseline and the corpus.

WHY THIS IS THE MISSING PIECE. Everything measured so far sits in a 0.048-wide band
(ensemble scores 0.453-0.501), so feature correlations computed across it are
correlations against a near-constant and cannot be trusted as a gradient. A text
that the detector itself calls 100% human extends the range by roughly 10x, and is the
first true positive example of the target.

This reports, for the supplied essay:
  * the ensemble score and every detector's raw vote
  * all 56 features, with the human and AI corpus means alongside, so each feature
    reads as "closer to human" or "closer to AI"
  * the features that best separate it from our own AI baseline, which is the
    actionable part: those are candidate targets for a rewrite

    python analyze_target.py --text human_essay.txt
"""
from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent

import argparse
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from refmodel import load_ref_model
from rubric import measure
import ranges as R


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--baseline", default=str(_HERE / "baseline700.txt"))
    ap.add_argument("--out", default=str(_HERE / "target_analysis.json"))
    args = ap.parse_args()

    text = open(args.text, encoding="utf-8", errors="replace").read()
    ref = load_ref_model()
    tgt = measure(text, "technical", ref=ref)

    from mega import mega, verdict
    m = mega(text)
    print(f"  TEXT: {args.text}  ({len(text.split())} words)")
    print(f"  ENSEMBLE SCORE: {m['score']:.3f}  ({verdict(m['score'])})")
    for v in m["votes"]:
        if v.get("usable"):
            print(f"    {v['name']:8} raw AI prob {v['raw_ai']:.4f}  "
                  f"-> human-confidence {v['human_prob']:.3f}  (AUROC {v['auroc']:.3f})")
    print()

    # Compare against the AI baseline and the human corpus
    disc = {}
    p = os.path.join(HERE, "feature_discovery.json")
    if os.path.exists(p):
        disc = {r["name"]: r for r in json.load(open(p))}
    base = measure(open(args.baseline).read(), "technical", ref=ref) \
        if os.path.exists(args.baseline) else None
    if base:
        mb = mega(open(args.baseline).read())
        print(f"  AI baseline ensemble score: {mb['score']:.3f} "
              f"({verdict(mb['score'])})")
    print()
    print(f"  {'feature':42} {'target':>10} {'AI base':>10} {'human':>10} {'AI':>10}")
    print("  " + "-" * 88)
    rows = []
    for pr in R.PARAMS:
        n = pr["name"]
        tv = tgt.get(n)
        bv = (base or {}).get(n)
        d = disc.get(n, {})
        hm, am = d.get("human_mean"), d.get("ai_mean")
        if tv is None:
            continue
        rows.append({"name": n, "target": tv, "baseline": bv,
                     "human_mean": hm, "ai_mean": am,
                     "cohens_d": d.get("cohens_d")})
    # Sort by how far the target sits toward human
    def toward_human(r):
        if r["ai_mean"] is None or r["human_mean"] is None:
            return 0.0
        gap = r["human_mean"] - r["ai_mean"]
        if abs(gap) < 1e-12:
            return 0.0
        return (r["target"] - r["ai_mean"]) / gap
    for r in sorted(rows, key=lambda x: -abs(toward_human(x))):
        th = toward_human(r)
        tag = ""
        if th > 0.8:
            tag = "HUMAN-like"
        elif th < 0.2:
            tag = "AI-like"
        print(f"  {r['name']:42} {r['target']:10.4g} "
              f"{(r['baseline'] if r['baseline'] is not None else float('nan')):10.4g} "
              f"{(r['human_mean'] if r['human_mean'] is not None else float('nan')):10.4g} "
              f"{(r['ai_mean'] if r['ai_mean'] is not None else float('nan')):10.4g}  {tag}")
    json.dump({"score": m["score"], "votes": [v for v in m["votes"] if v.get("usable")],
               "features": rows}, open(args.out, "w"), indent=1, default=float)
    print()
    print(f"  wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
