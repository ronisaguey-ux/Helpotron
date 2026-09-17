"""Score every humanization method with the calibrated mega-score.

The point of the free ensemble: this runs unlimited times, so method selection can
be answered by measurement rather than by reading papers. Each method's output is
scored on the same 3-detector instrument, and the ranking is what directs the
fine-tuning that follows.
"""

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent
import glob, json, os, sys, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mega import mega, verdict

def collect():
    items = []
    base = str(_HERE / "baseline700.txt")
    if os.path.exists(base):
        items.append(("BASELINE (raw AI)", open(base).read()))
    for f in sorted(glob.glob(str(_HERE / "iterative" / "iter_*.txt"))):
        items.append((f"iterative r{os.path.basename(f)[5:7]}", open(f).read()))
    for f in sorted(glob.glob(str(_HERE / "backtrans" / "back_*.txt"))):
        items.append((f"backtrans {os.path.basename(f)[5:7]}", open(f).read()))
    for f in sorted(glob.glob("scan_batch/*.txt")):
        n = os.path.basename(f)[:2]
        if n.isdigit():
            items.append((f"batch{n}", open(f).read()))
    return items

rows = []
for label, text in collect():
    try:
        r = mega(text)
        rows.append({"label": label, "score": r["score"], "verdict": verdict(r["score"]),
                     "spread": r.get("spread"), "agreement": r.get("agreement"),
                     "words": len(text.split()),
                     "votes": {v["name"]: v.get("raw_ai") for v in r["votes"] if v.get("usable")}})
    except Exception as e:
        rows.append({"label": label, "score": None, "error": f"{type(e).__name__}: {str(e)[:80]}"})
    s = rows[-1]["score"]
    print(f"  {label:22} {s if s is None else round(s,3)}  {rows[-1].get('verdict','')}", flush=True)

json.dump(rows, open(str(_HERE / "method_scores.json"),"w"), indent=1, default=float)
ok = [r for r in rows if r["score"] is not None]
print()
print(f"  scored {len(ok)}/{len(rows)}")
base = next((r for r in ok if r["label"].startswith("BASELINE")), None)
if base:
    print(f"  baseline {base['score']:.3f} ({base['verdict']})")
    better = sorted([r for r in ok if not r["label"].startswith("BASELINE")],
                    key=lambda r: -r["score"])
    print(f"  improving on baseline: {sum(1 for r in better if r['score']>base['score'])}/{len(better)}")
    print()
    print("  TOP 12:")
    for r in better[:12]:
        d = r["score"] - base["score"]
        print(f"    {r['label']:22} {r['score']:.3f} ({d:+.3f})  {r['verdict']}")
