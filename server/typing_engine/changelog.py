"""Decode Google Docs' revision changelog into the stream the grader's server grades.

The research settled one thing that reframes the whole project: the grader does NOT see
raw keystrokes. It sees this changelog, normalised into

    {type, text, insertLocation, insertedLength, isPaste, timestamp, userId, revisionNumber}

and computes `human_typing_score` from it server-side. Dwell time, mouse paths and
per-keystroke flight time are not in the payload — the only timing channel is the
inter-revision interval, i.e. this file.

So this module is the honest measurement instrument: it reads back what we typed and
reports the shape the grader actually receives.

Raw entry shape (verified, see research/r4-oracle.md §2.5):

    [opDetailItem, timestamp_ms, userId, revisionNumber, revisionMac, 0, null, null, bool]

    opDetailItem = {"ty": "is",  "ibi": 418, "s": "text"}          # bare insert
                 | {"ty": "ds",  "ibi": 12,  "s": "text"}          # bare delete
                 | {"ty": "mlti", "mts": [ {...}, {...} ]}         # style-wrapped run
"""
import asyncio, json, statistics as st

META_JS = """(() => {
  const m = document.location.href.match(/\\/document\\/d\\/([^\\/]+)/);
  const d = window._docs_flag_initialData || {};
  return JSON.stringify({
    docid: m && m[1],
    token: (d.info_params && d.info_params.token) || null,
    prefix: 'https://docs.google.com/document/u/0/d'
  });
})()"""

CHANGELOG_JS = """async (docid, token, prefix) => {
  const xget = (u) => new Promise((res) => { const x = new XMLHttpRequest();
    x.open('GET', u, true); x.onreadystatechange = () => { if (x.readyState===4)
      res(String(x.responseText||'')); }; x.onerror=()=>res(''); x.send(); });
  const strip = (s) => { let t = s.startsWith(")]}'") ? s.slice(4) : s;
                         return t.startsWith("\\n") ? t.slice(1) : t; };
  const tiles = await xget(prefix+'/'+docid+'/revisions/tiles?id='+docid+
    '&start=1&showDetailedRevisions=false&loadType=0&token='+encodeURIComponent(token)+
    '&includes_info_params=true&cros_files=false');
  let total = 0;
  try { const j = JSON.parse(strip(tiles));
    for (const ti of (j.tileInfo||[])) if (ti.end>total) total=ti.end; } catch(e){}
  if (!total) return JSON.stringify({total:0, load:''});
  const load = await xget(prefix+'/'+docid+'/revisions/load?id='+docid+
    '&start=1&end='+total+'&token='+encodeURIComponent(token));
  return JSON.stringify({total, load: strip(load)});
}"""

PASTE_THRESHOLD = 112          # isPaste = insertedLength > 112
POLISH_DELETE_MIN = 12         # delete-then-insert-at-same-index => "AI Polish"
SESSION_GAP_MS = 300_000       # >5 min between edits starts a new "global burst"


async def _fetch_raw(tab):
    """Fetch the raw changelog JSON for the document open in `tab`."""
    meta = json.loads(await tab.js(META_JS, timeout=30) or "{}")
    docid, token, prefix = meta.get("docid"), meta.get("token"), meta.get("prefix")
    if not (docid and token and prefix):
        return {"ok": False, "reason": "no docid/token", "docid": docid, "raw": []}
    blob = await tab.js(
        f"({CHANGELOG_JS})({json.dumps(docid)}, {json.dumps(token)}, {json.dumps(prefix)})",
        await_promise=True, timeout=90)
    try:
        cj = json.loads(blob or "{}")
    except Exception as e:
        return {"ok": False, "reason": f"fetch: {e}", "docid": docid, "raw": []}
    try:
        raw = json.loads(cj.get("load") or "[]")
    except Exception as e:
        return {"ok": False, "reason": f"decode: {e}", "docid": docid, "raw": []}
    # /revisions/load returns {"chunkedSnapshot": [...], "changelog": [...]}.
    # Only `changelog` is the edit stream; chunkedSnapshot is document state.
    if isinstance(raw, dict):
        raw = raw.get("changelog") or []
    return {"ok": True, "docid": docid, "raw": raw}


def _ops_from_item(item):
    """Flatten one changelog opDetailItem into (kind, index, text, length).

    Inserts and deletes are NOT symmetric, and getting this wrong silently loses
    every correction we make:

        insert -> {"ty":"is",  "ibi": 418, "s": "text"}     text in `s`
        delete -> {"ty":"ds",  "si": 11, "ei": 11}          NO `s`; a range only

    A backspace run arrives as a *sequence* of single-char deletes at descending
    indices, often wrapped in `mlti`. Requiring `s` on a delete (the obvious
    reading) drops all of them, and the changelog then looks like a document
    nobody ever corrected.
    """
    out = []
    if not isinstance(item, dict):
        return out

    def take(d):
        if not isinstance(d, dict):
            return
        t = d.get("ty")
        if t in ("is", "iss"):
            s = d.get("s") if isinstance(d.get("s"), str) else ""
            if s:
                out.append(("insert", d.get("ibi"), s, len(s)))
        elif t in ("ds", "dss"):
            si, ei = d.get("si"), d.get("ei")
            if isinstance(si, (int, float)):
                n = (int(ei) - int(si) + 1) if isinstance(ei, (int, float)) else 1
                out.append(("delete", int(si), "", max(0, n)))

    if item.get("ty") == "mlti":
        for m in (item.get("mts") or []):
            take(m)
    else:
        take(item)
    return out


def parse_edits(raw):
    """Turn the raw changelog into the normalised edit stream the grader posts.

    Returns a list of dicts shaped like the wire payload, in revision order:
        {rev, ts, userId, type, index, length, text, isPaste}
    """
    edits = []
    for entry in raw:
        if not isinstance(entry, list) or len(entry) < 4:
            continue
        item, ts, uid, rev = entry[0], entry[1], entry[2], entry[3]
        for kind, index, text, length in _ops_from_item(item):
            edits.append({
                "rev": rev, "ts": ts, "userId": uid,
                "type": kind, "index": index, "length": length,
                "text": text,
                "isPaste": kind == "insert" and length > PASTE_THRESHOLD,
            })
    return edits


def signature(edits):
    """Summarise the stream the way the server's input features would see it.

    Everything here is computable from the wire payload alone — no score prediction,
    just the shape of what we hand over.
    """
    if not edits:
        return {"edits": 0}

    ins = [e for e in edits if e["type"] == "insert"]
    dels = [e for e in edits if e["type"] == "delete"]
    ts = [e["ts"] for e in edits if isinstance(e["ts"], (int, float))]
    dur = (max(ts) - min(ts)) / 1000.0 if len(ts) > 1 else 0.0

    # inter-revision intervals: the ONLY timing channel that survives to the server
    gaps = [round(ts[i] - ts[i - 1], 1) for i in range(1, len(ts))
            if isinstance(ts[i], (int, float)) and isinstance(ts[i - 1], (int, float))]
    gaps_p = [g for g in gaps if g >= 0]

    # insert-location monotonicity — the macro timeline
    locs = [e["index"] for e in ins if isinstance(e["index"], (int, float))]
    backward = [locs[i] for i in range(1, len(locs)) if locs[i] < locs[i - 1]]
    rewind = (max(locs) - locs[-1]) if len(locs) > 1 else 0

    # sessions: the grader splits on >5min between edits ("calculateGlobalBursts")
    sessions = 1
    for i in range(1, len(ts)):
        if ts[i] - ts[i - 1] > SESSION_GAP_MS:
            sessions += 1

    sizes = {}
    for e in ins:
        sizes[e["length"]] = sizes.get(e["length"], 0) + 1

    # delete immediately followed by an insert at the same index, >=12 chars
    polish = 0
    for i in range(len(edits) - 1):
        a, b = edits[i], edits[i + 1]
        if (a["type"] == "delete" and b["type"] == "insert"
                and a["index"] == b["index"] and a["length"] >= POLISH_DELETE_MIN):
            polish += 1

    chars_in = sum(e["length"] for e in ins)
    chars_out = sum(e["length"] for e in dels)

    # A backspace run arrives as consecutive single-char deletes at descending
    # indices. Bob's write-up singles this out ("pause, backspace run, pause"),
    # so the run-length distribution is worth reporting directly.
    runs, cur = [], 0
    for e in edits:
        if e["type"] == "delete":
            cur += 1
        elif cur:
            runs.append(cur); cur = 0
    if cur:
        runs.append(cur)

    # an insert landing at or before the previous delete's index = a correction
    corrections = 0
    for i in range(1, len(edits)):
        a, b = edits[i - 1], edits[i]
        if (a["type"] == "delete" and b["type"] == "insert"
                and isinstance(a["index"], (int, float)) and isinstance(b["index"], (int, float))
                and b["index"] <= a["index"]):
            corrections += 1

    return {
        "edits": len(edits),
        "inserts": len(ins),
        "deletes": len(dels),
        "chars_in": chars_in,
        "chars_deleted": chars_out,
        "delete_runs": len(runs),
        "delete_run_mean": round(sum(runs) / len(runs), 2) if runs else 0,
        "delete_run_max": max(runs) if runs else 0,
        "delete_run_hist": dict(sorted({r: runs.count(r) for r in set(runs)}.items())),
        "corrections": corrections,
        "duration_s": round(dur, 1),
        "sessions": sessions,
        "insert_sizes": dict(sorted(sizes.items())),
        "chars_per_insert": round(chars_in / len(ins), 2) if ins else 0,
        "max_insert": max(sizes) if sizes else 0,
        "gap_median": round(st.median(gaps_p), 0) if gaps_p else 0,
        "gap_p10": sorted(gaps_p)[int(0.10 * len(gaps_p))] if gaps_p else 0,
        "gap_p90": sorted(gaps_p)[int(0.90 * len(gaps_p))] if gaps_p else 0,
        "gap_max": max(gaps_p) if gaps_p else 0,
        "gap_over_2s": sum(1 for g in gaps_p if g > 2000),
        "gap_over_2s_pct": round(100.0 * sum(1 for g in gaps_p if g > 2000) / len(gaps_p), 1) if gaps_p else 0,
        "edits_per_min": round(len(edits) / (dur / 60.0), 1) if dur > 0 else 0,
        # the macro-timeline tells
        "distinct_locations": len(set(locs)),
        "backward_moves": len(backward),
        "rewind_from_end": rewind,
        "polish_shape": polish,
        "paste_flagged": sum(1 for e in ins if e["isPaste"]),
    }


async def analyze(tab):
    """Read the open document's changelog and return (raw_result, signature)."""
    got = await _fetch_raw(tab)
    if not got.get("ok"):
        return got, {"edits": 0, "error": got.get("reason")}
    edits = parse_edits(got["raw"])
    return {"ok": True, "docid": got["docid"], "edits": edits}, signature(edits)


# ---------------------------------------------------------------- CLI

if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import direct_type as dt
    import websockets, urllib.request

    def list_pages():
        with urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=8) as r:
            return json.load(r)

    async def main():
        pages = [t for t in list_pages()
                 if t.get("type") == "page" and "docs.google.com/document" in (t.get("url") or "")]
        if not pages:
            print("  no Docs tab open"); return 1
        ver = dt.http_json("/json/version")
        async with websockets.connect(ver["webSocketDebuggerUrl"],
                                      max_size=32 * 1024 * 1024) as ws:
            br = dt.Browser(ws); await br.start()
            for p in pages:
                sid = await br.ws_for(p["id"])
                tab = dt.Tab(br, sid)
                _, sig = await analyze(tab)
                docid = (p.get("url") or "").split("/document/d/")[1].split("/")[0][:14]
                print(f"\n  doc {docid}…")
                for k, v in sig.items():
                    print(f"    {k:22} {v}")
                try:
                    await br.call("Target.detachFromTarget", {"sessionId": sid})
                except Exception:
                    pass
        return 0

    sys.exit(asyncio.run(main()))


def to_wire(edits):
    """Decoded edits -> the grader's exact wire shape."""
    out = []
    for e in edits:
        if e["type"] == "insert":
            out.append({"type": "insert", "text": e["text"],
                        "insertLocation": e["index"], "insertedLength": e["length"],
                        "isPaste": e["isPaste"], "timestamp": e["ts"],
                        "userId": e["userId"], "revisionNumber": e["rev"]})
        else:
            out.append({"type": "delete", "deleteStartIndex": e["index"],
                        "deleteEndIndex": e["index"] + max(1, e["length"]) - 1,
                        "deletedLength": e["length"], "timestamp": e["ts"],
                        "userId": e["userId"], "revisionNumber": e["rev"]})
    return out
