"""The humanizer instrument.

Measures all 56 rubric parameters on one text and reports where it sits against
each genre's target range. This is the dense, cheap layer from the manifesto:
it steers a rewrite loop, it does not decide anything. The detector's AI score
is the objective and lives elsewhere.

    python rubric.py --text essay.txt --genre technical
    python rubric.py --text poem.txt  --genre poetry --json
    python rubric.py --text a.txt --genre technical --compare b.txt
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import ranges as R
from measures_a import Ctx, measure_a
from measures_b import measure_b
from refmodel import load_ref_model


def measure(text: str, genre: str, ref=None, calibrate: bool = False) -> dict:
    """All 56 parameters. Returns {name: value} plus a few extra measures that
    the table does not list but that cost nothing to collect."""
    ref = ref or load_ref_model()
    c = Ctx(text, ref)
    vals = {}
    vals.update(measure_a(c))
    vals.update(measure_b(c))

    # A few params need a value from another param's branch; fill those in.
    if "syntactic_dependency_depth" not in vals:
        depths = []
        from measures_a import depth_of
        for s in c.sents:
            cache = {}
            depths.append(max((depth_of(t, cache) for t in s), default=0))
        vals["syntactic_dependency_depth"] = sum(depths) / len(depths)
    if "clause_to_sentence_ratio" not in vals:
        vals["clause_to_sentence_ratio"] = (
            sum(c.clause_counts) / max(1, len(c.clause_counts)))

    vals["_meta"] = {
        "words": len(c.words),
        "sentences": c.n_sent,
        "paragraphs": len([p for p in text.split("\n\n") if p.strip()]),
        "genre": genre,
    }
    if calibrate:
        vals["_ref"] = {"fw_rate": round(ref.fw_rate, 4),
                        "uni_entropy": round(ref.unigram_entropy(), 3),
                        "vocab": len(ref.uni)}
    return vals


def deviations(vals: dict, genre: str) -> dict:
    """{name: deviation} for every parameter that has a target range."""
    out = {}
    for name in R.BY_NAME:
        v = vals.get(name)
        if v is None:
            continue
        d = R.deviation(name, v, genre)
        if d is not None:
            out[name] = d
    return out


def summarize(vals: dict, genre: str, steerable_only: bool = True) -> dict:
    """Counts that make a run comparable to another run.

    `off_target` counts parameters outside their range; `severe` counts those
    more than one range-width outside. Both are needed: one parameter can be
    wildly wrong while everything else is perfect, and a bare count hides that.

    `steerable_only=True` restricts the aggregate to parameters whose formula we
    validated against a labelled corpus. This is not cosmetic. Measured on a real
    essay, `model_perplexity_baseline` sat +246 and `intro_outro_symmetry_ratio`
    sat -15.3 range-widths out - and calibration showed those two are scale
    mismatches, not defects in the text. Averaging them into one number means the
    optimization chases a formula difference instead of moving prose, and it
    drowns out the twelve parameters that genuinely could move.
    """
    dev = deviations(vals, genre)
    if steerable_only:
        steerable = _steerable_set()
        if steerable:
            dev = {k: v for k, v in dev.items() if k in steerable}
    in_range = [n for n, d in dev.items() if d == 0.0]
    off = [(n, d) for n, d in dev.items() if d != 0.0]
    return {
        "genre": genre,
        "measured": len(dev),
        "in_range": len(in_range),
        "off_target": len(off),
        "severe": sum(1 for _, d in off if abs(d) > 1.0),
        "mean_abs_deviation": (sum(abs(d) for d in dev.values()) / len(dev)
                               if dev else 0.0),
        "worst": sorted(off, key=lambda kv: -abs(kv[1]))[:8],
        "steerable_only": steerable_only,
    }


_steerable_cache = None


def _steerable_set() -> set:
    """The parameters whose measured corpus mean lands inside the manifesto's
    published range - i.e. the ones whose scale we can trust. Written by
    validate.py; absent means no restriction (first run, before calibration)."""
    global _steerable_cache
    if _steerable_cache is not None:
        return _steerable_cache
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "calibration_split.json")
    try:
        with open(path) as f:
            _steerable_cache = set(json.load(f)["reproducible"])
    except Exception:
        _steerable_cache = set()
    return _steerable_cache


def report(vals: dict, genre: str, stream=sys.stdout) -> None:
    dev = deviations(vals, genre)
    meta = vals.get("_meta", {})
    print(f"genre: {R.GENRE_LABELS[genre]}  "
          f"| {meta.get('words', '?')} words, {meta.get('sentences', '?')} sentences",
          file=stream)
    print(f"{'id':>3} {'parameter':42} {'measured':>10} {'target':>18} {'dev':>7}",
          file=stream)
    print("-" * 86, file=stream)
    off = []
    for p in R.PARAMS:
        name = p["name"]
        v = vals.get(name)
        r = p["ranges"].get(genre)
        d = dev.get(name)
        vs = "n/a" if v is None else f"{v:.4g}"
        rs = "N/A" if r is None else f"{r[0]:g}-{r[1]:g}"
        ds = "" if d is None else ("ok" if d == 0.0 else f"{d:+.2f}")
        mark = " " if (d is None or d == 0.0) else "*"
        print(f"{mark}{p['id']:>3} {name:42} {vs:>10} {rs:>18} {ds:>7}",
              file=stream)
        if d not in (None, 0.0):
            off.append((name, d))
    print("-" * 86, file=stream)
    s = summarize(vals, genre)
    print(f"  in range {s['in_range']}/{s['measured']}   "
          f"off target {s['off_target']} (severe {s['severe']})   "
          f"mean |dev| {s['mean_abs_deviation']:.3f}", file=stream)
    if off:
        print("  furthest from target:", file=stream)
        for n, d in sorted(off, key=lambda kv: -abs(kv[1]))[:8]:
            print(f"    {n:42} {d:+.2f}", file=stream)


def compare(a: dict, b: dict, genre: str) -> None:
    """Which parameters moved between two measurements of the same genre."""
    print(f"{'parameter':42} {'A':>10} {'B':>10} {'delta':>10} {'toward?':>8}")
    print("-" * 84)
    moved = []
    for p in R.PARAMS:
        name = p["name"]
        va, vb = a.get(name), b.get(name)
        if va is None or vb is None:
            continue
        da = R.deviation(name, va, genre) or 0.0
        db = R.deviation(name, vb, genre) or 0.0
        if abs(db - da) < 1e-9 and abs(vb - va) < 1e-12:
            continue
        improved = "yes" if abs(db) < abs(da) - 1e-9 else (
            "no" if abs(db) > abs(da) + 1e-9 else "-")
        moved.append((name, va, vb, vb - va, improved, db - da))
    for name, va, vb, delta, improved, ddev in sorted(
            moved, key=lambda m: -abs(m[5])):
        print(f"{name:42} {va:>10.4g} {vb:>10.4g} {delta:>+10.4g} {improved:>8}")
    print("-" * 84)
    print(f"  {sum(1 for m in moved if m[4] == 'yes')} toward target, "
          f"{sum(1 for m in moved if m[4] == 'no')} away, "
          f"{len(moved)} moved of {len(R.BY_NAME)}")


def main() -> int:
    ap = argparse.ArgumentParser(description="56-parameter stylometric instrument")
    ap.add_argument("--text", required=True, help="path to the text file")
    ap.add_argument("--genre", default="technical", choices=list(R.GENRES))
    ap.add_argument("--json", action="store_true", help="emit JSON")
    ap.add_argument("--compare", help="second text; reports which params moved")
    ap.add_argument("--out", help="write the JSON result to this path")
    ap.add_argument("--calibrate", action="store_true",
                    help="include reference-model statistics")
    args = ap.parse_args()

    with open(args.text, encoding="utf-8", errors="replace") as f:
        text = f.read()
    ref = load_ref_model()
    vals = measure(text, args.genre, ref=ref, calibrate=args.calibrate)

    if args.compare:
        with open(args.compare, encoding="utf-8", errors="replace") as f:
            other = f.read()
        vb = measure(other, args.genre, ref=ref)
        compare(vals, vb, args.genre)
    elif args.json:
        print(json.dumps(vals, indent=2, default=float))
    else:
        report(vals, args.genre)

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w") as f:
            json.dump({"file": args.text, "genre": args.genre,
                       "values": vals, "summary": summarize(vals, args.genre)},
                      f, indent=1, default=float)
    return 0


if __name__ == "__main__":
    sys.exit(main())
