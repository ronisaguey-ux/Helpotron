"""Build a 50-variant humanizer test corpus for hand-scanning.

The owner's ask (2026-09-16): take a baseline AI-generated text, run it through 50
DIFFERENT humanization approaches, write all 50 into one folder numbered 1-50 so
they can be scanned one by one and the results reported back.

Design decisions that matter:

* **50 genuinely different recipes, not 50 seeds of one.** Each numbered file is a
  distinct transformation stack (different generative models, temperatures,
  prompt strategies, plus deterministic lever chains for contrast). Two files that
  differ only by random seed would tell us nothing.
* **Every variant targets the metrics the detector text model actually reads** -
  burstiness and perplexity - because a measured A/B showed a rubric-optimized
  essay scoring bit-identical to its input on the real endpoint. Surface edits do
  not move the score; sentence-level surprisal and rhythm are the levers.
* **Paragraph count and word count are guarded.** A variant that wrecks document
  structure is not a humanization, it is a different document, and scanning it
  would waste a scan.

    python build_scan_batch.py --baseline baseline700.txt --outdir scan_batch
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
from concurrent.futures import ThreadPoolExecutor, as_completed

from levers import LEVERS, apply_lever, split_paragraphs
from refmodel import load_ref_model
from rewrite import ENDPOINT, MODEL, load_key
from rubric import measure

# --------------------------------------------------------------------- recipes
# Each entry: (label, kind, spec). `kind` selects the mechanism, `spec` its
# parameters. The generative ones are the real test; the deterministic ones are
# controls that establish what transformation alone can and cannot do.

GEN_SYSTEMS = {
    "editor": """You are a prose editor. Rewrite the text so it reads as though a
specific person wrote it by hand, preserving every factual claim exactly.

Optimize for the STATISTICAL SHAPE of the sentences:
  * burstiness: deliberately mix very short sentences with long ones. Never let
    consecutive sentences have similar length.
  * perplexity: avoid the most predictable next word. If a phrase is the obvious
    way to say it, find a less obvious but equally natural way.
  * rhythm: vary clause structure; never start consecutive sentences the same way.

Never add hedges, citations, statistics or sources that were not present.
Keep the same number of paragraphs. Return ONLY the rewritten text.""",

    "author": """You are the author of this piece, rewriting your own draft from
memory. Keep every fact. Vary your sentence lengths a lot - some very short, some
long. Write the way you actually speak when you explain something. Return ONLY
the text.""",

    "de_ai": """Remove every trace of machine-generated prose. In particular,
eliminate: formulaic transitions, balanced tricolons, "not only... but also"
constructions, generic intensifiers, and any sentence whose shape is predictable
from the one before it. Keep every fact and the paragraph count. Return ONLY the
text.""",

    "journalist": """Rewrite as a working journalist would file it: concrete verbs,
varied sentence length, no filler, no throat-clearing. Keep every fact. Return
ONLY the text.""",

    "minimal": """Rewrite with maximum economy: cut every word that does not carry
meaning, break long sentences into short declaratives, and let one or two
sentences run long where the idea needs it. Keep every fact exactly. Return ONLY
the text.""",

    "essayist": """Rewrite in the register of a literary essayist - think Orwell or
Didion. Long periodic sentences punctuated by very short ones. Concrete over
abstract. Keep every fact and the paragraph count. Return ONLY the text.""",
}

# Prompt strategies applied on top of the systems.
PROMPTS = {
    "plain": "Rewrite the following text.\n\n{text}",
    "targeted": ("Rewrite the following text. Measured gaps in the current draft "
                 "(do not overshoot past these ranges):\n{gaps}\n\nText:\n{text}"),
    "aggressive": ("Rewrite the following text so that its sentence lengths are "
                   "deliberately uneven - at least three sentences under 6 words "
                   "and at least two over 35 words. Keep every fact.\n\n{text}"),
    "concise": ("Rewrite the following text 20% shorter while keeping every fact, "
                "varying sentence length sharply.\n\n{text}"),
    "expanded": ("Rewrite the following text, adding concrete detail and varying "
                 "sentence length sharply. Add no new factual claims.\n\n{text}"),
}

# Six further strategies, each a mechanism the system+prompt grid does not
# already contain. These are deliberately NOT duplicates of PROMPTS: the first
# version repeated ("editor","aggressive") inside a second loop, which produced
# 52 recipes instead of 50 and - worse - two recipes sharing a label, so one
# would silently overwrite the other in the manifest.
SPECIAL = {
    "question_driven": (
        "Rewrite the text. Where the original asserts, occasionally ask a direct "
        "question instead, answering it in the next sentence with a short one. "
        "Keep every fact. Return ONLY the text.\n\n{text}"),
    "dialogue_turn": (
        "Rewrite the text as though explaining the material to one person in "
        "conversation - informal but accurate, with abrupt short sentences mixed "
        "into long ones. Keep every fact. Return ONLY the text.\n\n{text}"),
    "analogy_first": (
        "Rewrite the text so each main point is introduced with a brief concrete "
        "analogy before the abstraction. Vary sentence length sharply. Keep every "
        "fact. Return ONLY the text.\n\n{text}"),
    "paragraph_remix": (
        "Rewrite the text, and deliberately make the paragraphs uneven in length: "
        "one very short, one long. Within sentences vary length more than the "
        "original does. Keep every fact and the paragraph count. Return ONLY the "
        "text.\n\n{text}"),
    "cadence_locked": (
        "Rewrite the text so that no two consecutive sentences begin with the same "
        "grammatical structure, and no two have similar length. Keep every fact "
        "and the paragraph count. Return ONLY the text.\n\n{text}"),
    "plain_speech": (
        "Rewrite the text in the plainest possible English a competent adult would "
        "use speaking aloud - concrete verbs, no nominalizations, short sentences "
        "interrupted by the occasional long one. Keep every fact. Return ONLY the "
        "text.\n\n{text}"),
}

# Deterministic lever chains - kept for the record, NOT shipped in the scan batch.
#
# Measured on the first run: every lever chain damaged the prose.
#   * `vary_sentence_length` splits at ", and" and produced
#     "reshaping industries, economies. The very nature of work itself."
#   * `de_nominalize` rewrote the title "The Impact of Artificial Intelligence on
#     Employment" into "How much Artificial Intelligence on Employment"
#   * `lev_full` stacked six levers and compounded the damage
# Six of fifty scans spent on grammatically broken text is six wasted scans, so
# these six slots carry real humanizations instead. The lever damage is recorded
# in BUILDLOG.md as a finding about the deterministic layer - it cannot produce a
# usable humanization on its own, which is itself the answer to whether the
# regex approach is sufficient.
LEVER_CHAINS = {
    "lev_rhythm": ["vary_sentence_length", "flatten_sentences"],
    "lev_lexical": ["lengthen_words", "de_nominalize"],
    "lev_discourse": ["add_discourse_markers", "add_semicolons"],
    "lev_person": ["add_first_person", "add_hedges"],
    "lev_temporal": ["add_temporal", "vary_sentence_length"],
    "lev_full": ["de_nominalize", "add_discourse_markers", "vary_sentence_length",
                 "add_semicolons", "lengthen_words", "add_temporal"],
}

# Six further generative strategies, used for slots 45-50. Each is a different
# mechanism, not a reseed of one - two files differing only by seed would tell us
# nothing about which approach works.
SPECIAL_2 = {
    "ruthless_edit": (
        "Rewrite the text as a ruthless editor would: delete every clause that does "
        "not add information, and let the remaining sentences vary wildly in length, "
        "some of four words. Keep every fact. Return ONLY the text.\n\n{text}"),
    "spoken_rhythm": (
        "Rewrite the text with the rhythm of natural speech - the way someone "
        "explains an idea out loud, complete with an occasional very short sentence "
        "for emphasis. Keep every fact and the facts' order. Return ONLY the "
        "text.\n\n{text}"),
    "detail_concrete": (
        "Rewrite the text replacing abstract formulations with concrete ones "
        "(specific actors, specific mechanisms), and vary sentence length sharply. "
        "Introduce no new factual claims. Return ONLY the text.\n\n{text}"),
    "unbalanced": (
        "Rewrite the text deliberately avoiding symmetry: no balanced pairs, no "
        "tricolons, no 'not only X but also Y'. Vary sentence length so that some "
        "sentences are under six words. Keep every fact. Return ONLY the text.\n\n{text}"),
    "front_loaded": (
        "Rewrite the text so each paragraph opens with a very short, blunt sentence "
        "and then develops the idea in longer ones. Keep every fact and the "
        "paragraph count. Return ONLY the text.\n\n{text}"),
    "plain_expert": (
        "Rewrite the text as a domain expert would explain it to a smart colleague - "
        "precise, unshowy, direct, with uneven sentence lengths and no academic "
        "padding. Keep every fact. Return ONLY the text.\n\n{text}"),
}


def build_recipes() -> list[dict]:
    """Exactly 50 distinct recipes, each with a unique label.

    30 (systems x prompts) + 8 (temperature sweep) + 6 (special strategies)
    + 6 (second special set) = 50.

    Every label is asserted unique, because the manifest is keyed by label - a
    collision silently drops a variant and the folder ends up with 49 files and
    no error. That happened: an earlier version repeated ("editor","aggressive")
    in two loops and built 52 recipes with a shared label.
    """
    recipes: list[dict] = []

    # 1-30: six systems x five prompt strategies
    for sys_name in GEN_SYSTEMS:
        for p_name in PROMPTS:
            recipes.append({"kind": "gen", "system": sys_name,
                            "prompt": p_name, "temp": 1.0,
                            "label": f"{sys_name}+{p_name}"})
    # 31-38: temperature sweep on two systems.
    #
    # The extremes were originally 1.6 and 1.9, and BOTH degenerated: 4,444 words
    # in 44 paragraphs and 4,457 in 31, against a 771-word input. That is the
    # model going off the rails, not a humanization, and it wastes a scan.
    # Replaced with 0.45 and 0.75, which stay in distribution while still
    # spreading the sampling well.
    for i, t in enumerate((0.3, 0.45, 0.6, 0.75, 0.85, 1.0, 1.2, 1.4)):
        sys_name = "editor" if i % 2 == 0 else "author"
        recipes.append({"kind": "gen", "system": sys_name, "prompt": "targeted",
                        "temp": t, "label": f"{sys_name}+temp{t}"})
    # 39-44: six strategy prompts
    for name in SPECIAL:
        recipes.append({"kind": "gen", "system": "editor", "special": name,
                        "temp": 1.0, "label": f"special+{name}"})
    # 45-50: six more strategy prompts, different mechanisms again
    for name in SPECIAL_2:
        recipes.append({"kind": "gen", "system": "editor", "special2": name,
                        "temp": 1.0, "label": f"strategy+{name}"})

    assert len(recipes) == 50, f"expected 50 recipes, built {len(recipes)}"
    labels = [r["label"] for r in recipes]
    dupes = {l for l in labels if labels.count(l) > 1}
    assert not dupes, f"duplicate labels would silently overwrite: {dupes}"
    return recipes


# ------------------------------------------------------------------ generation
def gap_text(vals: dict, genre: str, n: int = 6) -> str:
    import ranges as R
    from rubric import _steerable_set
    steerable = _steerable_set()
    rows = []
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
            rows.append((abs(d), name, d, r))
    rows.sort(reverse=True)
    return "\n".join(
        f"  * {name}: {'too low' if d < 0 else 'too high'}, target {r[0]}-{r[1]}"
        for _, name, d, r in rows[:n])


def call(key: str, system: str, prompt: str, temp: float,
         max_tokens: int = 20000) -> str:
    payload = {"model": MODEL,
               "messages": [{"role": "system", "content": system},
                            {"role": "user", "content": prompt}],
               "max_tokens": max_tokens, "temperature": temp}
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read()[:160]!r}") from None
    ch = (d.get("choices") or [{}])[0]
    msg = ch.get("message") or {}
    content = (msg.get("content") or "").strip()
    if not content:
        raise RuntimeError(f"empty content (finish={ch.get('finish_reason')})")
    leak = ("We need answer", "Need preserve", "Let me count", "We must avoid")
    if sum(1 for m in leak if m in content[:600]) >= 2:
        raise RuntimeError("reasoning leaked into content")
    # Strip a wrapping code fence if the model added one.
    if content.startswith("```"):
        body = content.split("```")
        content = (body[1] if len(body) > 1 else content).strip()
        if content.split("\n", 1)[0].strip().lower() in ("text", "markdown"):
            content = content.split("\n", 1)[-1].strip()
    return content.strip().strip('"').strip()


def guard(before: str, after: str) -> tuple[bool, str]:
    """Reject a variant that is not a rewrite of the same document.

    Paragraph tolerance is +/-1 rather than exactly-equal. Measured: four of the
    first fifty candidates failed on paragraph count alone (8->9, 8->10, 8->7),
    which is an LLM reflowing a break, not a different document. An exact
    equality test throws away good variants for a cosmetic difference; the
    degenerate cases it was there to catch blow out to 31 and 44 paragraphs and
    are still rejected.
    """
    if len(after.strip()) < 80:
        return False, "too short"
    pb, pa = len(split_paragraphs(before)), len(split_paragraphs(after))
    if pb and abs(pa - pb) > 1:
        return False, f"paragraphs {pb}->{pa}"
    wb, wa = len(before.split()), len(after.split())
    if wb and not (0.55 * wb <= wa <= 1.7 * wb):
        return False, f"words {wb}->{wa}"
    w = after.split()
    dup = sum(1 for i in range(len(w) - 3)
              if w[i].lower() == w[i + 2].lower()
              and w[i + 1].lower() == w[i + 3].lower())
    if dup:
        return False, f"duplicated bigram x{dup}"
    return True, ""


def make_one(rec: dict, baseline: str, base_vals: dict, genre: str,
             key: str, ref) -> dict:
    """Produce one variant's text. Never raises: a single failure must not lose
    the other 49."""
    try:
        if rec["kind"] == "gen":
            system = GEN_SYSTEMS[rec["system"]]
            if rec.get("special"):
                tmpl = SPECIAL[rec["special"]]
            elif rec.get("special2"):
                tmpl = SPECIAL_2[rec["special2"]]
            else:
                tmpl = PROMPTS[rec["prompt"]]
            prompt = tmpl.format(text=baseline, gaps=gap_text(base_vals, genre))
            text = call(key, system, prompt, rec["temp"])
        else:
            text = baseline
            for lv in rec["chain"]:
                text, _, _ = apply_lever(lv, text, strength=0.5)
        ok, why = guard(baseline, text)
        vals = measure(text, genre, ref=ref) if ok else None
        from rubric import summarize
        s = summarize(vals, genre) if vals else None
        return {"label": rec["label"], "text": text, "ok": ok, "why": why,
                "words": len(text.split()),
                "burst": (vals or {}).get("syntactic_burstiness_factor"),
                "ppl": (vals or {}).get("model_perplexity_baseline"),
                "in_range": (s or {}).get("in_range"),
                "measured": (s or {}).get("measured"),
                "mean_dev": (s or {}).get("mean_abs_deviation")}
    except Exception as e:
        return {"label": rec["label"], "text": None, "ok": False,
                "why": f"{type(e).__name__}: {str(e)[:140]}"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--outdir", default="scan_batch")
    ap.add_argument("--genre", default="technical")
    ap.add_argument("--concurrency", type=int, default=5)
    ap.add_argument("--only", help="comma-separated 1-based indices to (re)build")
    args = ap.parse_args()

    baseline = open(args.baseline, encoding="utf-8", errors="replace").read().strip()
    os.makedirs(args.outdir, exist_ok=True)
    ref = load_ref_model()
    key = load_key()
    base_vals = measure(baseline, args.genre, ref=ref)

    recipes = build_recipes()
    if args.only:
        want = {int(x) for x in args.only.split(",")}
        recipes = [r for i, r in enumerate(recipes, 1) if i in want]
        print(f"  rebuilding {len(recipes)} variant(s)")

    print(f"  baseline: {len(baseline.split())} words, "
          f"{len(split_paragraphs(baseline))} paragraphs")
    print(f"  building {len(recipes)} variants -> {args.outdir}/")

    results = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        futs = {ex.submit(make_one, r, baseline, base_vals, args.genre, key, ref): r
                for r in recipes}
        done = 0
        for f in as_completed(futs):
            rec = futs[f]
            res = f.result()
            results.append(res)
            done += 1
            status = "ok" if res["ok"] else f"FAIL({res['why'][:40]})"
            print(f"    [{done}/{len(recipes)}] {res['label'][:34]:34} "
                  f"{res['words']:>4}w  {status}", flush=True)

    # Number them 1..50 in the RECIPE order, not completion order, so the folder
    # numbering is stable across reruns and matches this script.
    by_label = {r["label"]: r for r in results}
    manifest = []
    for i, rec in enumerate(build_recipes(), 1):
        res = by_label.get(rec["label"])
        if res is None:
            continue
        if res.get("text"):
            path = os.path.join(args.outdir, f"{i:02d}.txt")
            with open(path, "w") as f:
                f.write(res["text"])
            res["path"] = path
        else:
            path = None
        manifest.append({"n": i, "label": rec["label"], "kind": rec["kind"],
                         "recipe": {k: v for k, v in rec.items() if k != "label"},
                         "path": path, "ok": res["ok"], "why": res.get("why"),
                         "words": res.get("words"), "burst": res.get("burst"),
                         "ppl": res.get("ppl"), "in_range": res.get("in_range"),
                         "mean_dev": res.get("mean_dev")})

    with open(os.path.join(args.outdir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, default=float)

    good = [m for m in manifest if m["ok"]]
    print()
    print(f"  {len(good)}/{len(manifest)} variants written")
    failed = [m for m in manifest if not m["ok"]]
    if failed:
        print("  failed:")
        for m in failed:
            print(f"    {m['n']:02d} {m['label'][:34]:34} {m['why']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
