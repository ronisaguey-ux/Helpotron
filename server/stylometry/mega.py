"""The calibrated mega-score: a trustworthy free instrument for fine-tuning.

WHY CALIBRATION AND NOT AVERAGE. The first ensemble averaged raw probabilities and
was worthless. Measured on 10 human + 10 AI documents:

  detector   AUROC   human mean   AI mean
  tmr        0.970      0.563       0.976
  adal       0.950      0.714       0.874
  chatgpt    0.990      0.001       0.126
  openai     0.490      0.916       0.848   <- INVERTED, excluded

`chatgpt` has the BEST AUROC (0.990) and by far the WORST absolute scale - its
scores live between 0.001 and 0.126. A raw mean would let `tmr`, which operates
near 1.0, completely dominate a detector that is actually more discriminative.
And `openai` at AUROC 0.490 is a coin flip whose "AI" verdict is anti-correlated
with truth; including it would subtract real signal.

So each detector is converted to a **calibrated margin**: how far its score sits
from its own tuned threshold, in units of the observed human/AI separation. That
is what makes detectors with different scales and different thresholds
comparable, and it is the difference between a measurement and a vibe.

    from mega import mega
    mega(text)  -> {"score": 0.0-1.0, "verdict": ..., "votes": [...]}

Score meaning, matching the direction the humanizer optimizes:
    ~1.0  the ensemble is confident this is HUMAN
    ~0.5  ambiguous - the zone we want a humanized draft to reach
    ~0.0  confident AI
"""

from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CALIB = os.path.join(HERE, "calibration_results.json")

_calib_cache = None
_mega_cache = {}


def calibration(force: bool = False) -> dict:
    global _calib_cache
    if _calib_cache is None or force:
        if not os.path.exists(CALIB):
            raise SystemExit(
                f"no calibration at {CALIB} - run: python calibrate.py --build")
        _calib_cache = json.load(open(CALIB))
    return _calib_cache


def human_prob(raw: float, cal: dict) -> float:
    """Map one detector's raw AI-probability onto 0..1 human-confidence.

    The mapping is a logistic whose 0.5 point sits exactly on the detector's
    tuned threshold and whose slope comes from the measured spread between the
    human and AI means. A detector with a narrow spread (chatgpt: 0.001 -> 0.126)
    therefore gets a correspondingly steeper slope, so its honest confidence is
    preserved rather than compressed to nothing.
    """
    thr = cal["threshold"]
    hm, am = cal["human_mean"], cal["ai_mean"]
    # Scale: half the gap between the means, floored so a degenerate model
    # cannot produce an infinite slope.
    scale = max(abs(am - hm) / 2.0, 0.01)
    # AI scores should sit ABOVE the threshold; flip if the detector is inverted
    # so every detector speaks the same language at this point.
    signed = (raw - thr) if am >= hm else (thr - raw)
    import math
    p_ai = 1.0 / (1.0 + math.exp(-signed / scale))
    return 1.0 - p_ai


def mega(text: str, models: list[str] | None = None) -> dict:
    """Calibrated ensemble human-confidence for one text."""
    from ensemble import score_one

    cal = calibration()
    dets = cal["detectors"]
    names = models or [n for n in cal.get("usable", []) if n in dets]
    if not names:
        names = [n for n, d in dets.items() if d.get("usable")]
    if not names:
        return {"score": None, "error": "no usable detector in the calibration",
                "votes": []}

    votes, total_w = [], 0.0
    for n in names:
        d = dets.get(n) or {}
        if not d.get("usable"):
            votes.append({"name": n, "error": "not usable", "usable": False})
            continue
        try:
            raw = score_one(n, text)["ai_prob"]
        except Exception as e:
            votes.append({"name": n, "error": f"{type(e).__name__}: {str(e)[:90]}",
                          "usable": False})
            continue
        hp = human_prob(raw, d)
        # Weight by discriminative power above chance, so a 0.99 AUROC detector
        # counts several times a 0.75 one.
        w = max(0.0, d["auroc"] - 0.5)
        votes.append({"name": n, "raw_ai": raw, "human_prob": hp,
                      "weight": w, "auroc": d["auroc"], "usable": True})
        total_w += w

    good = [v for v in votes if v.get("usable")]
    if not good or total_w == 0:
        return {"score": None, "votes": votes, "error": "no detector produced a score"}
    score = sum(v["human_prob"] * v["weight"] for v in good) / total_w
    probs = sorted(v["human_prob"] for v in good)
    return {
        "score": score,
        "spread": probs[-1] - probs[0],
        "n_detectors": len(good),
        "agreement": "unanimous" if probs[-1] - probs[0] < 0.25 else "divided",
        "votes": votes,
    }


def verdict(score: float | None) -> str:
    if score is None:
        return "unknown"
    if score >= 0.80:
        return "reads human"
    if score >= 0.60:
        return "leaning human"
    if score >= 0.40:
        return "ambiguous"
    if score >= 0.20:
        return "leaning AI"
    return "reads AI"


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--text")
    ap.add_argument("--dir")
    ap.add_argument("--json")
    args = ap.parse_args()

    items = []
    if args.text:
        items.append((os.path.basename(args.text), open(args.text).read()))
    if args.dir:
        import glob
        for f in sorted(glob.glob(os.path.join(args.dir, "*.txt"))):
            items.append((os.path.basename(f),
                          open(f, encoding="utf-8", errors="replace").read()))
    if not items:
        ap.error("pass --text or --dir")

    out = []
    print(f"  {'file':28} {'score':>6} {'verdict':>14}  votes")
    for label, text in items:
        r = mega(text)
        r["label"] = label
        out.append(r)
        if r.get("score") is None:
            print(f"  {label[:28]:28}   FAILED  {r.get('error')}")
            continue
        vs = " ".join(f"{v['name'][:4]}={v['raw_ai']:.3f}" for v in r["votes"]
                      if v.get("usable"))
        print(f"  {label[:28]:28} {r['score']:6.3f} {verdict(r['score']):>14}  {vs}")
    if args.json:
        json.dump([{k: v for k, v in r.items() if k != "votes"} for r in out],
                  open(args.json, "w"), indent=1, default=float)
        print(f"  wrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
