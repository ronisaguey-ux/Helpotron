"""Build a labeled calibration corpus, then measure each detector's real power.

WHY THIS EXISTS. The first ensemble self-test looked broken: tmr scored genuine
human text at 0.756 and adal at 0.650 - near their AI end - while the two
GPT-2-era models scored every text identically (chatgpt always ~0.01 "human",
openai always 1.000 "AI"). Raw probabilities are not decisions, and my human
control was Wikipedia, which is maximally *edited* prose and may genuinely sit
near the AI distribution. Neither problem can be fixed by reading the numbers
harder.

So: build a labeled set of N human and N AI documents, then per detector measure
AUROC and pick a threshold. AUROC is threshold-free, so it answers the only
question that matters first - **can this detector tell my texts apart at all?**
A detector whose AUROC is near 0.5 on this domain is unusable no matter how
confident its output looks, and one inverted model in the ensemble would silently
poison the mega-score.

Human sources are pre-1900 published prose and modern reference prose, which are
definitely not machine-generated. AI sources are generated here, across several
prompts and registers, so the corpus is not one model's one style.

    python calibrate.py --build          # write the corpus
    python calibrate.py --measure        # per-detector AUROC + thresholds
"""

from __future__ import annotations

import argparse
import json
import os
import random
import statistics as st
import sys
import warnings

warnings.filterwarnings("ignore")
os.environ.setdefault("NLTK_DATA", os.path.expanduser("~/.local/share/nltk_data"))

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "calibration")
OUT = os.path.join(HERE, "calibration_results.json")


# ------------------------------------------------------------------ human side
def build_human(n: int = 12, words: int = 420) -> list[tuple[str, str]]:
    """Pre-1900 published prose plus modern reference prose.

    Deliberately varied: novels, essays, reference writing. A single source would
    calibrate the detectors to one author's idiolect rather than to "human".
    """
    from nltk.corpus import gutenberg
    out = []

    guten = [
        ("melville", "melville-moby_dick.txt"),
        ("austen", "austen-emma.txt"),
        ("chesterton", "chesterton-ball.txt"),
        ("shakespeare", "shakespeare-caesar.txt"),
        ("carroll", "carroll-alice.txt"),
        ("kipling", "kipling-jungle.txt"),
    ]
    for label, fid in guten:
        try:
            ws = [w for w in gutenberg.words(fid)
                  if not (w.startswith("[") or w.endswith("]"))]
            if len(ws) < words + 200:
                continue
            start = random.Random(hash(label) & 0xFFFF).randint(0, len(ws) - words - 1)
            out.append((f"human_guten_{label}",
                        " ".join(ws[start:start + words])))
        except Exception as e:
            print(f"  skip {label}: {e}")

    # Wikipedia: modern, collaboratively written reference prose. Kept because it
    # is a legitimate human source even though it is heavily edited - the
    # calibration needs to know how the detectors treat it.
    try:
        import urllib.parse
        import urllib.request
        arts = ["Printing press", "Industrial Revolution", "Unemployment",
                "Typewriter", "Steam engine", "Telegraphy"]
        for a in arts:
            if len(out) >= n:
                break
            url = ("https://en.wikipedia.org/w/api.php?action=query&prop=extracts"
                   "&explaintext=1&format=json&titles=" + urllib.parse.quote(a))
            req = urllib.request.Request(url, headers={"User-Agent": "research/1.0"})
            d = json.loads(urllib.request.urlopen(req, timeout=30).read())
            t = list(d["query"]["pages"].values())[0].get("extract", "")
            paras = [p for p in t.split("\n\n") if len(p.split()) > 20]
            txt = " ".join(paras)[: words * 7]
            if len(txt.split()) >= words // 2:
                out.append((f"human_wiki_{a[:12].replace(' ', '_')}", txt))
    except Exception as e:
        print(f"  wikipedia: {e}")

    return out[:n]


# --------------------------------------------------------------------- AI side
AI_PROMPTS = [
    ("academic", "Write a 400-word academic essay about the causes of inflation."),
    ("academic2", "Write a 400-word academic essay on the ethics of gene editing."),
    ("news", "Write a 400-word news analysis about urban housing shortages."),
    ("blog", "Write a 400-word blog post explaining how solar panels work."),
    ("persuasive", "Write a 400-word persuasive essay arguing for later school start times."),
    ("report", "Write a 400-word technical report on battery recycling challenges."),
    ("narrative", "Write a 400-word personal narrative about moving to a new city."),
    ("review", "Write a 400-word review of a fictional documentary about deep sea life."),
    ("explainer", "Write a 400-word explainer on how vaccines train the immune system."),
    ("compare", "Write a 400-word comparison of remote work and office work."),
    ("history", "Write a 400-word essay about the consequences of the printing press."),
    ("science", "Write a 400-word essay about antibiotic resistance."),
]


def build_ai(n: int = 12, words: int = 420) -> list[tuple[str, str]]:
    # The generator is only used to CREATE the corpus; scoring never calls it.
    sys.path.insert(0, HERE)
    from rewrite import call_llm, load_key
    key = load_key()
    out = []
    for label, prompt in AI_PROMPTS[:n]:
        try:
            t = call_llm(key, prompt, system="You are a helpful writing assistant.",
                         max_tokens=12000, temperature=1.0)
            out.append((f"ai_{label}", t))
            print(f"    ai_{label}: {len(t.split())}w", flush=True)
        except Exception as e:
            print(f"    ai_{label}: FAILED {type(e).__name__}: {str(e)[:80]}")
    return out


# ------------------------------------------------------------------- measuring
def auroc(scores_human: list[float], scores_ai: list[float]) -> float:
    """Probability a random AI text scores above a random human text. 0.5 = coin
    flip = useless. Below 0.5 = inverted, which is the dangerous case: it would
    need `ai_index` flipped, not just a threshold moved."""
    wins = ties = 0
    for a in scores_ai:
        for h in scores_human:
            if a > h:
                wins += 1
            elif a == h:
                ties += 1
    total = len(scores_human) * len(scores_ai)
    return (wins + 0.5 * ties) / total if total else 0.5


def best_threshold(sh: list[float], sa: list[float]) -> tuple[float, float]:
    """Threshold maximising balanced accuracy (mean of TPR and TNR). Plain
    accuracy is wrong here: a model that always answers 'AI' would score well on
    an AI-heavy set and be useless."""
    cands = sorted(set(sh + sa))
    best = (0.5, -1.0)
    for t in cands:
        tpr = sum(1 for s in sa if s >= t) / max(1, len(sa))
        tnr = sum(1 for s in sh if s < t) / max(1, len(sh))
        bal = (tpr + tnr) / 2
        if bal > best[1]:
            best = (t, bal)
    return best


def measure(corpus: dict) -> dict:
    from ensemble import MODELS, score_one

    humans = [(l, t) for l, t in corpus["human"]]
    ais = [(l, t) for l, t in corpus["ai"]]
    results = {}
    print(f"  scoring {len(humans)} human + {len(ais)} AI documents "
          f"across {len(MODELS)} detectors")
    print()
    print(f"  {'detector':10} {'AUROC':>6} {'thresh':>7} {'bal-acc':>8} "
          f"{'human mean':>11} {'AI mean':>8}  verdict")
    for name in MODELS:
        sh, sa, err = [], [], None
        for _, t in humans:
            try:
                sh.append(score_one(name, t)["ai_prob"])
            except Exception as e:
                err = f"{type(e).__name__}: {str(e)[:70]}"
                break
        if err is None:
            for _, t in ais:
                try:
                    sa.append(score_one(name, t)["ai_prob"])
                except Exception as e:
                    err = f"{type(e).__name__}: {str(e)[:70]}"
                    break
        if err or not sh or not sa:
            results[name] = {"error": err or "no scores"}
            print(f"  {name:10} {'--':>6} {'--':>7} {'--':>8} {'--':>11} {'--':>8}  "
                  f"UNAVAILABLE ({str(err)[:40]})")
            continue
        a = auroc(sh, sa)
        thr, bal = best_threshold(sh, sa)
        # A model whose two means are both pinned at 0 or both at 1 has no
        # dynamic range left, whatever its AUROC says.
        hm, am = st.mean(sh), st.mean(sa)
        saturated = (max(hm, am) - min(hm, am)) < 0.05
        if a < 0.5:
            verdict = "INVERTED - unusable"
        elif saturated:
            verdict = "NO RANGE - unusable"
        elif a >= 0.95:
            verdict = "excellent"
        elif a >= 0.85:
            verdict = "good"
        elif a >= 0.70:
            verdict = "weak"
        else:
            verdict = "USELESS on this domain"
        results[name] = {"auroc": a, "threshold": thr, "balanced_acc": bal,
                         "human_mean": hm, "ai_mean": am,
                         "n_human": len(sh), "n_ai": len(sa),
                         "usable": bool(a >= 0.70 and not saturated),
                         "verdict": verdict,
                         "human_scores": sh, "ai_scores": sa}
        print(f"  {name:10} {a:6.3f} {thr:7.3f} {bal:8.3f} {hm:11.3f} "
              f"{am:8.3f}  {verdict}")

    usable = [n for n, r in results.items() if r.get("usable")]
    print()
    print(f"  usable detectors: {len(usable)} of {len(MODELS)}"
          + (f" -> {', '.join(usable)}" if usable else ""))
    if len(usable) < 2:
        print("  WARNING: fewer than two usable detectors. A mega-score built from "
              "one saturated model is a single model's opinion wearing a mean.")
    return {"detectors": results, "usable": usable}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--json", default=OUT)
    args = ap.parse_args()

    os.makedirs(CORPUS, exist_ok=True)
    cpath = os.path.join(CORPUS, "corpus.json")

    if args.build or not os.path.exists(cpath):
        print("  building human half...")
        human = build_human(args.n)
        print(f"  {len(human)} human documents")
        print("  building AI half (generating)...")
        ai = build_ai(args.n)
        print(f"  {len(ai)} AI documents")
        json.dump({"human": human, "ai": ai}, open(cpath, "w"), indent=1)
        print(f"  wrote {cpath}")

    corpus = json.load(open(cpath))
    print(f"  corpus: {len(corpus['human'])} human, {len(corpus['ai'])} AI")
    res = measure(corpus)
    json.dump(res, open(args.json, "w"), indent=1, default=float)
    print(f"  wrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
