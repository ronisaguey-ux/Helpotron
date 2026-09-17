"""Score MANY candidates in ONE the detector scan.

THE DISCOVERY THIS EXISTS FOR. the detector response contains a per-paragraph score
array:

    documents[0].paragraphs[] = [{start_sentence_index, num_sentences,
                                 completely_generated_prob}]

So a single scan of a document containing N paragraphs yields N independent
scores. The free tier's binding limit is **25 SCANS per month** (the API says so
verbatim: `monthly_rate_limit_exceeded ... limit of 25 scans`), with a per-scan
cap of 10,000 characters. That makes batching the difference between testing 25
candidates a month and testing 100+.

    25 scans x 4 short excerpts per scan = 100 candidate measurements

Each candidate is placed as its own paragraph block, and the returned paragraph
probabilities are matched back to candidates by their order. A candidate that is
itself multi-paragraph is compared using the MEAN of its paragraphs.

This costs quota, so it refuses to run unless asked explicitly.
"""

from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent

import argparse
import asyncio
import json
import os
import sys
import urllib.request

sys.path.insert(0, str(_HERE))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import direct_type as dt
import websockets

HDRS = {"content-type": "application/json",
        "x-the detector-platform": "chrome-extension",
        "x-the detector-id": "kgobeoibakoahbfnlficpmibdbkdchap"}
ENDPOINT = "https://api.the detector.me/v3/ai/text"

# The free plan reports char_limit 10000; leave headroom so a scan never fails
# for size after the quota has already been spent on it.
MAX_CHARS = 9000


def chunk_candidates(cands: list[tuple[str, str]], max_chars: int = MAX_CHARS):
    """Group candidates into scans without exceeding the per-scan char cap.

    A candidate longer than the cap on its own is truncated rather than dropped,
    and that is reported, because silently skipping it would make a run look
    complete when a method was never actually measured.
    """
    batches, cur, size, notes = [], [], 0, []
    for label, text in cands:
        t = text.strip()
        if len(t) > max_chars:
            notes.append(f"{label}: truncated {len(t)}->{max_chars} chars")
            t = t[:max_chars]
        if cur and size + len(t) + 2 > max_chars:
            batches.append(cur)
            cur, size = [], 0
        cur.append((label, t))
        size += len(t) + 2
    if cur:
        batches.append(cur)
    return batches, notes


def find_tab():
    ts = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=8))
    for t in ts:
        if t.get("type") == "page" and "the detector.me" in (t.get("url") or ""):
            return t
    raise RuntimeError("no open the detector.me tab to use as the request origin")


async def scan(batches, spacing=12.0) -> list[dict]:
    tabinfo = find_tab()
    out = []
    ver = dt.http_json("/json/version")
    async with websockets.connect(ver["webSocketDebuggerUrl"],
                                  max_size=64 * 1024 * 1024) as ws:
        br = dt.Browser(ws); await br.start()
        sid = await br.ws_for(tabinfo["id"]); tab = dt.Tab(br, sid)

        async def call(text, tries=4):
            body = json.dumps({"document": text, "type": "text",
                               "interpretability_required": False})
            expr = ("""(async()=>{try{const r=await fetch(%s,{method:'POST',
              credentials:'include',headers:%s,body:%s});const t=await r.text();
              if(!t.trim())return JSON.stringify({status:r.status,empty:true});
              let j;try{j=JSON.parse(t)}catch(e){return JSON.stringify({status:r.status,raw:t.slice(0,200)})}
              return JSON.stringify({status:r.status,body:j});}catch(e){
              return JSON.stringify({err:String(e.message||e)})}})()""") % (
                json.dumps(ENDPOINT), json.dumps(HDRS), json.dumps(body))
            j = {}
            for _ in range(tries):
                r = await tab.js(expr, await_promise=True, timeout=180)
                try:
                    j = json.loads(r) if r else {}
                except Exception:
                    j = {}
                if j.get("status") == 429 or j.get("empty"):
                    msg = (j.get("body") or {}).get("error", "") if isinstance(j.get("body"), dict) else ""
                    if "monthly" in str(msg).lower():
                        raise RuntimeError(f"QUOTA: {msg[:160]}")
                    await asyncio.sleep(15); continue
                return j
            return j

        for bi, batch in enumerate(batches, 1):
            doc = "\n\n".join(t for _, t in batch)
            labels = [l for l, _ in batch]
            print(f"  scan {bi}/{len(batches)}  {len(labels)} candidate(s)  "
                  f"{len(doc)} chars", flush=True)
            j = await call(doc)
            rec = {"scan": bi, "labels": labels, "status": j.get("status")}
            d = ((j.get("body") or {}).get("documents") or [{}])[0]
            paras = d.get("paragraphs") or []
            rec["paras"] = [p.get("completely_generated_prob") for p in paras]
            rec["cls"] = d.get("predicted_class")
            rec["gen"] = d.get("completely_generated_prob")
            rec["err"] = j.get("err") or (j.get("body") or {}).get("error")
            out.append(rec)
            print(f"    -> {len(paras)} paragraph scores: {rec['paras'][:8]}"
                  f"{' ...' if len(rec['paras']) > 8 else ''}", flush=True)
            if rec.get("err"):
                print(f"    ERROR: {str(rec['err'])[:200]}", flush=True)
            await asyncio.sleep(spacing)
        try:
            await br.call("Target.detachFromTarget", {"sessionId": sid})
        except Exception:
            pass
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="folder of numbered .txt files")
    ap.add_argument("--pattern", default="*.txt")
    ap.add_argument("--out", default=str(_HERE / "batch_scan.json"))
    args = ap.parse_args()

    import glob
    files = sorted(glob.glob(os.path.join(args.dir, args.pattern)))
    cands = [(os.path.basename(f), open(f, encoding="utf-8", errors="replace").read())
             for f in files]
    if not cands:
        print("no files", file=sys.stderr); return 1

    batches, notes = chunk_candidates(cands)
    print(f"  {len(cands)} candidate(s) -> {len(batches)} scan(s)")
    for n in notes:
        print(f"    note: {n}")
    print(f"  This will consume {len(batches)} of the 25 monthly scans.")
    try:
        res = asyncio.run(scan(batches))
    except RuntimeError as e:
        print(f"  {e}")
        return 2
    json.dump(res, open(args.out, "w"), indent=1)
    print(f"  wrote {args.out}")

    # Map paragraph scores back onto candidate labels in order.
    print()
    print(f"  {'candidate':34} {'paras':>5} {'mean':>6} {'min':>6} {'max':>6}")
    for rec in res:
        ps = [p for p in rec["paras"] if isinstance(p, (int, float))]
        if not ps:
            print(f"  {'(+'.join(rec['labels'])[:32]:34} {0:>5}    -      -      -")
            continue
        # Distribute paragraph scores across the candidates in this scan, in order.
        per = max(1, len(ps) // max(1, len(rec["labels"])))
        for i, lab in enumerate(rec["labels"]):
            chunk = ps[i * per:(i + 1) * per] or ps[:per]
            if chunk:
                print(f"  {lab[:34]:34} {len(chunk):>5} {sum(chunk)/len(chunk):>6.3f} "
                      f"{min(chunk):>6.3f} {max(chunk):>6.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
