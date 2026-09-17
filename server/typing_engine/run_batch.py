import pathlib
#!/usr/bin/env python3
"""Crash-safe, resumable, idempotent batch harness for the the grader typing round.

Imports the READ-ONLY engine (direct_type.py, beside this file) and drives it one
variation at a time. A JSON manifest is written on EVERY state change, so a
SIGKILL mid-batch loses at most the row in flight; --resume skips rows already
`done` and re-runs everything else fresh (into a fresh doc).

Invariants:
  * A row is `done` only if its result file exists with a docid and no `error`.
  * Fresh-doc path: every row types into a new docs.new document.
  * Idempotency: --existing and --check-doc read the doc back via the export
    endpoint and REFUSE a non-empty doc instead of concatenating into it.
  * Manifest writes are atomic (tmp + rename).
"""
import argparse
import asyncio
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import direct_type as dt
import variations as _var
from variations import VARIATIONS, textFor

INV2 = os.environ.get("TYPING_INV2", str(pathlib.Path(__file__).resolve().parent / "research"))
OPEN_TABS_PATH = os.path.join(INV2, "open_tabs.json")
MANIFEST_PATH = os.path.join(INV2, "manifest.json")
RESULTS_DIR = os.path.join(INV2, "results")
OWNER_TABS_PATH = os.environ.get("TYPING_TABS", str(pathlib.Path(__file__).resolve().parent / "owner_tabs.json"))

BASE_MEM_MB = 800        # leave the box breathable
PER_TAB_MB = 400         # docs tab worst case (~296MB) + leak buffer
MEM_FLOOR_MB = 900       # hard abort floor during a run
TAB_RSS_LIMIT_MB = 1400  # observed per-tab leak ceiling
POLL_S = 5.0


# ---------- manifest ---------------------------------------------------------

def load_manifest():
    if os.path.exists(MANIFEST_PATH):
        try:
            return json.load(open(MANIFEST_PATH))
        except Exception:
            return None
    return None


def save_manifest(m):
    tmp = MANIFEST_PATH + ".tmp"
    json.dump(m, open(tmp, "w"), indent=2)
    os.replace(tmp, MANIFEST_PATH)


def _row(vid):
    return {"status": "pending", "label": None, "docid": None,
            "result_file": None, "started_at": None, "finished_at": None,
            "error": None, "summary": None}


def new_manifest(mode, batch, keep_tabs, rows):
    return {
        "run_id": time.strftime("%Y%m%dT%H%M%S"),
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "updated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "mode": mode,
        "batch": batch,
        "keep_tabs": keep_tabs,
        "variations": {v["id"]: _row(v["id"]) for v in rows},
    }


def touch(m):
    m["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    return m


def result_valid(rf):
    if not rf or not os.path.exists(rf):
        return False
    try:
        r = json.load(open(rf))
    except Exception:
        return False
    return bool(r.get("docid")) and not r.get("error")


# ---------- pre-flight -------------------------------------------------------

def cdp_version():
    with urllib.request.urlopen("http://127.0.0.1:9222/json/version", timeout=8) as r:
        return json.load(r)


def mem_available_mb():
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith("MemAvailable"):
                return int(line.split()[1]) // 1024
    return 0


def doc_tabs():
    with urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=8) as r:
        tabs = json.load(r)
    return [t for t in tabs
            if t.get("type") == "page" and "docs.google.com/document" in (t.get("url") or "")]


def owner_tab_ids():
    if not os.path.exists(OWNER_TABS_PATH):
        return set()
    try:
        return set(json.load(open(OWNER_TABS_PATH)))
    except Exception:
        return set()


def preflight(planned_tabs, known_mine=()):
    """Return (all_ok, [ (name, ok, detail), ... ])."""
    checks = []
    # 1. CDP reachable
    try:
        v = cdp_version()
        checks.append(("cdp", True, v.get("Browser")))
    except Exception as e:
        checks.append(("cdp", False, f"{type(e).__name__}: {e}"))
        return False, checks
    # 2. memory sufficient for planned concurrency
    avail = mem_available_mb()
    need = BASE_MEM_MB + planned_tabs * PER_TAB_MB
    checks.append(("mem", avail >= need,
                   f"avail={avail}MB need>={need}MB"))
    # 3. unexpected doc tabs. In this 5-agent box other tracks open tabs all the
    #    time, so this is a WARNING (report, never close) — not a hard gate.
    owner = owner_tab_ids()
    tabs = doc_tabs()
    mine = set(known_mine)
    orphans = [t["id"] for t in tabs if t["id"] not in owner and t["id"] not in mine]
    checks.append(("orphan_tabs", "warn" if orphans else True,
                   f"{len(tabs)} doc tabs open; {len(orphans)} neither owner nor mine: {orphans}"))
    # 4. focus fix: verified on the first real run (doc_len == source_len) and
    #    directly assertable via --check-doc on a live tab.
    checks.append(("focus_fix", "deferred",
                   "asserted per-run by doc_len==source_len; see --check-doc"))
    # Hard gates: CDP reachable and memory sufficient. Everything else is a report.
    all_ok = checks[0][1] is True and checks[1][1] is True
    return all_ok, checks


# ---------- idempotency / focus check on a live tab --------------------------

async def doc_is_empty(tab, docid):
    """Read the doc back through the authenticated export. Empty => True."""
    txt = await dt.read_doc(None, tab, docid)
    return (txt or "").strip() == "", (txt or "")


async def verify_focus_fix(tab):
    """Assert the widget is neutralised and the keystroke iframe body focused."""
    n = await dt.neutralize_widget(tab)
    st = await dt.focus_editor(tab)
    hidden = await tab.js(
        "(() => { let c=0, h=0; "
        "document.querySelectorAll('plasmo-csui').forEach(w=>{c++; "
        "if(getComputedStyle(w).display==='none'||w.hasAttribute('inert'))h++;}); "
        "const f=document.querySelector('iframe.docs-texteventtarget-iframe'); "
        "const focusOk = f && f.contentDocument && "
        "(f.contentDocument.activeElement === f.contentDocument.body); "
        "return {widgets:c, neutralised:h, iframeFocus:!!focusOk}; })()", timeout=30)
    return {"widget_count": n, "focus_status": st, "state": hidden}


# ---------- per-tab RSS guard -------------------------------------------------

def chrome_renderer_rss():
    """Best-effort renderer RSS by scanning /proc. Returns list of (pid, rss_mb)."""
    out = []
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            cmd = open(f"/proc/{pid}/cmdline", "rb").read().replace(b"\x00", b" ")
        except Exception:
            continue
        if b"--type=renderer" not in cmd:
            continue
        try:
            for line in open(f"/proc/{pid}/status"):
                if line.startswith("VmRSS"):
                    kb = int(line.split()[1])
                    out.append((int(pid), kb // 1024))
                    break
        except Exception:
            pass
    return out


# ---------- text construction -------------------------------------------------

def build_text(v, label, smoke=None):
    marker = v.get("marker") or ""
    body = _var.ESSAY_BODY if smoke is None else _var.ESSAY_BODY[:smoke]
    return f"{label} {marker} {body}".strip()


# ---------- run one row -------------------------------------------------------

async def run_row(br, v, text, keep=False, target_id=None, index=1, total=1):
    """Type one row. With target_id, use that already-open tab; else make a doc.

    The pre-opened path exists because creating a tab and typing into it in the
    same breath is a race: Docs is not ready the moment the target exists, and a
    concurrent batch that starts typing immediately leaves most docs blank. The
    owner opens the tabs, they settle, and only then does typing begin.
    """
    if target_id:
        return await dt.run_into_existing(br, v, text, target_id, index, total,
                                          keep=keep)
    return await dt.run_variation(br, v, text, keep=keep)


# ---------- main --------------------------------------------------------------

async def amain(args):
    rows = list(VARIATIONS)
    if args.ids:
        want = set(args.ids.split(","))
        rows = [v for v in rows if v["id"] in want]
    if args.max_rows:
        rows = rows[:args.max_rows]
    if args.batch:
        n, m = (int(x) for x in args.batch.split("/"))
        size = max(1, (len(rows) + m - 1) // m)
        rows = rows[(n - 1) * size:(n - 1) * size + size]

    # --check-doc <docid>: open, read back, assert empty + focus fix, close.
    if args.check_doc:
        return await check_doc_cmd(args.check_doc)

    # labels: YYMMDD + 6-digit sequence, same convention as the engine's main().
    stamp = time.strftime("%y%m%d")
    seq_base = int(stamp + "000000")
    # stable per-variation index so labels are reproducible across runs.
    idx = {v["id"]: k for k, v in enumerate(VARIATIONS, 1)}

    manifest = load_manifest()
    if args.resume and manifest:
        print(f"  resume: manifest {manifest.get('run_id')} "
              f"(updated {manifest.get('updated')})", flush=True)
    else:
        manifest = new_manifest("existing" if args.existing else "fresh",
                                args.batch, args.keep_tabs, rows)
    # ensure every selected row has an entry (new rows vs old manifest)
    for v in rows:
        manifest.setdefault("variations", {}).setdefault(v["id"], _row(v["id"]))

    # decide the work: skip `done` rows with a valid result on resume
    todo = []
    for v in rows:
        st = manifest["variations"][v["id"]]
        label = st.get("label") or f"{seq_base + idx[v['id']]:012d}"
        st["label"] = label
        if args.resume and st["status"] == "done" and result_valid(st.get("result_file")):
            print(f"  skip {v['id']}: already done ({st['docid'][:16]})", flush=True)
            continue
        todo.append(v)

    if not todo:
        print("  nothing to run — all rows done", flush=True)
        return 0

    # Map rows onto pre-opened tabs when asked. Assignment is positional and
    # stable, recorded in the manifest so a resume reuses the SAME tab for the
    # SAME row rather than shuffling documents between variations.
    tabmap = {}
    if getattr(args, "existing", False):
        try:
            opened = json.load(open(OPEN_TABS_PATH))
        except Exception as e:
            print(f"  ABORT: --existing needs {OPEN_TABS_PATH} ({type(e).__name__})",
                  flush=True)
            return 1
        ready = [r for r in opened if r.get("ready") and r.get("docid")]
        if len(ready) < len(todo):
            print(f"  ABORT: {len(ready)} loaded tab(s) for {len(todo)} row(s)",
                  flush=True)
            return 1
        for i, v in enumerate(todo):
            st = manifest["variations"][v["id"]]
            if st.get("tab_id") and st.get("docid"):
                tabmap[v["id"]] = (st["tab_id"], st["docid"])
            else:
                rec = ready[i]
                st["tab_id"] = rec["tid"]
                st["docid"] = rec["docid"]
                tabmap[v["id"]] = (rec["tid"], rec["docid"])
        print(f"  existing mode: {len(tabmap)} row(s) mapped to loaded tabs",
              flush=True)

    # Write the manifest BEFORE pre-flight, so even a pre-flight abort leaves a
    # record of what was selected.
    save_manifest(touch(manifest))

    # pre-flight. The memory figure must reflect the CONCURRENCY, not the row
    # count: 10 rows run 2-at-a-time need two tabs' worth, not ten.
    conc = max(1, int(getattr(args, "concurrency", 1) or 1))
    in_flight = min(conc, len(todo))
    ok, checks = preflight(in_flight, known_mine=[s["docid"] for s in
                         manifest["variations"].values() if s.get("docid")])
    for name, cok, detail in checks:
        print(f"  preflight {name:<12} {'OK ' if cok is True else '-- '} {detail}", flush=True)
    if not ok:
        print("  ABORT: pre-flight failed", flush=True)
        return 1

    save_manifest(touch(manifest))

    ver = cdp_version()
    import websockets
    async with websockets.connect(ver["webSocketDebuggerUrl"],
                                  max_size=64 * 1024 * 1024) as ws:
        br = dt.Browser(ws)
        await br.start()
        async def do_row(v):
            st = manifest["variations"][v["id"]]
            label = st["label"]
            text = build_text(v, label, smoke=args.smoke)
            st["status"] = "running"
            st["started_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            st["error"] = None
            save_manifest(touch(manifest))
            print(f"\n  [{v['id']}] running ({label}) smoke={args.smoke}", flush=True)
            t0 = time.time()
            res = None
            try:
                tid = tabmap.get(v["id"], (None, None))[0]
                res = await run_row(br, v, text, keep=args.keep_tabs,
                                    target_id=tid, index=idx[v["id"]] + 1,
                                    total=len(rows))
                # Score the trace through the grader's own endpoint. Without this a
                # row is only "typed"; with it a row is "typed and graded", which
                # is the whole point of the batch. Wrapped so a scoring failure
                # never loses the typing result.
                try:
                    res = await _score_row(res, text)
                except Exception as se:
                    res["score_error"] = f"{type(se).__name__}: {str(se)[:160]}"
            except Exception as e:
                res = {"id": v["id"], "error": f"{type(e).__name__}: {str(e)[:200]}"}
            if args.smoke and not res.get("error"):
                # report only the grade shape; don't dump a huge result file
                g = res.get("grade") or {}
                res["_smoke_note"] = "smoke run (truncated text)"
                st["summary"] = {"doc_len": res.get("doc_len"),
                                 "max_insert": g.get("max_insert"),
                                 "paste_flags": g.get("inserts_over_paste_threshold")}
            elif res.get("grade"):
                st["summary"] = {"doc_len": res.get("doc_len"),
                                 "max_insert": res["grade"].get("max_insert"),
                                 "paste_flags": res["grade"].get("inserts_over_paste_threshold")}
            os.makedirs(RESULTS_DIR, exist_ok=True)
            rf = os.path.join(RESULTS_DIR, f"{v['id']}.json")
            res["ran_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            res["label"] = label
            json.dump(res, open(rf, "w"))
            st["result_file"] = rf
            st["docid"] = res.get("docid")
            st["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            st["error"] = res.get("error")
            st["status"] = "failed" if res.get("error") else "done"
            save_manifest(touch(manifest))
            el = round(time.time() - t0, 1)
            if res.get("error"):
                print(f"    !! {res['error']} ({el}s)", flush=True)
            else:
                print(f"    ok: doc={res.get('docid','')[:16]} "
                      f"doc_len={res.get('doc_len')} src_len={res.get('source_len')} "
                      f"max_insert={st['summary'].get('max_insert')} "
                      f"paste_flags={st['summary'].get('paste_flags')} ({el}s)", flush=True)
            return res

        # Concurrency. Rows are independent documents typed through independent
        # CDP sessions on one shared browser, so they can run at once. The bound
        # is what keeps the machine alive: each loaded Docs tab costs ~296MB and
        # the box's swap is pinned near 100%, so the count must be explicit and
        # the pre-flight must have cleared it.
        if conc == 1:
            for v in todo:
                await do_row(v)
        else:
            print(f"  concurrency {conc}: {len(todo)} rows in flight "
                  f"{min(conc, len(todo))} at a time", flush=True)
            for k in range(0, len(todo), conc):
                chunk = todo[k:k + conc]
                print(f"\n  --- group {k // conc + 1}: "
                      f"{len(chunk)} row(s) concurrently ---", flush=True)
                await asyncio.gather(*[do_row(v) for v in chunk],
                                     return_exceptions=True)
                save_manifest(touch(manifest))

    # final state
    done = sum(1 for s in manifest["variations"].values() if s["status"] == "done")
    print(f"\n  manifest: {done}/{len(rows)} done -> {MANIFEST_PATH}", flush=True)
    return 0


async def check_doc_cmd(docid):
    ver = cdp_version()
    import websockets
    url = f"https://docs.google.com/document/d/{docid}/edit"
    async with websockets.connect(ver["webSocketDebuggerUrl"],
                                  max_size=64 * 1024 * 1024) as ws:
        br = dt.Browser(ws)
        await br.start()
        tid = await br.new_tab(url)
        tab = None
        try:
            tab = dt.Tab(br, await br.ws_for(tid))
            await tab.call("Page.enable")
            await tab.call("Runtime.enable")
            for _ in range(40):
                u = await tab.js("location.href", timeout=20)
                if "/document/d/" in (u or ""):
                    break
                await asyncio.sleep(1)
            if not await dt.wait_ready(tab):
                print(f"  check-doc {docid}: editor never ready", flush=True)
                return 1
            empty, txt = await doc_is_empty(tab, docid)
            print(f"  check-doc {docid}", flush=True)
            print(f"    doc_is_empty: {empty}  (export_len={len(txt)})", flush=True)
            print(f"    head: {txt[:80]!r}", flush=True)
            if not empty:
                print("    IDEMPOTENCY GUARD: REFUSE — doc already has content", flush=True)
            fx = await verify_focus_fix(tab)
            print(f"    focus_fix: {json.dumps(fx)}", flush=True)
            return 0 if empty else 1
        finally:
            if tab is not None:
                try:
                    await br.close_tab(tid)
                except Exception:
                    pass


def parse_args(argv):
    ap = argparse.ArgumentParser(description="resumable typing-run harness")
    ap.add_argument("--batch", default=None, help="N/M batch slice")
    ap.add_argument("--ids", default=None, help="comma-separated variation ids")
    ap.add_argument("--max-rows", type=int, default=None, help="only first N rows")
    ap.add_argument("--resume", action="store_true", help="skip done rows")
    ap.add_argument("--existing", action="store_true",
                    help="type into pre-opened tabs from open_tabs.json")
    ap.add_argument("--concurrency", type=int, default=1,
                    help="rows typed at once (each costs ~300MB of tab)")
    ap.add_argument("--smoke", type=int, default=None,
                    help="type only N chars of the essay (fast proof runs)")
    ap.add_argument("--keep-tabs", action="store_true", help="leave doc tabs open")
    ap.add_argument("--check-doc", default=None, help="idempotency+focus check on a docid")
    ap.add_argument("--preflight-only", action="store_true", help="run pre-flight and exit")
    return ap.parse_args(argv)


def main():
    args = parse_args(sys.argv[1:])
    if args.preflight_only:
        ok, checks = preflight(3)
        for name, cok, detail in checks:
            print(f"  preflight {name:<12} {'OK ' if cok is True else '-- '} {detail}")
        return 0 if ok else 1
    return asyncio.run(amain(args))




async def _score_row(res, text):
    """Grade one row's changelog through the grader's own endpoint.

    Reads the document's revision changelog back (the exact data the detector
    scores from) and posts it via the extension's session. Records the score AND
    the feature deviations, so a batch produces a tunable signal rather than a
    pass/fail bit.

    Never raises: a scoring failure must not discard a completed typing run.
    """
    docid = res.get("docid")
    if not docid:
        res["score_error"] = "no docid to score"
        return res
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import changelog as cl
    import gz_score as gz

    # Settle. The changelog gains its final revision ~10s after typing stops, so
    # an immediate read silently undercounts the last few characters.
    await asyncio.sleep(12)

    ver = cdp_version()
    import websockets
    opened = False
    async with websockets.connect(ver["webSocketDebuggerUrl"],
                                  max_size=64 * 1024 * 1024) as ws:
        br = dt.Browser(ws)
        await br.start()

        # The run closes its own tab when finished, so the document is usually
        # NOT open at this point. Reopen it: the changelog lives server-side in
        # Docs, so ANY tab showing the doc can read it. Reading is not the same
        # as typing, so this needs none of the focus-fix machinery.
        t = _find_doc_tab(docid)
        if t is None:
            tid = await br.new_tab(
                f"https://docs.google.com/document/d/{docid}/edit")
            opened = True
            # Docs needs to finish loading its editor before /revisions answers
            for _ in range(40):
                await asyncio.sleep(1.5)
                cand = _find_doc_tab(docid)
                if cand:
                    t = cand
                    break
            if t is None:
                res["score_error"] = "reopened doc tab never appeared"
                try:
                    await br.close_tab(tid)
                except Exception:
                    pass
                return res
            await asyncio.sleep(4)

        sid = await br.ws_for(t["id"])
        tab = dt.Tab(br, sid)
        try:
            got, sig = await cl.analyze(tab)
            edits = got.get("edits") or []
            wire = cl.to_wire(edits)
            out = await gz.score(wire, docid=docid)
            res["changelog"] = {k: v for k, v in sig.items()
                                if k != "insert_sizes"}
            res["score_status"] = out.get("status")
            if out.get("status") == 200:
                j = json.loads(out["body"])
                res["score"] = {
                    "human_typing_score": j.get("human_typing_score"),
                    "autotyper_score": j.get("autotyper_score"),
                    "sessions": [
                        {"index": s.get("session_index"),
                         "human": s.get("human_typing_score"),
                         "prob": (s.get("autotyper_detection")
                                  or {}).get("probability"),
                         "features": (s.get("autotyper_detection")
                                      or {}).get("feature_deviations")}
                        for s in (j.get("sessions") or [])],
                }
            else:
                res["score_error"] = str(out.get("error")
                                         or out.get("body"))[:200]
        finally:
            try:
                await br.call("Target.detachFromTarget", {"sessionId": sid})
            except Exception:
                pass
            if opened:
                try:
                    await br.close_tab(t["id"])
                except Exception:
                    pass
    return res


def _find_doc_tab(docid):
    """Locate the page tab showing `docid`, without creating a new one."""
    try:
        for t in json.load(urllib.request.urlopen(
                "http://127.0.0.1:9222/json/list", timeout=8)):
            if t.get("type") == "page" and docid in (t.get("url") or ""):
                return t
    except Exception:
        pass
    return None


if __name__ == "__main__":
    sys.exit(main())
