"""Guarded iterated lever search.

The instrument measures; the levers transform. Neither is useful alone. This
chains them: try every lever at several strengths, measure each result, keep the
best step, repeat. That is the "apply levers one at a time and measure" loop the
manifesto asks for, run automatically.

THE GUARDRAIL IS NOT OPTIONAL. The manifesto is explicit that every lever needs
a guardrail measure that must not degrade, because a rubric can be satisfied two
ways and one of them is degenerate: `syntactic_dependency_depth` rises through
proper nesting *or* through garbage nesting. So a candidate is rejected outright
if it breaks document structure or wrecks the prose, before its score is even
considered.

WHAT THIS IS NOT: it is not the objective. The rubric is the man-in-the-middle
reward; the detector's AI score is the true objective and lives in a separate
layer. A win here is a hypothesis to test against the detector, not a result.

    python search.py --text essay.txt --genre technical --rounds 6
    python search.py --text essay.txt --genre technical --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import ranges as R
from levers import LEVERS, apply_lever, split_paragraphs
from refmodel import load_ref_model
from rubric import measure, summarize

STRENGTHS = (0.25, 0.5, 0.9)


# ------------------------------------------------------------------- guardrail
def guardrail(before_text: str, after_text: str, before_vals: dict,
              after_vals: dict) -> tuple[bool, str]:
    """Reject a candidate that damaged the document, regardless of its score.

    Ordered cheapest-first. Each check names the specific damage it exists to
    catch, so a rejection is explainable rather than mysterious.
    """
    if not after_text or len(after_text.strip()) < 40:
        return False, "text destroyed"

    # Structure: a transform must not merge or explode paragraphs.
    pb = len(split_paragraphs(before_text))
    pa = len(split_paragraphs(after_text))
    if pb and pa != pb:
        return False, f"paragraphs {pb}->{pa}"

    # Prose survives: word count within a generous band.
    wb = len(before_text.split())
    wa = len(after_text.split())
    if wb and not (0.7 * wb <= wa <= 1.5 * wb):
        return False, f"word count {wb}->{wa}"

    # Not degenerate: a real essay keeps some vocabulary spread and some
    # sentence-length variation. A lever that flattens either is damaging the
    # text to satisfy a number.
    if after_vals.get("type_token_ratio_windowed", 1.0) < 0.35:
        return False, "vocabulary collapsed"
    if after_vals.get("lexical_repetition_tolerance", 0.0) > 0.85:
        return False, "text became repetitive"

    # Compounding: no adjacent bigram may be duplicated ("I think I think it is
    # important"). Structure checks passed on exactly that output, because the
    # paragraphs and sentence count were untouched - the damage was local
    # repetition, so it needs its own check. A lever applied twice in
    # consecutive rounds caused it.
    w = after_text.split()
    dup = sum(1 for i in range(len(w) - 3)
              if w[i].lower() == w[i + 2].lower()
              and w[i + 1].lower() == w[i + 3].lower())
    if dup:
        return False, f"duplicated adjacent bigram x{dup}"

    # Punctuation must not be devastated or spammed.
    for ch, lo, hi in ((",", 0.05, 8.0), (".", 0.3, 12.0)):
        n = after_text.count(ch) / max(1, len(split_paragraphs(after_text)))
        if not (lo <= n <= hi):
            return False, f"punctuation {ch!r} density {n:.2f}"

    # Sentence count must stay in a plausible range: fragmentize can halve it,
    # flatten_sentences can too. Some change is the point; wholesale change is
    # not prose any more.
    sb = before_vals["_meta"]["sentences"]
    sa = after_vals["_meta"]["sentences"]
    if sb and not (0.55 * sb <= sa <= 1.9 * sb):
        return False, f"sentences {sb}->{sa}"

    return True, ""


# ----------------------------------------------------------------------- search
def score(vals: dict, genre: str, steerable_only: bool = True) -> float:
    """Lower is better. The mean range-width deviation over steerable params.

    Steerable-only by default, because calibration showed 27 of 56 parameters
    have a formula that disagrees with the manifesto on scale - including
    `model_perplexity_baseline`, which sits +246 range-widths out on ordinary
    prose and would dominate any average it entered.
    """
    return summarize(vals, genre, steerable_only=steerable_only)["mean_abs_deviation"]


def one_round(text: str, vals: dict, genre: str, ref, steerable_only: bool,
              verbose: bool = True) -> tuple[str, dict, list]:
    """Try every (lever, strength) and return the best legal step.

    Returns (new_text, new_vals, trials) where trials records every candidate
    with its score and its rejection reason. Keeping the rejections is the point:
    a run that silently discards candidates cannot be debugged.
    """
    base = score(vals, genre, steerable_only)
    trials = []
    best = (base, None, text, vals, "baseline")

    for name in LEVERS:
        for s in STRENGTHS:
            try:
                cand_text, notes, intent = apply_lever(name, text, strength=s)
            except Exception as e:
                trials.append({"lever": name, "strength": s, "ok": False,
                               "reason": f"{type(e).__name__}: {e}"})
                continue
            if cand_text.strip() == text.strip():
                trials.append({"lever": name, "strength": s, "ok": False,
                               "reason": "no change"})
                continue
            try:
                cand_vals = measure(cand_text, genre, ref=ref)
            except Exception as e:
                trials.append({"lever": name, "strength": s, "ok": False,
                               "reason": f"measure failed: {type(e).__name__}"})
                continue
            ok, why = guardrail(text, cand_text, vals, cand_vals)
            if not ok:
                trials.append({"lever": name, "strength": s, "ok": False,
                               "reason": why, "notes": notes})
                continue
            sc = score(cand_vals, genre, steerable_only)
            trials.append({"lever": name, "strength": s, "ok": True,
                           "score": sc, "delta": sc - base, "notes": notes,
                           "intent": intent})
            if sc < best[0] - 1e-9:
                best = (sc, name, cand_text, cand_vals, f"{name}@{s}")

    if verbose:
        legal = [t for t in trials if t.get("ok")]
        legal.sort(key=lambda t: t["score"])
        if legal:
            for t in legal[:3]:
                print(f"      {t['lever']:24}@{t['strength']:<4} "
                      f"{t['score']:.3f} ({t['delta']:+.3f})  {t['notes']}")
        else:
            print("      no legal candidate this round")

    return best[2], best[3], trials, best[0], best[1]


def search(text: str, genre: str, rounds: int, ref, steerable_only: bool,
           verbose: bool = True) -> dict:
    hist = []
    vals = measure(text, genre, ref=ref)
    start = score(vals, genre, steerable_only)
    best_text, best_score, best_vals = text, start, vals

    for i in range(rounds):
        if verbose:
            print(f"  round {i + 1}/{rounds} (score {best_score:.3f})", flush=True)
        try:
            new_text, new_vals, trials, sc, who = one_round(
                best_text, best_vals, genre, ref, steerable_only, verbose)
        except Exception as e:
            hist.append({"round": i + 1, "error": f"{type(e).__name__}: {e}"})
            break
        if sc >= best_score - 1e-9:
            hist.append({"round": i + 1, "accepted": None,
                         "score": best_score, "note": "no improving step"})
            if verbose:
                print("      converged: no lever improves the score legally")
            break
        hist.append({"round": i + 1, "accepted": who,
                     "score": sc, "delta": sc - best_score,
                     "n_trials": len(trials),
                     "n_legal": sum(1 for t in trials if t.get("ok"))})
        best_text, best_score, best_vals = new_text, sc, new_vals
        if verbose:
            print(f"      ACCEPT {who}  -> {sc:.3f} ({sc - start:+.3f} total)")

    return {"start_score": start, "end_score": best_score,
            "total_delta": best_score - start, "rounds": hist,
            "text": best_text, "vals": best_vals}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--genre", default="technical", choices=list(R.GENRES))
    ap.add_argument("--rounds", type=int, default=6)
    ap.add_argument("--all-params", action="store_true",
                    help="score against all 56 instead of the steerable subset")
    ap.add_argument("--out", help="write the improved text here")
    ap.add_argument("--json", help="write the run record here")
    ap.add_argument("--dry-run", action="store_true",
                    help="show what one round would pick, change nothing")
    args = ap.parse_args()

    with open(args.text, encoding="utf-8", errors="replace") as f:
        text = f.read()
    ref = load_ref_model()
    steerable = not args.all_params

    print(f"input: {args.text} "
          f"({len(text.split())} words, {len(split_paragraphs(text))} paragraphs)")
    res = search(text, args.genre, 1 if args.dry_run else args.rounds, ref,
                 steerable)

    print()
    print(f"  score {res['start_score']:.3f} -> {res['end_score']:.3f} "
          f"({res['total_delta']:+.3f})")
    print(f"  allowed {res['start_score'] - 1e-9:.3f} at start, "
          f"scored on {'steerable' if steerable else 'all 56'} parameters")

    if args.out and not args.dry_run:
        with open(args.out, "w") as f:
            f.write(res["text"])
        print(f"  wrote {args.out}")
    if args.json:
        with open(args.json, "w") as f:
            json.dump({k: v for k, v in res.items() if k != "vals"},
                      f, indent=1, default=float)
        print(f"  wrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
