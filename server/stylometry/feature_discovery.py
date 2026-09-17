"""Which text features actually separate human from AI in the detectors' eyes?

WHY. Every paraphrase-based humanization failed to move the ensemble: `adal` sat
within 0.023 across 63 attempts. Paraphrasing swaps words but preserves the
statistical shape of the text, so if a detector reads shape, paraphrasing is
futile. The productive question is therefore not "rewrite harder" but "which
measurable features separate a human text from an AI one", because those are the
features a rewrite has to move.

Method: take the labelled calibration corpus (10 human, 10 AI), measure all 56
rubric parameters on every document plus the ensemble score, then rank each
parameter by how well it separates the two groups. Separation is reported as a
standardised mean difference (Cohen's d) so features on wildly different scales
are comparable, and a feature only counts if the two groups are actually
separable on it.
"""
import json, os, sys, warnings, statistics as st
warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refmodel import load_ref_model
from rubric import measure
import ranges as R

corpus = json.load(open("calibration/corpus.json"))
ref = load_ref_model()

feats = {"human": [], "ai": []}
for grp in ("human", "ai"):
    for label, text in corpus[grp]:
        try:
            v = measure(text, "technical", ref=ref)
            v["_label"] = label
            feats[grp].append(v)
        except Exception as e:
            print(f"  skip {label}: {type(e).__name__}")

print(f"  measured {len(feats['human'])} human + {len(feats['ai'])} AI documents")

rows = []
for p in R.PARAMS:
    n = p["name"]
    h = [f[n] for f in feats["human"] if f.get(n) is not None]
    a = [f[n] for f in feats["ai"] if f.get(n) is not None]
    if len(h) < 4 or len(a) < 4:
        continue
    mh, ma = st.mean(h), st.mean(a)
    sh, sa = st.pstdev(h) or 1e-9, st.pstdev(a) or 1e-9
    pooled = ((sh ** 2 + sa ** 2) / 2) ** 0.5 or 1e-9
    d = (mh - ma) / pooled
    # Overlap: how many AI docs fall inside the human range and vice versa.
    lo, hi = min(h), max(h)
    inside = sum(1 for x in a if lo <= x <= hi)
    rows.append({"name": n, "human_mean": mh, "ai_mean": ma, "cohens_d": d,
                 "abs_d": abs(d), "human_range": [lo, hi],
                 "ai_inside_human_range": inside, "n_ai": len(a)})

rows.sort(key=lambda r: -r["abs_d"])
json.dump(rows, open("feature_discovery.json", "w"), indent=1, default=float)

print()
print(f"  {'feature':44} {'human':>9} {'AI':>9} {'d':>7} {'overlap':>8}")
print("  " + "-" * 82)
for r in rows[:26]:
    tag = "STRONG" if r["abs_d"] >= 0.8 else ("moderate" if r["abs_d"] >= 0.5 else "")
    print(f"  {r['name']:44} {r['human_mean']:9.4g} {r['ai_mean']:9.4g} "
          f"{r['cohens_d']:+7.2f} {r['ai_inside_human_range']:>3}/{r['n_ai']:<4} {tag}")

strong = [r for r in rows if r["abs_d"] >= 0.8]
moderate = [r for r in rows if 0.5 <= r["abs_d"] < 0.8]
print()
print(f"  strong separators (|d|>=0.8): {len(strong)}  |  moderate: {len(moderate)}")
print()
print("  THE LEVERS - these are what a rewrite must move:")
for r in strong:
    direction = "higher in human" if r["cohens_d"] > 0 else "higher in AI"
    print(f"    {r['name']:44} {direction}")
