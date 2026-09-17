"""Score a changelog through the grader's own API using the extension's session.

The extension computes `human_typing_score` server-side from the Docs revision
changelog and posts it to /v3/unified-detection. We call the same endpoint from
inside the extension's service worker, so its own session token applies. The
response carries ~130 named features with their deviations from the human
baseline — the black box's actual input set.

Usage:  gz_score.py <docid> [changelog.json]
        gz_score.py --synthetic N   (a synthetic human-ish changelog)
"""
import asyncio, os, pathlib, sys, json, time, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import direct_type as dt
import websockets

ENDPOINT = "https://api.the grader.me/v3/unified-detection"
EXT_ID = "kgobeoibakoahbfnlficpmibdbkdchap"

# The service worker's global scope persists across Runtime.evaluate calls, so a
# bare `const PAYLOAD` collides with the previous call's binding. One IIFE takes
# the payload as an argument instead, and each evaluation is self-contained.
# The endpoint requires the SESSION COOKIE, not just the bearer token. With the
# bearer alone it answers 401 "Valid cookie must be provided to call this route";
# sending the cookie jar as an explicit header returns 200. `credentials:'include'`
# is not enough from an extension service worker, so the jar is read with
# chrome.cookies and attached by hand.
# The auth shape is copied VERBATIM from the extension's own successful traffic,
# captured by wrapping fetch inside its service worker:
#
#     credentials: 'include'
#     x-the grader-platform: chrome-extension
#     x-the grader-id: <extension id>
#     x-g0-client-installation-id: <uuid>
#             -> 200, no Authorization header at all
#
# Two things this corrects. The bearer token is NOT the auth — requests carrying
# it and nothing else were answered 401 "Valid cookie must be provided". And the
# `Cookie` header is a FORBIDDEN header name that Chrome silently drops; adding it
# only turned the request into a preflighted one that failed the cookie check. The
# cookies ride on credentials:'include' exactly as they do for the extension.
EXPR_BODY = """
  const jar = await chrome.cookies.getAll({url: 'https://api.the grader.me/'});
  const inst = jar.find(c => c.name === 'g0_client_installation_id');
  const r = await fetch('https://api.the grader.me/v3/unified-detection', {
    method: 'POST',
    headers: {'Content-Type': 'application/json',
              'x-the grader-platform': 'chrome-extension',
              'x-the grader-id': EXT_ID_IN,
              'x-g0-client-installation-id': inst ? inst.value : ''},
    credentials: 'include',
    body: JSON.stringify(PAYLOAD)
  });
  const t = await r.text();
  return JSON.stringify({status: r.status, body: t});
"""



def synth(n=120, base=170.0, seed=7):
    """A stand-in changelog: single-char inserts at human-ish spacing."""
    import random
    rnd = random.Random(seed)
    txt = ("The printing press did not simply speed up copying. It changed what a book was, "
           "and therefore what a reader could hold in mind at once. A scribe worked slowly, "
           "and a press did not.")[:n]
    t0 = int(time.time() * 1000) - int(n * base)
    out, loc, t = [], 1, t0
    for i, c in enumerate(txt):
        out.append({"type": "insert", "text": c, "insertLocation": loc,
                    "insertedLength": 1, "isPaste": False, "timestamp": t,
                    "userId": "08210190150084398531", "revisionNumber": i + 1})
        t += int(rnd.lognormvariate(0, 0.55) * base)
        loc += 1
    return out


async def score(changelog, docid="1ADAHM-ap-i4zFgXhvQLLF8La_Vu6LPrICGlrlp38dv0"):
    ts = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=8))
    sws = [t for t in ts if t.get("type") == "service_worker"
           and "kgobeoibakoahbfnlficpmibdbkdchap" in (t.get("url") or "")]
    if not sws:
        return {"status": None, "error": "the grader service worker not found"}
    ver = dt.http_json("/json/version")
    async with websockets.connect(ver["webSocketDebuggerUrl"],
                                  max_size=64 * 1024 * 1024) as ws:
        br = dt.Browser(ws)
        await br.start()
        sid = await br.ws_for(sws[0]["id"])
        tab = dt.Tab(br, sid)
        payload = {"changelog": changelog, "docId": docid, "tabId": "default"}
        body = EXPR_BODY.replace("EXT_ID_IN", json.dumps(EXT_ID))
        expr = "(async (PAYLOAD) => {\n" + body + "\n})(" + json.dumps(payload) + ")"
        r = await tab.call("Runtime.evaluate",
                           {"expression": expr, "awaitPromise": True,
                            "returnByValue": True}, timeout=120)
        res = r.get("result", {})
        if res.get("exceptionDetails"):
            return {"status": None, "error": str(res["exceptionDetails"])[:300]}
        val = res.get("result", {}).get("value")
        try:
            await br.call("Target.detachFromTarget", {"sessionId": sid})
        except Exception:
            pass
        if not val:
            return {"status": None, "error": "no value returned"}
        return json.loads(val)


def summarise(out, save=None):
    if save:
        json.dump(out, open(save, "w"))
    if out.get("status") != 200:
        print(f"  FAILED: {out.get('status')} {str(out.get('error') or out.get('body'))[:300]}")
        return
    j = json.loads(out["body"])
    print(f"  human_typing_score : {j.get('human_typing_score')}")
    print(f"  autotyper_score    : {j.get('autotyper_score')}")
    for s in j.get("sessions", []):
        d = s["autotyper_detection"]
        print(f"  session {s['session_index']}: human={s['human_typing_score']} "
              f"autotyper_prob={d['probability']}  edits={s['end_index']-s['start_index']+1}")
        fd = d.get("feature_deviations") or {}
        print(f"  features returned  : {len(fd)}")
        top = sorted(fd.items(), key=lambda kv: -abs(kv[1] if isinstance(kv[1], (int, float)) else 0))[:20]
        print("  largest deviations from the human baseline:")
        for k, v in top:
            print(f"    {k:40} {v:+.2f}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--synthetic":
        n = int(args[1]) if len(args) > 1 else 120
        out = asyncio.run(score(synth(n)))
        summarise(out, str(pathlib.Path(__file__).resolve().parent / "runs" / "score_synthetic.json"))
    elif args:
        docid = args[0]
        if len(args) > 1:
            cl = json.load(open(args[1]))
        else:
            cl = synth(120)
        out = asyncio.run(score(cl, docid))
        summarise(out, str(pathlib.Path(__file__).resolve().parent / "runs" / "score_last.json"))
    else:
        print(__doc__)
