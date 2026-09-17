"""Iterative paraphrasing: paraphrase the previous round, not the original.

WHY THIS EXISTS. An earlier scan batch put 50 single-pass "rewrite this" variants
through a detector and every one came back 100% AI. The research explains why:
single-pass rewriting is the *Simple Paraphrase* baseline, and both the 2026 HIP
study (*Base Models Look Human To AI Detectors*, arXiv 2605.19516) and the DIPPER
work (Krishna et al., NeurIPS 2023) measured it as failing, where recursive
paraphrasing succeeded.

THE MECHANISM. Single-pass rewriting anchors to the original: the model reproduces
the same sentence shapes with different words, so the local token statistics stay
in the same region. Iterative paraphrasing breaks that anchor by paraphrasing the
PREVIOUS OUTPUT rather than the original, so the text drifts progressively instead
of re-converging. HIP measured the drift becoming visible by round 2 and settling
by round 10, with semantic fidelity preserved.

    python iterative.py --text scan_batch/00_baseline.txt --rounds 10
"""

from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

from rewrite import call_llm, load_key
from rubric import measure

# The paraphrase instruction. Deliberately does NOT say "keep the structure" or
# "improve" - anchoring language drags the output back toward the original's
# sentence shapes, which is the failure mode of single-pass rewriting.
SYSTEM = """You are a paraphrasing engine. Rewrite the text so that every sentence
is expressed differently, while the meaning is preserved exactly.

Rules:
  * Preserve every factual claim and every argument exactly.
  * Do not add facts, examples, statistics, citations or opinions.
  * Do not add hedges or filler.
  * You may restructure sentences, merge them, split them, and reorder clauses.
  * Do not copy any sentence verbatim; change the phrasing of all of them.
  * Keep the same number of paragraphs.
  * Return ONLY the rewritten text."""

# Round-to-round temperature. Higher later, because the point of the iteration is
# to keep moving away; a low temperature would re-converge on the same shapes.
def temp_for(r: int) -> float:
    return min(1.25, 0.85 + 0.05 * r)


def paraphrase_once(key: str, text: str, rnd: int) -> str:
    prompt = f"Paraphrase the following text.\n\n{text}"
    return call_llm(key, prompt, system=SYSTEM,
                    max_tokens=20000, temperature=temp_for(rnd))


def tfidf_sim(a: str, b: str) -> float:
    """Content-word cosine similarity, as a cheap meaning-preservation proxy."""
    import math
    from collections import Counter

    def vec(t):
        c = Counter(w.lower().strip(".,;:()") for w in t.split() if len(w) > 3)
        return c
    va, vb = vec(a), vec(b)
    keys = set(va) | set(vb)
    if not keys:
        return 0.0
    dot = sum(va.get(k, 0) * vb.get(k, 0) for k in keys)
    na = math.sqrt(sum(v * v for v in va.values()))
    nb = math.sqrt(sum(v * v for v in vb.values()))
    return dot / (na * nb) if na and nb else 0.0


def run(text: str, rounds: int, genre: str, ref, outdir: str) -> dict:
    key = load_key()
    os.makedirs(outdir, exist_ok=True)
    hist = []
    cur = text
    for r in range(1, rounds + 1):
        try:
            nxt = paraphrase_once(key, cur, r)
        except Exception as e:
            print(f"    round {r}: FAILED {type(e).__name__}: {str(e)[:120]}",
                  flush=True)
            break
        sim = tfidf_sim(text, nxt)
        v = measure(nxt, genre, ref=ref)
        rec = {"round": r, "words": len(nxt.split()),
               "sim_to_original": sim,
               "burst": v["syntactic_burstiness_factor"],
               "ppl": v["model_perplexity_baseline"],
               "text": nxt}
        hist.append(rec)
        path = os.path.join(outdir, f"iter_{r:02d}.txt")
        open(path, "w").write(nxt)
        print(f"    round {r:2}: {rec['words']:4}w  sim {sim:.3f}  "
              f"burst {rec['burst']:.3f}  ppl {rec['ppl']:.0f}  -> {path}",
              flush=True)
        cur = nxt
    return {"rounds": hist}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--rounds", type=int, default=10)
    ap.add_argument("--genre", default="technical")
    ap.add_argument("--outdir", default=str(_HERE / "iterative"))
    args = ap.parse_args()

    text = open(args.text, encoding="utf-8", errors="replace").read().strip()
    from refmodel import load_ref_model
    ref = load_ref_model()
    base = measure(text, "technical", ref=ref)
    print(f"  input {len(text.split())}w  burst {base['syntactic_burstiness_factor']:.3f}"
          f"  ppl {base['model_perplexity_baseline']:.0f}")
    res = run(text, args.rounds, args.genre, ref, args.outdir)
    json.dump({k: [{kk: vv for kk, vv in r.items() if kk != "text"}
                   for r in v] for k, v in res.items()},
              open(os.path.join(args.outdir, "history.json"), "w"), indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
