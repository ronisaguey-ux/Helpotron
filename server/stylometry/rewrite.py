"""LLM rewrite layer: the move the regex levers could not make.

WHY THIS EXISTS. The regex levers are surface transformations - insert a
connective, swap a word, add a citation. Measured against the detector real text
endpoint, a rubric-optimized essay scored BIT-IDENTICAL to its input (same
numbers to the last decimal on all six paragraphs), because the detector reads
perplexity and burstiness and those levers barely move either. `overall_burstiness`
sat at exactly 0 in every AI-classed text.

So the text score cannot be reached by transformation. It needs generation: the
sentences themselves have to change their surprisal and their rhythm.

THE TWO-LAYER DESIGN IS UNCHANGED. The rubric steers, the detector decides:
  1. generate candidate rewrites with an LLM, targeting the rubric gaps
  2. measure each with the instrument (56 params, instant, free)
  3. keep only candidates that improve the rubric WITHOUT breaking a guardrail
  4. validate the survivors against the real detector score - the true objective

Step 4 is the only one that can accept a result. A rubric win that does not move
the detector is a loss, and that is now measured rather than assumed.

    python rewrite.py --text essay.txt --genre technical --n 3

Routes through OpenRouter. Reads its key from $OPENROUTER_API_KEY, or from a
`.env` file in the repository root (override the path with $OPENROUTER_ENV).
"""

from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

from levers import split_paragraphs
from refmodel import load_ref_model
from rubric import measure, summarize

ENV_PATH = os.environ.get("OPENROUTER_ENV", str(_HERE.parent / ".env"))
MODEL = "deepseek/deepseek-v4.1-flash"
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

# The detector reads these, and the regex levers could not move them. So the
# prompt targets them by name rather than asking vaguely for "more human".
TARGETS = {
    "technical": (
        "sentence-length rhythm (vary between very short and long sentences), "
        "unpredictable word choices at the clause level, and lower-probability "
        "phrasing. Keep the meaning and every factual claim identical."
    ),
    "biography": (
        "temporal anchoring, varied sentence rhythm, concrete detail over "
        "abstraction. Keep every factual claim identical."
    ),
    "fiction": (
        "sentence-length rhythm, concrete sensory detail, and phrasing that a "
        "predictive model would not guess. Keep the events identical."
    ),
    "poetry": (
        "compressed syntax, unusual but apt word choices, and strong line-level "
        "rhythm. Keep the subject identical."
    ),
}

SYSTEM = """You are a prose editor. You rewrite text so it reads as if a specific
person wrote it by hand, while preserving every factual claim exactly.

What you are optimizing for is the STATISTICAL SHAPE of the sentences:
  * burstiness - deliberately mix very short sentences with long ones. Do not
    let consecutive sentences have similar length.
  * perplexity - avoid the most predictable next word. If a phrase is the
    obvious way to say it, find a less obvious but still natural way.
  * rhythm - vary clause structure; do not start consecutive sentences the same
    way, and do not use the same connective twice.

Hard rules:
  * Never add or remove a factual claim.
  * Never add hedges like "it is important to note" or "arguably".
  * Never add a citation, a statistic, or a source that was not there.
  * Keep the same number of paragraphs.
  * Return ONLY the rewritten text. No preamble, no explanation, no quotes."""


def load_key() -> str:
    if not os.path.exists(ENV_PATH):
        raise SystemExit(f"no .env at {ENV_PATH}")
    for line in open(ENV_PATH, encoding="utf-8", errors="replace"):
        line = line.strip()
        if line.startswith("OPENROUTER_API_KEY") and "=" in line:
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_API_KEY not found in .env")


def call_llm(key: str, user_prompt: str, system: str = SYSTEM,
             max_tokens: int = 12000, temperature: float = 1.0) -> str:
    """One OpenRouter call.

    `max_tokens` must be LARGE, and the reason is measured: deepseek-v4.1-flash
    emits a `reasoning` field alongside `content`, and it spends most of the
    budget thinking. Measured on a 383-word rewrite: 5,463 completion tokens of
    which **5,102 were reasoning**, leaving 1,954 chars of actual output. At
    `max_tokens=4096` the reasoning ate the whole budget, `content` came back
    null, and the fallback to `reasoning` returned the model's scratch work -
    2,769 words of "We need answer only rewritten text... Need preserve facts"
    instead of a rewritten essay. The guard below rejects that shape rather than
    silently accepting it.
    """
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user_prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=240)
        d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read()[:200]!r}") from None
    choice = (d.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    content = msg.get("content")
    if not content:
        raise RuntimeError(
            f"empty content (finish={choice.get('finish_reason')}, "
            f"reasoning={len(msg.get('reasoning') or '')} chars) - the budget was "
            f"consumed by reasoning; raise max_tokens")
    content = content.strip()
    # A leaked scratchpad looks like prose about the task rather than the text.
    leak_markers = ("We need answer", "Need preserve", "Let me count",
                    "The text has", "We must avoid", "Need keep same")
    if sum(1 for m in leak_markers if m in content[:600]) >= 2:
        raise RuntimeError("completion leaked reasoning into content")
    return content


def rubric_gaps(vals: dict, genre: str, top: int = 8) -> list[tuple[str, float, tuple]]:
    """The parameters furthest outside their target range - what the rewrite is
    asked to fix. Restricted to the calibrated-stable subset, because steering on
    a parameter whose formula disagrees with the manifesto's scale is steering at
    the wrong number."""
    import ranges as R
    from rubric import _steerable_set
    steerable = _steerable_set()
    out = []
    for p in R.PARAMS:
        name = p["name"]
        if steerable and name not in steerable:
            continue
        v = vals.get(name)
        r = p["ranges"].get(genre)
        if v is None or r is None:
            continue
        d = R.deviation(name, v, genre)
        if d:
            out.append((name, d, r))
    out.sort(key=lambda t: -abs(t[1]))
    return out[:top]


def build_prompt(text: str, genre: str, vals: dict, variant: int) -> str:
    gaps = rubric_gaps(vals, genre)
    lines = [f"Rewrite the {genre} text below.", "",
             "Target this statistical shape:", TARGETS.get(genre, TARGETS["technical"]),
             ""]
    if gaps:
        lines.append("Measured gaps in the current text (fix these, do not "
                     "overshoot past the range):")
        for name, d, r in gaps:
            direction = "too low" if d < 0 else "too high"
            lines.append(f"  * {name}: {direction}, target {r[0]}-{r[1]}")
        lines.append("")
    if variant:
        lines.append(f"This is variant {variant + 1}; make different choices "
                     "from the obvious ones.")
        lines.append("")
    lines += ["Text:", "", text]
    return "\n".join(lines)


def run(text: str, genre: str, n: int, ref, verbose: bool = True) -> dict:
    key = load_key()
    base = measure(text, genre, ref=ref)
    base_s = summarize(base, genre)
    if verbose:
        print(f"  baseline: in-range {base_s['in_range']}/{base_s['measured']}  "
              f"mean|dev| {base_s['mean_abs_deviation']:.3f}", flush=True)

    candidates = []
    for i in range(n):
        try:
            prompt = build_prompt(text, genre, base, i)
            out = call_llm(key, prompt, temperature=0.9 + 0.1 * i)
        except Exception as e:
            if verbose:
                print(f"    variant {i + 1}: FAILED {type(e).__name__}: {e}")
            continue
        # An LLM can wrap the text in quotes or add a preamble despite the
        # instruction; strip the common cases rather than fail.
        if out.startswith("```"):
            out = out.split("```")[1]
            if out.startswith(("text", "markdown")):
                out = out.split("\n", 1)[-1]
        out = out.strip().strip('"').strip()
        try:
            vals = measure(out, genre, ref=ref)
        except Exception as e:
            if verbose:
                print(f"    variant {i + 1}: unmeasurable ({type(e).__name__})")
            continue
        s = summarize(vals, genre)
        ok, why = structure_ok(text, out)
        delta = s["mean_abs_deviation"] - base_s["mean_abs_deviation"]
        candidates.append({"variant": i + 1, "text": out, "vals": vals,
                           "score": s["mean_abs_deviation"],
                           "in_range": s["in_range"], "delta": delta,
                           "structural_ok": ok, "why": why,
                           "words": len(out.split())})
        if verbose:
            print(f"    variant {i + 1}: {s['in_range']}/{s['measured']} in range  "
                  f"mean|dev| {s['mean_abs_deviation']:.3f} ({delta:+.3f})  "
                  f"{'ok' if ok else 'GUARD: ' + why}", flush=True)

    return {"baseline_score": base_s["mean_abs_deviation"],
            "baseline_in_range": base_s["in_range"],
            "candidates": candidates}


def structure_ok(before: str, after: str) -> tuple[bool, str]:
    """Same guardrail class as search.py: the detector score is the objective, but
    a candidate that wrecked the document does not deserve to be scored."""
    if len(after.strip()) < 40:
        return False, "text destroyed"
    pb, pa = len(split_paragraphs(before)), len(split_paragraphs(after))
    if pb and pa != pb:
        return False, f"paragraphs {pb}->{pa}"
    wb, wa = len(before.split()), len(after.split())
    if wb and not (0.7 * wb <= wa <= 1.5 * wb):
        return False, f"words {wb}->{wa}"
    w = after.split()
    dup = sum(1 for i in range(len(w) - 3)
              if w[i].lower() == w[i + 2].lower()
              and w[i + 1].lower() == w[i + 3].lower())
    if dup:
        return False, f"duplicated bigram x{dup}"
    return True, ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--genre", default="technical")
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--outdir", default=str(_HERE / "rewrites"))
    ap.add_argument("--json")
    args = ap.parse_args()

    text = open(args.text, encoding="utf-8", errors="replace").read()
    ref = load_ref_model()
    os.makedirs(args.outdir, exist_ok=True)
    print(f"input: {args.text} ({len(text.split())} words)")
    res = run(text, args.genre, args.n, ref)

    before = res["baseline_score"]
    legal = [c for c in res["candidates"] if c["structural_ok"]]
    improved = [c for c in legal if c["delta"] < -1e-9]
    improved.sort(key=lambda c: c["score"])
    print()
    print(f"  {len(res['candidates'])} candidate(s), {len(legal)} structurally ok, "
          f"{len(improved)} improve the rubric")
    if improved:
        best = improved[0]
        path = os.path.join(args.outdir, "best.txt")
        open(path, "w").write(best["text"])
        print(f"  best: variant {best['variant']}  {before:.3f} -> {best['score']:.3f} "
              f"({best['delta']:+.3f})")
        print(f"  wrote {path}")
        print()
        print("  NOTE: this is a RUBRIC win only. It is not a result until the "
              "detector score moves - see BUILDLOG.md, where a rubric win bought "
              "nothing against the real endpoint.")
    else:
        print("  no candidate improved the rubric legally")
    if args.json:
        with open(args.json, "w") as f:
            json.dump({k: ([{kk: vv for kk, vv in c.items() if kk != "vals"}
                            for c in v] if k == "candidates" else v)
                       for k, v in res.items()}, f, indent=1, default=float)
    return 0


if __name__ == "__main__":
    sys.exit(main())
