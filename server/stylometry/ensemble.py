"""Mega-score: an ensemble of AI-text detectors, local and scraped.

WHY AN ENSEMBLE. Every detector has its own blind spots, and the literature is
blunt that no single one is reliable - disagreement between detectors on the same
text routinely runs 20%+. More importantly for us: the detector free tier is **25
scans per month**, so it cannot be the inner loop of a fine-tuning run. The
ensemble is free, unlimited, and local, so the humanizer can be iterated against
it thousands of times; the detector is then the *held-out* judge we spend quota on.

THE MODELS, and why each earns its slot (all CPU-runnable, no GPU on this box):

  tmr        Oxidane/tmr-ai-text-detector      MIT, RoBERTa-base, AUROC 99.28 on
                                               RAID, low false-positive rate.
  adal       Shushant/ADAL_AI_Detector         Apache-2.0, RoBERTa-large, trained
                                               ADVERSARIALLY against a T5
                                               paraphraser. This is the one that
                                               matters most for us: our whole
                                               method is paraphrasing, so a
                                               paraphrase-robust detector is the
                                               hardest honest test.
  coai       coai/roberta-ai-detector-v2       Apache-2.0, trained on 56k paired
                                               academic samples (Claude/GPT/Gemini).
                                               Our baseline text is an academic
                                               essay, so this is in-distribution.
  chatgpt    Hello-SimpleAI/chatgpt-detector-roberta  the widely-embedded classic;
                                               included as a broad, independent
                                               opinion.
  openai     openai-community/roberta-base-openai-detector  the original GPT-2-era
                                               detector - OUTDATED against modern
                                               LLMs, included deliberately as a
                                               low-weight historical signal whose
                                               disagreement is informative.

LABEL ORDER IS NOT UNIFORM and that is a real trap: most models put AI at index 1,
but ADAL puts AI at index 0. Each entry declares its own `ai_index`, and a startup
self-test checks that a known-AI text scores high, so a flipped model cannot
silently invert the ensemble.

    python ensemble.py --selftest
    python ensemble.py --text somefile.txt
    python ensemble.py --dir scan_batch
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

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
os.makedirs(CACHE, exist_ok=True)

# name -> (hf repo, ai_index, weight, note)
MODELS = {
    "tmr": ("Oxidane/tmr-ai-text-detector", 1, 1.00,
            "RAID-trained RoBERTa-base, low FPR"),
    "adal": ("Shushant/ADAL_AI_Detector", 0, 1.30,
             "adversarially trained vs a paraphraser - the hard test"),
    "coai": ("coai/roberta-ai-detector-v2", 1, 1.00,
             "academic-paired RoBERTa-base"),
    "chatgpt": ("Hello-SimpleAI/chatgpt-detector-roberta", 1, 0.70,
                "widely-embedded classic"),
    "openai": ("openai-community/roberta-base-openai-detector", 1, 0.40,
               "GPT-2-era, outdated, low weight"),
}

# Explicit pinned revisions (commit SHAs) retrieved from Hugging Face API to prevent supply-chain drift (HT-007)
MODEL_REVISIONS = {
    "Oxidane/tmr-ai-text-detector": "0ceddea903015ef99cbaa040a4d8a216aed9c683",
    "Shushant/ADAL_AI_Detector": "b598375d7fb2e8926e5514b15a68b2819bc31a0a",
    "coai/roberta-ai-detector-v2": "d38284c73a8bbad3526f17c2af082ffffb6fb675",
    "Hello-SimpleAI/chatgpt-detector-roberta": "d2b342c61775d5dd0221808a79983ed3b86ffd86",
    "openai-community/roberta-base-openai-detector": "6cba99c003b711c7fe94f8a3aa2be35a792cb6fa",
}

_loaded: dict = {}


def _load(name: str):
    if name in _loaded:
        return _loaded[name]
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    repo, ai_index, weight, note = MODELS[name]
    rev = MODEL_REVISIONS.get(repo)
    tok = AutoTokenizer.from_pretrained(repo, cache_dir=CACHE, revision=rev)
    mdl = AutoModelForSequenceClassification.from_pretrained(repo, cache_dir=CACHE, revision=rev)
    mdl.eval()
    # Keep the thread count modest: this box is shared and the watchdog SIGSTOPs
    # processes that spike CPU.
    try:
        torch.set_num_threads(min(4, os.cpu_count() or 4))
    except Exception:
        pass
    _loaded[name] = (tok, mdl, ai_index, weight, note)
    return _loaded[name]


def score_one(name: str, text: str) -> dict:
    """AI probability from one detector.

    Chunked at 512 tokens because every model here truncates there; taking only
    the first window would score a 700-word essay on its opening paragraph and
    report the result as the whole document's verdict.
    """
    import torch
    tok, mdl, ai_index, weight, note = _load(name)
    enc = tok(text, return_tensors="pt", truncation=False)
    ids = enc["input_ids"][0]
    windows = []
    size = 510
    for start in range(0, max(1, len(ids)), size):
        chunk = ids[start:start + size]
        if len(chunk) < 8:
            continue
        windows.append(chunk)
    if not windows:
        windows = [ids[:size]]
    probs = []
    with torch.no_grad():
        for w in windows:
            batch = w.unsqueeze(0)
            mask = torch.ones_like(batch)
            logits = mdl(input_ids=batch, attention_mask=mask).logits
            p = torch.softmax(logits, dim=-1)[0]
            probs.append(float(p[ai_index]))
    mean_ai = sum(probs) / len(probs)
    return {"name": name, "ai_prob": mean_ai, "windows": len(windows),
            "max_window_ai": max(probs), "weight": weight, "note": note}


def mega_score(text: str, models=None, verbose=False) -> dict:
    """Weighted ensemble AI-probability across every available detector.

    Returns `mega` (0..1, 1 = certainly AI), the per-detector votes, and the
    spread. The spread is reported because a wide disagreement is itself the
    signal that a text is sitting in the ambiguous zone - which, for rewriting, is
    exactly where we want to be, and a single averaged number would hide it.
    """
    names = models or list(MODELS)
    votes = []
    for n in names:
        try:
            votes.append(score_one(n, text))
        except Exception as e:
            votes.append({"name": n, "error": f"{type(e).__name__}: {str(e)[:120]}",
                          "weight": MODELS[n][2], "ai_prob": None})
    good = [v for v in votes if v.get("ai_prob") is not None]
    if not good:
        return {"mega": None, "votes": votes, "error": "every detector failed"}
    wsum = sum(v["weight"] for v in good)
    mega = sum(v["ai_prob"] * v["weight"] for v in good) / wsum
    probs = [v["ai_prob"] for v in good]
    return {"mega": mega,
            "min": min(probs), "max": max(probs),
            "spread": max(probs) - min(probs),
            "n_detectors": len(good),
            "votes": votes}


def selftest() -> int:
    """Prove the ensemble is pointing the right way before trusting it.

    Two known texts: one certainly AI (the baseline essay) and one certainly human
    (pre-1900 published prose). If a model's `ai_index` were wrong, it would score
    the human text as AI, and that is the failure this catches.
    """
    ai = open(str(_HERE / "baseline700.txt")).read()[:4000]
    human_path = str(_HERE / "human_essays" / "wiki_control.txt")
    human = open(human_path).read()[:4000]
    print(f"  {'model':10} {'AI text':>9} {'human text':>11}  ok")
    ok_all = True
    for name in MODELS:
        try:
            a = score_one(name, ai)["ai_prob"]
            h = score_one(name, human)["ai_prob"]
            ok = a > h
            ok_all &= ok
            print(f"  {name:10} {a:9.3f} {h:11.3f}  {'yes' if ok else 'NO - INVERTED'}")
        except Exception as e:
            ok_all = False
            print(f"  {name:10} FAILED {type(e).__name__}: {str(e)[:90]}")
    ra = mega_score(ai)["mega"]
    rh = mega_score(human)["mega"]
    print()
    print(f"  ensemble: AI text {ra:.3f}   human text {rh:.3f}"
          f"   separation {ra - rh:+.3f}")
    print(f"  verdict: {'usable' if ok_all and ra > rh else 'CHECK THE MODELS'}")
    return 0 if ok_all else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text")
    ap.add_argument("--dir")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json")
    ap.add_argument("--models", nargs="+")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    items = []
    if args.text:
        items.append((os.path.basename(args.text), open(args.text).read()))
    if args.dir:
        import glob
        for f in sorted(glob.glob(os.path.join(args.dir, "*.txt"))):
            items.append((os.path.basename(f), open(f, encoding="utf-8",
                                                     errors="replace").read()))
    if not items:
        ap.error("pass --text, --dir or --selftest")

    out = []
    print(f"  {'file':26} {'MEGA':>6} {'min':>6} {'max':>6} {'spread':>7}  votes")
    for label, text in items:
        r = mega_score(text, models=args.models)
        r["label"] = label
        out.append(r)
        if r.get("mega") is None:
            print(f"  {label[:26]:26}   FAILED")
            continue
        vs = " ".join(f"{v['name'][:4]}={v['ai_prob']:.2f}"
                      for v in r["votes"] if v.get("ai_prob") is not None)
        print(f"  {label[:26]:26} {r['mega']:6.3f} {r['min']:6.3f} "
              f"{r['max']:6.3f} {r['spread']:7.3f}  {vs}")
    if args.json:
        json.dump(out, open(args.json, "w"), indent=1, default=float)
        print(f"  wrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
