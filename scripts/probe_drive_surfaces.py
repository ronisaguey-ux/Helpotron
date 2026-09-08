#!/usr/bin/env python3
"""Drive-path probe for the two bugs v2.7.0 exists to kill.

`scripts/verify_extension.py` renders popup.html as an ordinary TAB. A tab
survives focus changes and a real browser-action popup does not, so the entire
BUG 2 mechanism is structurally unobservable there (BUGFIX-REPORT §5). The
out-of-band repro scripts that produced §4's evidence were scratch files and no
longer exist, so that evidence was not re-runnable. This probe replaces them.

It opens the GENUINE action popup with `chrome.action.openPopup()` from the
service worker and runs three cases against the unpacked build:

  A  active-tab drive   — the drive target IS the active tab. No focus switch is
                          needed, so the popup must survive and the input must
                          land on the visible page.
  B  background drive   — the active tab is undrivable (chrome://newtab) and the
                          surface is the ephemeral action popup. The popup must
                          NOT close, the active tab must NOT change, and the text
                          must still land in the background tab.
  C  side-panel drive   — the persistent surface. `chrome.runtime.getContexts()`
                          is the only exact SIDE_PANEL/POPUP discriminator. Here
                          the focus switch is expected: the panel survives it and
                          the user watches the drive happen.

The target page is the oracle: it reports clicks, typed value and per-event
`beforeinput`/`keydown` provenance over same-origin fetch, so nothing depends on
a second CDP session on a tab `chrome.debugger` already owns, and nothing
depends on the popup still being alive to report its own success.

  python3 scripts/probe_drive_surfaces.py --extension helpotron-extension-v2.7.0-test
"""

import argparse
import asyncio
import http.server
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(_HERE)

_spec = importlib.util.spec_from_file_location(
    "verify_extension", os.path.join(_HERE, "verify_extension.py"))
_ve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ve)

DRIVE_TEXT = "V270_TYPE_OK"
# Button centre (40+200/2, 40+80/2) and input centre (40+300/2, 170+40/2) of PAGE.
DRIVE_ACTIONS = ("[{op:'click', x:140, y:80}, {op:'click', x:190, y:190},"
                 " {op:'type', text:'%s'}]" % DRIVE_TEXT)

PAGE = b"""<!doctype html><html><head><meta charset="utf-8">
<title>V270 Drive Target</title><style>body{margin:0}</style></head><body>
<button id="btn" style="position:absolute;left:40px;top:40px;width:200px;height:80px;font-size:18px;">CLICK TARGET</button>
<div style="position:absolute;left:280px;top:40px;font-family:monospace;font-size:16px;">clicks: <span id="c">0</span></div>
<input id="inp" style="position:absolute;left:40px;top:170px;width:300px;height:40px;font-size:18px;" placeholder="type target">
<script>
window.__c = 0;
var ev = [];
function post(p, b) { fetch(p, {method: 'POST', body: b}).catch(function () {}); }
document.getElementById('btn').addEventListener('click', function () {
  window.__c += 1;
  document.getElementById('c').textContent = window.__c;
  post('/clicked', '');
});
var inp = document.getElementById('inp');
inp.addEventListener('input', function (e) { post('/typed', e.target.value); });
inp.addEventListener('beforeinput', function (e) {
  ev.push('beforeinput|' + e.inputType + '|' + JSON.stringify(e.data));
  post('/events', JSON.stringify(ev));
});
inp.addEventListener('keydown', function (e) {
  ev.push('keydown|' + e.key);
  post('/events', JSON.stringify(ev));
});
fetch('/ready').catch(function () {});
</script></body></html>"""


class Target:
    """Same-origin oracle for click / type / event provenance."""

    def __init__(self):
        self._srv = None

    def _handler(self):
        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, body):
                self.send_response(code)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.path.split("?")[0] == "/drive.html":
                    self.server.ready = True
                    self._send(200, PAGE)
                elif self.path == "/ready":
                    self._send(200, json.dumps({"ready": self.server.ready}).encode())
                else:
                    self._send(404, b"nf")

            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(n).decode("utf-8", "replace") if n else ""
                if self.path == "/clicked":
                    self.server.count += 1
                elif self.path == "/typed":
                    self.server.typed = body
                elif self.path == "/events":
                    try:
                        self.server.events = json.loads(body)
                    except Exception:
                        pass
                self._send(200, b"ok")

        return H

    def start(self):
        port = _ve._free_port()
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), self._handler())
        srv.count, srv.typed, srv.events, srv.ready = 0, "", [], False
        self._srv = srv
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return port

    def reset(self):
        self._srv.count, self._srv.typed, self._srv.events = 0, "", []

    clicks = property(lambda s: s._srv.count)
    typed = property(lambda s: s._srv.typed)
    events = property(lambda s: list(s._srv.events))

    def stop(self):
        if self._srv:
            try:
                self._srv.shutdown()
                self._srv.server_close()
            except Exception:
                pass


class Probe:
    def __init__(self, ext_dir, browser, outdir, throttle):
        self.ext_dir = os.path.abspath(ext_dir)
        self.browser = browser
        self.outdir = outdir
        self.throttle = throttle
        self.port = _ve._free_port()
        self.profile = tempfile.mkdtemp(prefix="helpotron-probe-", dir="/tmp")
        self.proc = None
        self.sw = None
        self.results = []
        self.ext_id = None

    # -- infrastructure ----------------------------------------------------
    def mark(self, name, status, detail):
        self.results.append({"check": name, "status": status, "detail": detail})
        print(f"  [{status:<8}] {name}: {detail}", flush=True)

    def launch(self):
        cmd = [
            self.browser,
            "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
            "--no-first-run", "--no-default-browser-check", "--disable-popup-blocking",
            f"--remote-debugging-port={self.port}", "--remote-allow-origins=*",
            f"--user-data-dir={self.profile}",
            f"--load-extension={self.ext_dir}",
        ]
        if not self.throttle:
            # A headless page is hidden, and Chrome clamps chained setTimeout in
            # hidden pages to ~1/second. glideMouseTo chains 30-95 of them, so an
            # unthrottled 300-950ms glide becomes 30-95s and the burst looks hung.
            # Every real surface (action popup, side panel, popped-out window) is
            # visible, so these flags make headless match production rather than
            # masking anything.
            cmd += ["--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding"]
        cmd.append("about:blank")
        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def targets(self):
        try:
            return _ve._http_get_json(f"http://127.0.0.1:{self.port}/json/list")
        except Exception:
            return []

    def find(self, pred, timeout=25):
        deadline = time.time() + timeout
        while time.time() < deadline:
            for t in self.targets():
                if pred(t):
                    return t
            time.sleep(0.3)
        return None

    async def connect_sw(self):
        """Pick OUR service worker, not the first one named background.js. Chrome
        registers component extensions with the same worker filename; one of them
        sorts first and reports a foreign manifest (seen: version 1.2, no
        chrome.sidePanel), which silently probes the wrong extension."""
        want = _ve.extension_id_from_path(self.ext_dir)
        seen = []
        res = {}
        deadline = time.time() + 45
        while time.time() < deadline:
            workers = [t for t in self.targets() if t.get("type") == "service_worker"
                       and "background.js" in (t.get("url") or "")]
            workers.sort(key=lambda t: 0 if f"://{want}/" in t.get("url", "") else 1)
            for t in workers:
                cdp = _ve.Cdp(t["webSocketDebuggerUrl"], skip_enable=True)
                try:
                    await cdp.start()
                    res = await cdp.send("Runtime.evaluate", {
                        "expression": "chrome.runtime.getManifest().name",
                        "returnByValue": True}, timeout=10)
                    if res.get("result", {}).get("value") == "Helpotron Academic Companion":
                        self.ext_id = (t["url"].split("://")[1]).split("/")[0]
                        self.sw = cdp
                        return
                except Exception as exc:
                    seen.append(f"{t.get('url','')[:60]}: {type(exc).__name__} {exc}"[:160])
                else:
                    seen.append(f"{t.get('url','')[:60]}: {res.get('result', {}).get('value')!r}")
                await cdp.close()
            await asyncio.sleep(0.5)
        raise RuntimeError("Helpotron service worker never appeared; saw "
                           + json.dumps(seen[-6:], indent=1))

    async def sw_js(self, expr, gesture=False):
        res = await self.sw.send("Runtime.evaluate", {
            "expression": expr, "returnByValue": True,
            "awaitPromise": True, "userGesture": bool(gesture)})
        if res.get("exceptionDetails"):
            raise RuntimeError(f"SW JS error: {res['exceptionDetails'].get('text')}")
        return res.get("result", {}).get("value")

    async def contexts(self):
        raw = await self.sw_js(
            "chrome.runtime.getContexts({}).then(cs => JSON.stringify("
            "cs.map(c => c.contextType + ':' + String(c.documentUrl || '').split('/').pop())))"
            ".catch(e => '[]')")
        try:
            return json.loads(raw)
        except Exception:
            return []

    async def active_tab(self):
        return json.loads(await self.sw_js(
            "chrome.tabs.query({active: true, lastFocusedWindow: true}).then(ts =>"
            " JSON.stringify(ts[0] ? {id: ts[0].id, url: ts[0].url} : {}))"))

    async def open_action_popup(self):
        """Open the genuine action popup. Retries the documented startup flake
        ('Could not find an active browser window') after focusing a window."""
        for attempt in range(4):
            await self.sw_js(
                "chrome.windows.getAll().then(ws => ws.length ?"
                " chrome.windows.update(ws[0].id, {focused: true}) : null).catch(() => null)")
            await asyncio.sleep(0.4)
            err = await self.sw_js(
                "chrome.action.openPopup().then(() => '').catch(e => String(e.message || e))",
                gesture=True)
            if not err:
                await asyncio.sleep(0.8)
                if any(c.startswith("POPUP:") for c in await self.contexts()):
                    return None
                err = "openPopup resolved but no POPUP context appeared"
            await asyncio.sleep(1.0 + attempt)
        return err

    async def popup_session(self, query=""):
        """Attach to a surface document. The side panel and the action popup are
        both popup.html; `?mode=panel` is what tells them apart from outside."""
        def want(t):
            url = t.get("url", "")
            return (t.get("type") == "page" and "/popup.html" in url
                    and (query in url if query else "?" not in url))
        t = self.find(want, timeout=12)
        if not t:
            return None
        c = _ve.Cdp(t["webSocketDebuggerUrl"], skip_enable=True)
        await c.start()
        return c

    async def fire_drive(self, sess):
        """Start the burst inside the surface document and instrument every CDP
        command it issues. glideMouseTo calls chrome.debugger.sendCommand
        directly (not the module's cdp() wrapper), so patching the chrome API
        object is the only way to see the whole burst."""
        await sess.send("Runtime.evaluate", {"expression": """
          (() => {
            window.__done = false; window.__res = null; window.__log = [];
            window.__t0 = performance.now();
            const orig = chrome.debugger.sendCommand.bind(chrome.debugger);
            chrome.debugger.sendCommand = function (tgt, method, params) {
              const t = Math.round(performance.now() - window.__t0);
              window.__log.push('SEND|' + method + '|t' + t);
              return orig(tgt, method, params).then(
                (r) => { window.__log.push('OK|' + method + '|t' +
                  Math.round(performance.now() - window.__t0)); return r; },
                (e) => { window.__log.push('ERR|' + method + '|' +
                  String(e && e.message || e)); throw e; });
            };
            executeReturnedActions(%s)
              .then(() => { window.__res = 'ok'; })
              .catch((e) => { window.__res = 'err:' + String(e); })
              .finally(() => { window.__done = true;
                window.__ms = Math.round(performance.now() - window.__t0); });
            return true;
          })()""" % DRIVE_ACTIONS, "returnByValue": True, "awaitPromise": True})

    async def wait_landed(self, target, timeout=60):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if target.typed == DRIVE_TEXT and target.clicks >= 1:
                return True
            await asyncio.sleep(0.4)
        return target.typed == DRIVE_TEXT and target.clicks >= 1

    async def surface_state(self, sess):
        if sess is None:
            return {"alive": False}
        try:
            res = await sess.send("Runtime.evaluate", {
                "expression": "JSON.stringify({res: window.__res, ms: window.__ms || null,"
                              " log: (window.__log || []).slice(0, 6)"
                              ".concat((window.__log || []).slice(-6))})",
                "returnByValue": True}, timeout=10)
            return dict(json.loads(res["result"]["value"]), alive=True)
        except Exception as exc:
            return {"alive": False, "why": str(exc)[:120]}

    # -- cases -------------------------------------------------------------
    async def case_active(self, target, url):
        print("[case A] drive the ACTIVE tab from the genuine action popup", flush=True)
        target.reset()
        tab = json.loads(await self.sw_js(
            f"chrome.tabs.create({{url: {json.dumps(url)}, active: true}})"
            ".then(t => JSON.stringify({id: t.id}))"))
        await asyncio.sleep(1.5)
        before = await self.active_tab()
        self.mark("A.target-active", "PASS" if before.get("id") == tab["id"] else "FAIL",
                  f"active tab before drive = {before}")
        err = await self.open_action_popup()
        if err:
            self.mark("A.action-popup", "BLOCKED", f"chrome.action.openPopup() failed: {err}")
            return
        self.mark("A.action-popup", "PASS", f"genuine action popup open: {await self.contexts()}")
        sess = await self.popup_session()
        t0 = time.time()
        await self.fire_drive(sess)
        landed = await self.wait_landed(target)
        elapsed = round(time.time() - t0, 1)
        ctx = await self.contexts()
        alive = any(c.startswith("POPUP:") for c in ctx)
        after = await self.active_tab()
        self.mark("A.popup-survived", "PASS" if alive else "FAIL",
                  f"POPUP context after drive: {alive} (contexts={ctx})")
        self.mark("A.no-focus-switch", "PASS" if after.get("id") == tab["id"] else "FAIL",
                  f"active tab unchanged: {before.get('id')} -> {after.get('id')}")
        self.mark("A.input-landed", "PASS" if landed else "FAIL",
                  f"clicks={target.clicks} typed={target.typed!r} "
                  f"(expected {DRIVE_TEXT!r}) in {elapsed}s")
        self.mark("A.event-provenance", "PASS" if target.events else "FAIL",
                  f"page events = {target.events}")
        state = await self.surface_state(sess)
        self.mark("A.burst-state", "PASS" if state.get("res") == "ok" else "NOTE",
                  f"{ {k: v for k, v in state.items() if k != 'log'} } log={state.get('log')}")
        if sess:
            await sess.close()
        await self.sw_js(f"chrome.tabs.remove([{tab['id']}]).catch(() => {{}})")

    async def case_background(self, target, url):
        print("[case B] drive a BACKGROUND tab from the ephemeral action popup", flush=True)
        target.reset()
        tab = json.loads(await self.sw_js(
            f"chrome.tabs.create({{url: {json.dumps(url)}, active: true}})"
            ".then(t => JSON.stringify({id: t.id}))"))
        await asyncio.sleep(1.5)
        nt = json.loads(await self.sw_js(
            "chrome.tabs.create({url: 'chrome://newtab', active: true})"
            ".then(t => JSON.stringify({id: t.id})).catch(e => JSON.stringify({id: null}))"))
        await asyncio.sleep(1.0)
        before = await self.active_tab()
        undrivable = str(before.get("url", "")).startswith("chrome://")
        self.mark("B.undrivable-active", "PASS" if undrivable else "FAIL",
                  f"active tab is undrivable: {before}")
        err = await self.open_action_popup()
        if err:
            self.mark("B.action-popup", "BLOCKED", f"chrome.action.openPopup() failed: {err}")
            return
        self.mark("B.action-popup", "PASS", f"genuine action popup open: {await self.contexts()}")
        sess = await self.popup_session()
        t0 = time.time()
        await self.fire_drive(sess)
        landed = await self.wait_landed(target)
        elapsed = round(time.time() - t0, 1)
        ctx = await self.contexts()
        alive = any(c.startswith("POPUP:") for c in ctx)
        after = await self.active_tab()
        self.mark("B.popup-survived", "PASS" if alive else "FAIL",
                  f"POPUP context after drive: {alive} (contexts={ctx})")
        self.mark("B.no-focus-steal", "PASS" if after.get("id") == before.get("id") else "FAIL",
                  f"active tab unchanged: {before.get('id')} -> {after.get('id')}")
        self.mark("B.input-landed", "PASS" if landed else "FAIL",
                  f"clicks={target.clicks} typed={target.typed!r} "
                  f"(expected {DRIVE_TEXT!r}) in {elapsed}s")
        self.mark("B.event-provenance", "PASS" if target.events else "FAIL",
                  f"page events = {target.events}")
        state = await self.surface_state(sess)
        self.mark("B.burst-state", "PASS" if state.get("res") == "ok" else "NOTE",
                  f"{ {k: v for k, v in state.items() if k != 'log'} } log={state.get('log')}")
        if sess:
            await sess.close()
        ids = [i for i in (tab.get("id"), nt.get("id")) if i]
        await self.sw_js(f"chrome.tabs.remove({json.dumps(ids)}).catch(() => {{}})")

    async def case_panel(self, target, url):
        print("[case C] drive from the SIDE PANEL (persistent surface, watch-it-happen)",
              flush=True)
        target.reset()
        tab = json.loads(await self.sw_js(
            f"chrome.tabs.create({{url: {json.dumps(url)}, active: true}})"
            ".then(t => JSON.stringify({id: t.id}))"))
        await asyncio.sleep(1.5)
        nt = json.loads(await self.sw_js(
            "chrome.tabs.create({url: 'chrome://newtab', active: true})"
            ".then(t => JSON.stringify({id: t.id})).catch(e => JSON.stringify({id: null}))"))
        await asyncio.sleep(1.0)
        before = await self.active_tab()
        # Go through the REAL product path: open the action popup and click the
        # ⧉ Keep open button in it. chrome.sidePanel.open() is gesture-gated and
        # a Runtime.evaluate userGesture in the SERVICE WORKER does not satisfy
        # it ("may only be called in response to a user gesture") — the gesture
        # has to come from the surface document, which is also where the real
        # click happens. This exercises BUG 1 end to end, not just the API.
        err = await self.open_action_popup()
        if err:
            self.mark("C.action-popup", "BLOCKED", f"chrome.action.openPopup() failed: {err}")
            return
        popup = await self.popup_session()
        if popup is None:
            self.mark("C.action-popup", "BLOCKED", "no action popup page target")
            return
        self.mark("C.action-popup", "PASS", "genuine action popup open")
        clicked = await popup.send("Runtime.evaluate", {
            "expression": "(() => { const b = document.getElementById('btnPopOut');"
                          " if (!b) return 'no #btnPopOut'; b.click(); return 'clicked'; })()",
            "returnByValue": True, "userGesture": True})
        err = clicked.get("result", {}).get("value")
        await asyncio.sleep(1.5)
        ctx = await self.contexts()
        panel = [c for c in ctx if c.startswith("SIDE_PANEL:")]
        self.mark("C.keep-open-click", "PASS" if err == "clicked" else "FAIL",
                  f"⧉ Keep open button: {err!r}")
        self.mark("C.side-panel-open", "PASS" if panel else "FAIL",
                  f"contexts={ctx}")
        popup_gone = not any(c.startswith("POPUP:") for c in ctx)
        self.mark("C.ephemeral-popup-closed", "PASS" if popup_gone else "FAIL",
                  f"action popup handed off to the panel: {popup_gone}")
        await popup.close()
        if not panel:
            return
        sess = await self.popup_session(query="mode=panel")
        if sess is None:
            self.mark("C.panel-session", "BLOCKED", "no popup.html?mode=panel page target")
            return
        mode = await sess.send("Runtime.evaluate", {
            "expression": "location.search", "returnByValue": True})
        self.mark("C.panel-self-id",
                  "PASS" if "mode=panel" in str(mode["result"].get("value")) else "FAIL",
                  f"panel document location.search = {mode['result'].get('value')!r}")
        t0 = time.time()
        await self.fire_drive(sess)
        landed = await self.wait_landed(target)
        elapsed = round(time.time() - t0, 1)
        ctx2 = await self.contexts()
        alive = any(c.startswith("SIDE_PANEL:") for c in ctx2)
        after = await self.active_tab()
        self.mark("C.panel-survived", "PASS" if alive else "FAIL",
                  f"SIDE_PANEL context after drive: {alive} (contexts={ctx2})")
        self.mark("C.watch-it-happen",
                  "PASS" if after.get("id") == tab["id"] else "FAIL",
                  f"panel switched the active tab to the driven page: "
                  f"{before.get('id')} -> {after.get('id')} (drive tab {tab['id']})")
        self.mark("C.input-landed", "PASS" if landed else "FAIL",
                  f"clicks={target.clicks} typed={target.typed!r} "
                  f"(expected {DRIVE_TEXT!r}) in {elapsed}s")
        state = await self.surface_state(sess)
        self.mark("C.burst-state", "PASS" if state.get("res") == "ok" else "NOTE",
                  f"{ {k: v for k, v in state.items() if k != 'log'} } log={state.get('log')}")
        await sess.close()
        ids = [i for i in (tab.get("id"), nt.get("id")) if i]
        await self.sw_js(f"chrome.tabs.remove({json.dumps(ids)}).catch(() => {{}})")

    # -- run ---------------------------------------------------------------
    async def run(self, cases):
        target = Target()
        port = target.start()
        url = f"http://127.0.0.1:{port}/drive.html"
        self.launch()
        try:
            await self.connect_sw()
            print(f"[extension] {self.ext_id} @ {self.ext_dir}", flush=True)
            ver = await self.sw_js("chrome.runtime.getManifest().version")
            self.mark("manifest.version", "PASS" if ver == "2.7.0" else "FAIL",
                      f"loaded build reports version {ver}")
            api = await self.sw_js("typeof chrome.sidePanel")
            self.mark("manifest.sidePanel-api", "PASS" if api == "object" else "FAIL",
                      f"typeof chrome.sidePanel = {api}")
            if "A" in cases:
                await self.case_active(target, url)
            if "B" in cases:
                await self.case_background(target, url)
            if "C" in cases:
                await self.case_panel(target, url)
        finally:
            target.stop()
            if self.sw:
                await self.sw.close()
            if self.proc:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=10)
                except Exception:
                    self.proc.kill()
        return self.results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extension", default=os.path.join(_REPO, "helpotron-extension-v2.7.0-test"))
    ap.add_argument("--browser", default="auto")
    ap.add_argument("--outdir", default=os.path.join(_REPO, "verify-artifacts"))
    ap.add_argument("--label", default="probe-drive")
    ap.add_argument("--cases", default="ABC")
    ap.add_argument("--throttle", action="store_true",
                    help="keep Chrome's hidden-page timer throttling (reproduces the "
                         "harness's apparent hang; off by default)")
    args = ap.parse_args()

    _ve._WS_NS = _ve._ensure_websockets()
    browser = _ve.find_browser(args.browser)
    if not browser:
        sys.exit("no chromium binary found")
    os.makedirs(args.outdir, exist_ok=True)

    probe = Probe(args.extension, browser, args.outdir, args.throttle)
    results = asyncio.get_event_loop().run_until_complete(probe.run(args.cases.upper()))

    out = os.path.join(args.outdir, f"{args.label}-results.json")
    with open(out, "w") as f:
        json.dump({"label": args.label, "extension": probe.ext_dir,
                   "extension_id": probe.ext_id, "throttled": args.throttle,
                   "results": results}, f, indent=2)
    bad = [r for r in results if r["status"] in ("FAIL", "BLOCKED")]
    print(f"\n[probe] {len(results) - len(bad)}/{len(results)} passed -> {out}")
    for r in bad:
        print(f"  [{r['status']}] {r['check']}: {r['detail']}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
