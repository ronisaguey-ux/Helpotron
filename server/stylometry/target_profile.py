"""Extract the STRUCTURAL profile of the detector-confirmed-human essays.

WHY THIS REPLACES THE ENSEMBLE. The free ensemble was measured against 32 essays
that the detector scores 0/100 and it called 8 of them AI-leaning, with a mean of 0.497
against 0.465 for my own AI essay - i.e. it thinks AI text is more human than real
human writing. Cause: domain mismatch. tmr/adal/chatgpt were trained on RAID,
news and Quora/SQuAD/CNN; none on student essay prose, and tmr flags 30 of 32
human essays at ~0.98.

What IS trustworthy is the detector own label on these 32 essays. So the target is no
longer "score well on the ensemble" but "match the measured structure of essays
the detector accepts", which is exactly the parameter engine the owner proposed.

This file derives the parameters and their target values from the labelled corpus.
"""
from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent
import glob, json, os, statistics as st, sys, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from refmodel import load_ref_model
from rubric import measure
import ranges as R

ref = load_ref_model()

def load_human():
    out = []
    for f in sorted(glob.glob(os.path.join(HERE, "human_essays", "*.txt"))):
        t = open(f, encoding="utf-8", errors="replace").read()
        if len(t.split()) > 60:
            out.append((os.path.basename(f), t))
    return out

def main():
    humans = load_human()
    ai_base = open(str(_HERE / "baseline700.txt")).read()
    # Also the AI corpus, for a second reference point
    ai_docs = []
    cp = os.path.join(HERE, "calibration", "corpus.json")
    if os.path.exists(cp):
        ai_docs = [t for _, t in json.load(open(cp))["ai"]]

    print(f"  {len(humans)} the detector-confirmed HUMAN essays")
    print(f"  {len(ai_docs)} generated AI essays + 1 AI baseline for contrast")
    print()

    H = [measure(t, "technical", ref=ref) for _, t in humans]
    A = [measure(t, "technical", ref=ref) for t in ai_docs] if ai_docs else []
    B = measure(ai_base, "technical", ref=ref)

    rows = []
    for p in R.PARAMS:
        n = p["name"]
        h = [x[n] for x in H if x.get(n) is not None]
        a = [x[n] for x in A if x.get(n) is not None]
        if len(h) < 8 or len(a) < 3:
            continue
        mh, ma = st.mean(h), st.mean(a)
        sh, sa = st.pstdev(h) or 1e-9, st.pstdev(a) or 1e-9
        pooled = ((sh**2 + sa**2) / 2) ** 0.5 or 1e-9
        d = (mh - ma) / pooled
        b = B.get(n)
        # Where does the AI baseline sit relative to the two groups?
        denom = (mh - ma)
        pos = ((b - ma) / denom) if abs(denom) > 1e-12 else None
        rows.append({"name": n, "human_mean": mh, "human_sd": sh,
                     "ai_mean": ma, "ai_sd": sa, "cohens_d": d, "abs_d": abs(d),
                     "baseline": b, "baseline_position": pos,
                     "human_min": min(h), "human_max": max(h)})
    rows.sort(key=lambda r: -r["abs_d"])
    json.dump(rows, open(os.path.join(HERE, "target_profile.json"), "w"),
              indent=1, default=float)

    print(f"  {'feature':42} {'human':>10} {'AI':>10} {'d':>7} {'AI base':>10} {'base pos':>9}")
    print("  " + "-" * 92)
    for r in rows[:28]:
        tag = "STRONG" if r["abs_d"] >= 0.8 else ("med" if r["abs_d"] >= 0.5 else "")
        pos = f"{r['baseline_position']:9.2f}" if r["baseline_position"] is not None else "        -"
        print(f"  {r['name']:42} {r['human_mean']:10.4g} {r['ai_mean']:10.4g} "
              f"{r['cohens_d']:+7.2f} {r['baseline']:10.4g} {pos} {tag}")
    strong = [r for r in rows if r["abs_d"] >= 0.8]
    print()
    print(f"  strong separators (|d| >= 0.8): {len(strong)}")
    print()
    print("  THE TARGETS - where 'base pos' > 1.0 means my AI text overshoots the")
    print("  human mean in the human direction, and < 0 means it sits past the AI mean:")
    for r in strong[:14]:
        bp = r["baseline_position"]
        if bp is None: continue
        where = ("ON human side" if 0 <= bp <= 1.2 else
                 ("OVERSHOOTS human" if bp > 1.2 else "on AI side"))
        print(f"    {r['name']:42} d={r['cohens_d']:+.2f}  base pos {bp:+.2f}  {where}")

if __name__ == "__main__":
    main()
