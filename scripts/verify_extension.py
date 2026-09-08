#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_extension.py — Helpotron Chrome extension (v2.6.1) verification harness.

Lane 5 verification infrastructure. Launches a chromium engine with the
unpacked extension in a FRESH TEMP PROFILE (never the user's real Chrome
profile), opens every surface of the extension, drives the toggles with real
keyboard events (focus + CDP Input.dispatchKeyEvent — no mouse coordinates,
no injected .click() on state controls), and saves full-page screenshots to
verify-artifacts/.

Surfaces covered:
    launch (popup launcher) / chat (popup Agent chat view) /
    type (popup Launch-to-Doc humanized typing) / settings (popup settings) /
    options (options.html) / onboarding (onboarding.html) / agent (agent_mode.html)

Interactions performed (all keyboard-driven, all local-only):
    popup:   toggleEducationalMode, toggleSeeScreen, toggleExecute
             mode segmented control (Manual/Automatic/YOLO)
             Launch-to-Doc preset buttons (Academic/Careful/Fast)
             theme pick (Dark/Light/System)
    agent:   Control switch (consent modal is captured, then refused — Control
             is left OFF; nothing is ever typed or sent anywhere)

No login, no scrape/crawl, no chat sends, no writes to any server. Writes go
only to chrome.storage.local inside the throwaway temp profile.

Usage:
    python3 scripts/verify_extension.py --label before
    python3 scripts/verify_extension.py --label live-20260907-193000 --surfaces chat,agent
    python3 scripts/verify_extension.py --browser /usr/bin/chromium --keep-profile

Options:
    --label        filename prefix (default live-<YYYYmmdd-HHMMSS>)
    --outdir       output directory (default <repo>/verify-artifacts)
    --extension    dir to load (default <repo>/extension)
    --browser      chromium binary; "auto" picks the Playwright Chromium build
                   first, then chromium/chromium-browser/google-chrome
    --surfaces     comma-separated subset of the 7 surfaces
    --viewport     WxH desktop viewport for wide surfaces (default 1280x1600)
    --keep-profile do not delete the temp profile after the run
    --no-toggles   screenshots only, skip the toggle pass
    --verbose      dump CDP console errors/messages to the summary

Exit codes:
    0 success; 1 extension never loaded (see stderr — the branded Google
    Chrome build ignores --load-extension by design; use a Chromium build).
"""

import argparse
import asyncio
import base64
import glob
import hashlib
import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.request

_REPO = "/home/roni/Roni_workspace/helpotron"
_DEFAULT_EXT = os.path.join(_REPO, "extension")
_DEFAULT_OUT = os.path.join(_REPO, "verify-artifacts")
_VENV_SITE_GLOBS = [
    os.path.join(_REPO, ".venv", "lib", "python*", "site-packages"),
]


def _ensure_websockets():
    """Import websockets; fall back to the repo venv's site-packages so the
    script also runs under a bare system python3."""
    try:
        return __import__("websockets")
    except Exception:
        pass
    for pat in _VENV_SITE_GLOBS:
        for path in sorted(glob.glob(pat), reverse=True):
            if path not in sys.path:
                sys.path.insert(0, path)
    ws = __import__("websockets", fromlist=["connect"])
    # Some websockets versions rename connect -> ClientConnection; verify.
    assert hasattr(ws, "connect"), "websockets missing (pip install websockets)"
    return ws


_WS_NS = None  # filled by _ensure_websockets()


# --------------------------------------------------------------------------
# helpers


def _free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _http_get_json(url, timeout=4):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def find_browser(pref):
    if pref and pref != "auto":
        return pref if os.path.exists(pref) else None
    cands = []
    for home in ("/home/roni", "/home/roni-saguey"):
        cands += sorted(
            glob.glob(os.path.join(home, ".cache", "ms-playwright", "chromium-*",
                                   "chrome-linux64", "chrome")),
            reverse=True,
        )
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        found = shutil.which(name)
        if found:
            cands.append(found)
    for c in cands:
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def extension_id_from_path(path):
    """Chrome derives the unpacked id from the sha256 of the absolute path.
    Fallback only — the live service-worker target is the primary source."""
    p = os.path.abspath(path).encode("utf-8")
    digest = hashlib.sha256(p).digest()[:16]
    chars = []
    for b in digest:
        chars.append(chr(ord("a") + ((b >> 4) & 0x0F)))
        chars.append(chr(ord("a") + (b & 0x0F)))
    return "".join(chars)


# --------------------------------------------------------------------------
# CDP client (per-page session, stdlib urllib + websockets)


class Cdp:
    def __init__(self, ws_url, console=None, skip_enable=False):
        self.ws_url = ws_url
        self.msg_id = 0
        self.console = console if console is not None else []
        self.skip_enable = skip_enable
        self.ws = None

    async def start(self):
        self.ws = await _WS_NS.connect(
            self.ws_url, max_size=50 * 1024 * 1024, max_queue=256, open_timeout=15
        )
        if self.skip_enable:
            return
        await self.send("Page.enable")
        await self.send("Runtime.enable")
        await self.send("Log.enable")
        await self.send("DOM.enable")

    async def send(self, method, params=None, timeout=30):
        self.msg_id += 1
        msg = {"id": self.msg_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(msg))
        while True:
            data = json.loads(
                await asyncio.wait_for(self.ws.recv(), timeout=timeout)
            )
            m = data.get("method")
            if m == "Log.entryAdded" and data.get("params", {}).get("entry", {}).get("level") in ("error", "warning"):
                e = data["params"]["entry"]
                self.console.append(f"[{e['level']}] {e.get('text', '')[:300]}")
            if m == "Runtime.consoleAPICalled" and data.get("params", {}).get("type") == "error":
                args = data["params"].get("args", [])
                txt = " ".join(str(a.get("value", a.get("description", ""))) for a in args)[:300]
                self.console.append(f"[console.error] {txt}")
            if m == "Runtime.exceptionThrown":
                details = data.get("params", {}).get("exceptionDetails", {})
                self.console.append(f"[page exception] {str(details.get('text', ''))[:300]}")
            if data.get("id") == self.msg_id:
                if "error" in data:
                    raise RuntimeError(f"{method}: {data['error']}")
                return data.get("result", {})

    async def js(self, expr):
        res = await self.send("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True,
        })
        if res.get("exceptionDetails"):
            raise RuntimeError(f"JS error in {expr[:80]}: "
                               f"{res['exceptionDetails'].get('text')}")
        return res.get("result", {}).get("value")

    async def navigate(self, url, settle=0.9, expect_ext=False):
        """Navigate a tab; if expect_ext, retry until the page really lives in the
        extension context (a too-early navigation yields ERR_BLOCKED_BY_CLIENT
        while the unpacked extension is still registering)."""
        for attempt in range(1, 9):
            try:
                await self.send("Page.navigate", {"url": url})
            except RuntimeError:
                pass
            live = False
            for _ in range(60):
                try:
                    state = await self.js("document.readyState")
                    if state == "complete":
                        break
                except RuntimeError:
                    pass
                await asyncio.sleep(0.15)
            if not expect_ext:
                await self.js("document.fonts ? document.fonts.ready.then(()=>true) : true")
                await asyncio.sleep(settle)
                return
            live = await self.js(
                "!!(window.location.href.startsWith('chrome-extension://')"
                " && window.chrome && chrome.runtime && chrome.runtime.getManifest)"
            )
            if live:
                await self.js("document.fonts ? document.fonts.ready.then(()=>true) : true")
                await asyncio.sleep(settle)
                return
            if attempt < 8:
                await asyncio.sleep(1.0)
        raise RuntimeError(f"extension page never became live: {url}")

    async def set_metrics(self, width, height):
        await self.send("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": height,
            "deviceScaleFactor": 1, "mobile": False,
        })

    async def screenshot(self, path):
        res = await self.send("Page.captureScreenshot", {
            "format": "png", "captureBeyondViewport": True,
        }, timeout=90)
        data = base64.b64decode(res["data"])
        with open(path, "wb") as f:
            f.write(data)
        return len(data)

    async def close(self):
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass


KEY_SPACE = {"key": " ", "code": "Space", "text": " ",
             "windowsVirtualKeyCode": 32, "nativeVirtualKeyCode": 32}
KEY_ENTER = {"key": "Enter", "code": "Enter", "text": "\r",
             "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13}
KEY_ESCAPE = {"key": "Escape", "code": "Escape",
              "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27}


class Driver:
    """Surface walker: navigation + keyboard interactions + screenshots."""

    def __init__(self, cdp, ext_id, label, outdir, log):
        self.cdp = cdp
        self.ext_id = ext_id
        self.label = label
        self.outdir = outdir
        self.log = log
        self.manifest = {}
        self.toggle_results = []
        self.files = []
        self.console = []

    # -- low-level ---------------------------------------------------------
    async def key_press(self, selector, key, keyname):
        """Focus the element with real keyboard events and press the key."""
        found = await self.cdp.js(
            "(() => { const el = document.querySelector(%s);"
            " if (!el) return null;"
            " el.focus();"
            " return {tag: el.tagName, id: el.id || null, cls: el.className || null}; })()"
            % json.dumps(selector)
        )
        if not found:
            return False
        for ev in ("keyDown", "keyUp"):
            await self.cdp.send("Input.dispatchKeyEvent",
                                dict(type=ev, **{k: v for k, v in key.items()}))
        await asyncio.sleep(0.25)
        return True

    async def press(self, selector, key, keyname):
        ok = await self.key_press(selector, key, keyname)
        self.log(f"  [key] {keyname:6s} {selector} -> "
                 + ("pressed" if ok else "NOT FOUND (skipped)"))
        return ok

    async def shot(self, name, width=None, height=None):
        if width and height:
            await self.cdp.set_metrics(width, height)
            await asyncio.sleep(0.35)
        path = os.path.join(self.outdir, name)
        size = None
        for attempt in (1, 2):
            try:
                size = await self.cdp.screenshot(path)
                break
            except Exception as exc:
                self.log(f"  [shot] {name}: attempt {attempt} failed ({exc}) — retrying")
                await asyncio.sleep(1.5)
        if size is None:
            raise RuntimeError(f"screenshot failed for {name}")
        self.files.append(name)
        self.log(f"  [shot] {name} ({size} bytes)")
        return path

    # -- per-surface -------------------------------------------------------
    def _popup_meta(self):
        return {
            "launch":   ("#tabNavLauncher", 420, 1580),
            "chat":     ("#tabNavChat", 420, 1580),
            "type":     ("#tabNavType", 420, 1580),
            "settings": ("#tabNavSettings", 420, 1580),
            "options":     (None, 1280, 1600),
            "onboarding":  (None, 1280, 1600),
            "agent":       (None, 1280, 1600),
        }

    async def run_surface(self, surface, popup_url):
        meta = self._popup_meta()[surface]
        tab_sel, width, height = meta
        log = self.log
        page_file = {
            "options": "options.html", "onboarding": "onboarding.html",
            "agent": "agent_mode.html",
        }.get(surface)
        if page_file:
            await self.cdp.navigate(f"{popup_url}/{page_file}", expect_ext=True)
        else:
            # popup.html, then activate the requested tab via Enter on the tab button
            if tab_sel and surface != "launch":
                await self.cdp.navigate(f"{popup_url}/popup.html", expect_ext=True)
                await self.press(tab_sel, KEY_ENTER, "Enter")
        await self.shot(f"{self.label}-{surface}.png", width, height)
        return surface in ("launch", "chat", "type", "settings") and tab_sel

    async def do_toggles(self, surface, popup_url):
        """The 3 switches (Agent Controls panel, launcher view) + the agent
        window's Control switch. The panel is collapsed by default: expand the
        option card first with Enter so the controls are actually rendered."""
        results = self.toggle_results
        if surface == "launch":
            # open the Agent Controls card (collapsed by default)
            await self.press("#option-chat", KEY_ENTER, "Enter")
            await asyncio.sleep(0.6)
            visible = await self.cdp.js(
                "(() => { const p = document.getElementById('chat-options');"
                " return p ? !p.hidden : null; })()")
            self.log(f"  [panel] #chat-options expanded: {visible}")
            await self.shot(f"{self.label}-launcher-agent-controls-open.png", 420, 1580)
            toggles = [
                ("#toggleEducationalMode", "educational",
                 "#toggleEducationalMode, input[aria-label*='Educational' i]"),
                ("#toggleSeeScreen", "seescreen",
                 "#toggleSeeScreen, input[aria-label*='See screen' i]"),
                ("#toggleExecute", "execute",
                 "#toggleExecute, input[aria-label*='Execute' i]"),
            ]
            for primary, name, selector in toggles:
                pre = await self.cdp.js(
                    "(() => { const el = document.querySelector(%s);"
                    " return el ? {checked: el.checked, aria: el.getAttribute('aria-checked')} : null; })()"
                    % json.dumps(selector))
                if pre is None:
                    self.log(f"  [toggle] {name}: NOT FOUND (skipped)")
                    results.append((name, "not-found", ""))
                    continue
                self.log(f"  [toggle] {name}: before {pre}")
                await self.press(selector, KEY_SPACE, "Space")
                post = await self.cdp.js(
                    "(() => { const el = document.querySelector(%s);"
                    " return el ? {checked: el.checked, aria: el.getAttribute('aria-checked')} : null; })()"
                    % json.dumps(selector))
                ok = post is not None and post["checked"] != pre["checked"]
                self.log(f"  [toggle] {name}: after {post} -> "
                         + ("OK (state changed)" if ok else "FAILED (state unchanged)"))
                results.append((name, "ok" if ok else "failed", str(post)))
                await self.shot(f"{self.label}-launcher-toggle-{name}-{'on' if post and post['checked'] else 'off'}.png",
                                420, 1580)
            # 3-way permission mode — cycle through all three
            for mode in ("manual", "auto", "yolo"):
                await self.press(f"#modeSeg .mode-btn[data-mode='{mode}'], "
                                 f".mode-btn[data-mode='{mode}']", KEY_ENTER, "Enter")
            mode_pressed = await self.cdp.js(
                "(() => { const m = {};"
                " document.querySelectorAll('.mode-btn[data-mode]').forEach(b =>"
                "   m[b.dataset.mode] = b.getAttribute('aria-pressed'));"
                " return JSON.stringify(m); })()")
            self.log(f"  [mode] aria-pressed after cycle: {mode_pressed}")
            results.append(("mode-seg", "ok", mode_pressed or ""))
            await self.shot(f"{self.label}-launcher-mode-final.png", 420, 1580)
        elif surface == "type":
            # launch-to-doc humanized-typing presets: Academic(65) / Careful(48) / Fast(85) wpm
            for wpm in ("65", "48", "85"):
                await self.press(f"button.ltd-preset[data-wpm='{wpm}']", KEY_ENTER, "Enter")
            await self.shot(f"{self.label}-type-presets-cycled.png", 420, 1580)
        elif surface == "settings":
            await self.press("[data-theme-pick='light']", KEY_ENTER, "Enter")
            await self.shot(f"{self.label}-settings-theme-light.png", 420, 1580)
            await self.press("[data-theme-pick='dark']", KEY_ENTER, "Enter")
            await self.shot(f"{self.label}-settings-theme-dark.png", 420, 1580)
        elif surface == "agent":
            pre = await self.cdp.js(
                "(() => { const el = document.querySelector('#controlToggle');"
                " return el ? {checked: el.checked} : null; })()")
            if pre is None:
                self.log("  [toggle] agent Control: NOT FOUND (skipped)")
                results.append(("agent-control", "not-found", ""))
                return
            self.log(f"  [toggle] agent Control: before {pre}")
            await self.press("#controlToggle", KEY_SPACE, "Space")
            await asyncio.sleep(0.6)
            consent = await self.cdp.js(
                "(() => { const o = document.querySelector('#consentOverlay');"
                " return o ? !o.classList.contains('hidden') : false; })()")
            post = await self.cdp.js(
                "(() => { const el = document.querySelector('#controlToggle');"
                " return el ? {checked: el.checked} : null; })()")
            if consent:
                await self.shot(f"{self.label}-agent-control-consent.png", 1280, 1600)
                self.log("  [toggle] agent Control: consent modal shown (captured) — refusing")
                await self.press("#consentCancel", KEY_ENTER, "Enter")
                await asyncio.sleep(0.4)
                await self.press("#controlToggle", KEY_SPACE, "Space")  # leave Control OFF
            ok = post is not None and post["checked"]
            results.append(("agent-control", "ok" if ok else "failed", str(post)))
            self.log(f"  [toggle] agent Control: after {post} -> " +
                     ("OK (toggled)" if ok else "FAILED (state unchanged)"))

    # -- object model ------------------------------------------------------
    async def read_manifest(self):
        self.manifest = await self.cdp.js("chrome.runtime.getManifest()") or {}


# --------------------------------------------------------------------------
# Lane 5 (final2) feature checks: approval card / drive / keep-open
# --------------------------------------------------------------------------


class DriveServer:
    """Tiny local http server that proves a real CDP click landed. The target
    page posts /clicked from its own click handler (same-origin fetch — no
    extension involvement), so the harness can assert landing without any CDP
    connection to the driven tab (chrome.debugger owns that tab during the
    burst — a second DevTools session would make the attach fail, which is
    exactly the bug class under test)."""

    PAGE = b"""<!doctype html><html><head><meta charset="utf-8">
<title>LH5 Drive Target</title><style>body{margin:0}</style></head>
<body>
<button id="lh5btn" style="position:absolute;left:40px;top:40px;width:200px;height:80px;font-size:18px;">LH5 CLICK TARGET</button>
<div style="position:absolute;left:280px;top:40px;font-family:monospace;font-size:16px;">clicks: <span id="lh5count">0</span></div>
<input id="lh5input" style="position:absolute;left:40px;top:170px;width:300px;height:40px;font-size:18px;" placeholder="type target">
<script>
window.__lh5c = 0;
document.getElementById('lh5btn').addEventListener('click', function () {
  window.__lh5c += 1;
  document.getElementById('lh5count').textContent = window.__lh5c;
  fetch('/clicked', { method: 'POST' }).catch(function () {});
});
// Typing coverage. Reported the same same-origin way as clicks so the assertion
// never needs a second CDP session on a tab chrome.debugger already owns.
document.getElementById('lh5input').addEventListener('input', function (e) {
  fetch('/typed', { method: 'POST', body: e.target.value }).catch(function () {});
});
fetch('/ready').catch(function () {});
document.title = 'LH5DRIVE-' + Date.now();
</script></body></html>"""

    def __init__(self):
        self._count = 0
        self._ready = False
        self._srv = None
        self._thread = None

    def _handler(self, _ignored):
        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, body, ctype="text/plain"):
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.path.split("?")[0] == "/drive.html":
                    self.server.ready = True
                    self._send(200, DriveServer.PAGE, "text/html; charset=utf-8")
                elif self.path == "/clicked":
                    self._send(200, json.dumps({"count": self.server.count}).encode(), "application/json")
                elif self.path == "/ready":
                    self._send(200, json.dumps({"ready": self.server.ready}).encode(), "application/json")
                else:
                    self._send(404, b"not found")

            def do_POST(self):
                if self.path == "/clicked":
                    self.server.count += 1
                    self._send(200, json.dumps({"count": self.server.count}).encode(), "application/json")
                elif self.path == "/typed":
                    n = int(self.headers.get("Content-Length") or 0)
                    self.server.typed = self.rfile.read(n).decode("utf-8", "replace") if n else ""
                    self._send(200, json.dumps({"typed": self.server.typed}).encode(), "application/json")
                else:
                    self._send(404, b"not found")

        return H

    def start(self):
        port = _free_port()
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), self._handler(None))
        srv.count = 0
        srv.ready = False
        srv.typed = ""
        self._srv = srv
        self._thread = threading.Thread(target=srv.serve_forever, daemon=True)
        self._thread.start()
        return port

    def stop(self):
        if self._srv:
            try:
                self._srv.shutdown()
                self._srv.server_close()
            except Exception:
                pass
            self._srv = None

    def clicks(self):
        return self._srv.count if self._srv else 0

    def typed(self):
        return self._srv.typed if self._srv else ""

    async def wait_ready(self, timeout=12):
        if not self._srv:
            return False
        url = f"http://127.0.0.1:{self._srv.server_address[1]}/ready"
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if _http_get_json(url).get("ready"):
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.3)
        return False


class FeatureRunner:
    """final2 harness phase: three feature-level checks that exercise the new
    v2.6.1 surfacing — the approval card (three buttons + optional note input
    + auto-add), the drive path over an undriveable tab (auto-switch OR the
    RETRY bar), and the keep-open popped-out window. Every check asserts the
    SPEC behavior; against the current mid-edit tree, sub-checks that the
    parallel lanes have not landed yet are reported PENDING with evidence,
    never silently skipped."""

    def __init__(self, driver, port, popup_url):
        self.d = driver          # Driver: .cdp .log .press .shot .outdir .label
        self.cdp = driver.cdp
        self.port = port
        self.popup_url = popup_url
        self.results = []
        self._worker = None      # Cdp attached to the background service worker

    # -- bookkeeping ---------------------------------------------------------
    def mark(self, check, status, detail):
        self.results.append({"check": check, "status": status, "detail": detail})
        self.d.log(f"  [{status:8s}] {check}: {detail[:300]}")
        return status

    async def popup_ready(self):
        # KNOWN BLIND SPOT — read this before trusting a green run.
        # This loads popup.html as an ordinary TAB. A tab survives focus changes;
        # a real browser-action popup is DESTROYED by them. So any bug whose
        # mechanism is "the popup document dies mid-await" (e.g. calling
        # tabs.update({active:true}) before chrome.debugger.attach) is invisible
        # here and the check passes anyway. Exercising the genuine action popup
        # needs chrome.action.openPopup() from the service worker; that path is
        # covered out-of-band by scratchpad/repro/repro_bug2.py.
        await self.cdp.navigate(f"{self.popup_url}/popup.html", expect_ext=True)
        await asyncio.sleep(0.4)

    def _ext_pages(self):
        try:
            pages = _http_get_json(f"http://127.0.0.1:{self.port}/json/list")
        except Exception:
            return []
        return pages

    def _find(self, pred):
        for p in self._ext_pages():
            if pred(p):
                return p
        return None

    async def _worker_cdp(self, wait=10):
        """Connect CDP to the background service worker so we can tap
        APPROVAL_RESPONSE as it leaves the popup (runtime.sendMessage never
        loops back to the sender, so the popup cannot observe its own
        decision; the worker sees everything)."""
        deadline = time.time() + wait
        while time.time() < deadline:
            t = self._find(lambda p: p.get("type") == "service_worker"
                           and "background.js" in (p.get("url") or ""))
            if t:
                # service-worker targets have NO Page/DOM domains — only the
                # Runtime one is needed for the tap listener.
                c = Cdp(t["webSocketDebuggerUrl"], skip_enable=True)
                await c.start()
                self._worker = c
                await c.js("(() => { const g = globalThis;"
                           " if (!g.__lh5tap) {"
                           "  g.__lh5tap = [];"
                           "  chrome.runtime.onMessage.addListener((m) => {"
                           "    if (m && (m.act === 'APPROVAL_RESPONSE' || m.action === 'APPROVAL_RESPONSE')) {"
                           "      g.__lh5tap.push({reqId: String(m.reqId||''),"
                           "        decision: m.decision || null,"
                           "        message: (m.text !== undefined ? m.text"
                           "          : (m.message !== undefined ? m.message : null)),"
                           "        autoAdd: m.autoAdd === true,"
                           "        act: String(m.act || m.action || '')}); } });"
                           "} return g.__lh5tap.length; })()")
                return c
            await asyncio.sleep(0.6)
        return None

    async def _worker_log(self):
        if not self._worker:
            return []
        try:
            return (await self._worker.js("globalThis.__lh5tap || []")) or []
        except Exception:
            return []

    async def _worker_entries(self, req_id):
        return [e for e in await self._worker_log() if e.get("reqId") == req_id]

    # -- approval card -------------------------------------------------------
    APPROVAL_IDS = [
        ("approvalCard", "core"), ("approvalTitle", "core"), ("approvalText", "core"),
        ("approvalApprove", "core"), ("approvalReject", "core"), ("approvalNeutral", "core"),
        ("approvalInput", "core"), ("approvalHelper", "core"), ("approvalStatus", "core"),
        ("approvalApproveAuto", "auto-add"),   # owner addition (4th button)
        ("approveBtn", "legacy"), ("denyBtn", "legacy"),  # pre-contract ids
    ]

    async def _has_id(self, i):
        return await self.cdp.js(f"!!document.getElementById({json.dumps(i)})")

    async def _card_state(self):
        return await self.cdp.js(
            "(() => { const c = document.getElementById('approvalCard');"
            " if (!c) return null;"
            " const r = c.getBoundingClientRect();"
            " const st = document.getElementById('approvalStatus');"
            " const sr = st ? st.getBoundingClientRect() : null;"
            " return JSON.stringify({"
            "  display: c.style.display, visible: r.height > 0,"
            "  title: (document.getElementById('approvalTitle')||{}).innerText || '',"
            "  text: (document.getElementById('approvalText')||{}).innerText || '',"
            "  input: (document.getElementById('approvalInput')||{}).value || '',"
            "  statusHidden: st ? st.hidden : null,"
            "  statusText: sr && sr.height > 0 ? (st.innerText || '') : '',"
            "  activeIsInput: document.activeElement === document.getElementById('approvalInput'),"
            "  inputAriaInvalid: document.getElementById('approvalInput')"
            "      ? document.getElementById('approvalInput').getAttribute('aria-invalid') : null,"
            "  inputClass: document.getElementById('approvalInput')"
            "      ? document.getElementById('approvalInput').className : '',"
            "  statusline: (document.getElementById('statusText')||{}).innerText || '' }); })()")

    def _parse(self, state):
        if state is None:
            return {}
        try:
            return json.loads(state) if isinstance(state, str) else state
        except Exception:
            return {}

    async def _pump_req(self, req_id, summary):
        """Ask the broker for an approval through the real protocol; keep the
        promise so we can later assert it resolved while we were clicking."""
        await self.cdp.js(
            "(() => { window.__lh5apprResult = null;"
            " window.__lh5apprP = new Promise((res) => {"
            "   chrome.runtime.sendMessage({action:'REQ_APPROVAL',"
            "     reqId: %s, title: 'Lane5 simulated check', summary: %s})"
            "     .then((r) => res({resolved: true, ok: r && r.ok,"
            "       approved: r && r.approved, reason: r && r.reason, reqId: r && r.reqId}))"
            "     .catch((e) => res({resolved: true, error: String(e)}));"
            " }).then((r) => { window.__lh5apprResult = r; });"
            " return true; })()" % (json.dumps(req_id), json.dumps(summary)))

    async def _req_result(self):
        return await self.cdp.js("window.__lh5apprResult")

    async def _drain_leftover(self, keep_req_id):
        """Answer (deny) every queued approval in front of `keep_req_id` so the
        card underneath the current case is the one we just pumped. Uses the
        real protocol (answerApproval -> APPROVAL_RESPONSE) — never DOM-only."""
        return await self.cdp.js(
            "(() => { let n = 0;"
            " while (typeof pendingApprovals !== 'undefined' && pendingApprovals.length &&"
            "        pendingApprovals[0].reqId !== %s) {"
            "   answerApproval(pendingApprovals[0].reqId, false); n += 1; }"
            " renderNextApproval(); return n; })()" % json.dumps(keep_req_id))

    async def _input_focus_via_cdp(self, selector):
        ok = await self.cdp.js("(() => { const el = document.querySelector(%s);"
                               " if (!el) return false; el.focus(); return true; })()"
                               % json.dumps(selector))
        return ok

    async def _insert_text(self, text):
        await self.cdp.send("Input.insertText", {"text": text})

    async def _press(self, selector, keyname):
        key = {"Enter": KEY_ENTER, "Space": KEY_SPACE}[keyname]
        return await self.d.press(selector, key, keyname)

    async def check_approval(self):
        d = self.d
        mark = self.mark
        await self.popup_ready()
        found = {}
        for i, kind in self.APPROVAL_IDS:
            found[i] = await self._has_id(i)
        core = {i: found[i] for i, k in self.APPROVAL_IDS if k == "core"}
        legacy = {i: found[i] for i, k in self.APPROVAL_IDS if k == "legacy"}
        auto = found.get("approvalApproveAuto")
        mark("approval.presence-core", "PASS" if all(core.values()) else "FAIL",
             f"contract ids present: " + ", ".join(f"{i}={v}" for i, v in core.items()))
        mark("approval.presence-legacy", "PASS" if legacy else "INFO-absent",
             f"legacy ids: {legacy} (expected gone once the new wiring lands)")
        mark("approval.presence-autoAdd", "PASS" if auto else "PENDING",
             f"#approvalApproveAuto {'present' if auto else 'absent — owner addition not landed yet'}")

        # the worker tap (background listens to APPROVAL_RESPONSE; the popup
        # cannot observe its own sendMessage)
        if not await self._worker_cdp():
            mark("approval.worker-tap", "BLOCKED",
                 "background service-worker target never appeared on the debug port")
        else:
            mark("approval.worker-tap", "PASS", "listener injected on service worker")

        live_ids = [i for i in ("approvalApprove", "approvalReject", "approvalNeutral") if found[i]]
        if not live_ids:
            mark("approval.cases", "PENDING",
                 "no decision buttons in this build — cases not exercisable")
            return

        input_present = found.get("approvalInput", False)
        # decision names per the shared contract in popup.js:
        #   approve -> 'allow' · reject -> 'deny' · neutral -> 'neutral'
        cases = [
            ("approval.empty-approve", "approvalApprove", {"decision": "allow", "text": None}),
            ("approval.empty-reject", "approvalReject", {"decision": "deny", "text": None}),
            ("approval.text-approve", "approvalApprove", {"decision": "allow", "text": "pls do it gently"}),
        ]
        if found.get("approvalNeutral"):
            # Neutral-with-text is exercised after the empty-neutral case below.
            pass

        for name, btn, want in cases:
            req_id = "lh5_" + name.split(".")[1]
            await self._pump_req(req_id, f"Simulated {name.split('.')[1]} case")
            await asyncio.sleep(0.6)
            await self._drain_leftover(req_id)
            await asyncio.sleep(0.3)
            state0 = self._parse(await self._card_state())
            if not state0.get("visible"):
                mark(name, "FAIL",
                     f"card never became visible after REQ_APPROVAL (state={state0})")
                await self._drain_leftover("__none__")
                continue
            await self.d.shot(f"{self.d.label}-approval-card-{name.split('.')[1]}.png", 420, 1580)
            if want["text"] is not None and input_present:
                await self._input_focus_via_cdp("#approvalInput")
                await self._insert_text(want["text"])
                filled = self._parse(await self._card_state()).get("input")
                if filled != want["text"]:
                    mark(name, "FAIL", f"typed note did not land in input: {filled!r}")
                    continue
            await self._press(f"#{btn}", "Enter")
            deadline = time.time() + 6
            entry, resolved, status_seen = None, None, ""
            while time.time() < deadline:
                entry = await self._worker_entries(req_id)
                resolved = await self._req_result()
                st = self._parse(await self._card_state())
                status_seen = st.get("statusText") or st.get("statusline")
                if entry and resolved:
                    break
                await asyncio.sleep(0.4)
            state1 = self._parse(await self._card_state())
            want_msg = want["text"]
            ok = (resolved and resolved.get("approved") is (want["decision"] == "allow")
                  and entry and entry[0]["decision"] == want["decision"]
                  and (want_msg is None or entry[0].get("message") == want_msg)
                  and state1.get("display") == "none")
            detail = (f"expect={want['decision']}"
                      + (f"/note={want_msg!r}" if want_msg else "")
                      + f" resolve={resolved} tap={entry[:2]} "
                      f"cardHidden={state1.get('display') == 'none'} "
                      f"status={status_seen[:80] or '(empty)'}")
            if ok:
                mark(name, "PASS", detail)
            else:
                mark(name, "FAIL", detail)
            await self.d.shot(f"{self.d.label}-approval-after-{name.split('.')[1]}.png", 420, 1580)

        # Neutral with EMPTY input must be BLOCKED (no request out, input
        # focused/flagged, card stays); Neutral with text must send.
        if not found.get("approvalNeutral"):
            mark("approval.empty-neutral-blocked", "PENDING",
                 "#approvalNeutral absent — blocked-empty semantics not exercised")
            mark("approval.neutral-with-text", "PENDING",
                 "#approvalNeutral absent — note-with-decision not exercised")
            return
        req_n = "lh5_neutral"
        await self._pump_req(req_n, "Simulated neutral case")
        await asyncio.sleep(0.6)
        await self._drain_leftover(req_n)
        await asyncio.sleep(0.8)
        st0 = self._parse(await self._card_state())
        if not st0.get("visible"):
            mark("approval.empty-neutral-blocked", "FAIL", "card not visible; cannot click")
            await self._drain_leftover("__none__")
            return
        await self._press("#approvalNeutral", "Enter")
        await asyncio.sleep(2.2)
        st1 = self._parse(await self._card_state())
        entry_empty = await self._worker_entries(req_n)
        flagged = st1.get("activeIsInput") or st1.get("inputAriaInvalid") == "true" \
            or bool(st1.get("inputClass") and re.search(r"invalid|error|warn", st1.get("inputClass", ""), re.I))
        not_sent = not entry_empty
        still_pending = not await self._req_result()
        if not_sent and flagged and still_pending and st1.get("visible"):
            mark("approval.empty-neutral-blocked", "PASS",
                 f"no request sent; input flagged (active={st1.get('activeIsInput')} "
                 f"aria-invalid={st1.get('inputAriaInvalid')} class={st1.get('inputClass')!r}); card still visible")
        else:
            mark("approval.empty-neutral-blocked", "FAIL",
                 f"blocked semantics not met: requestSent={bool(entry_empty)} "
                 f"inputFlagged={flagged} stillPending={still_pending} "
                 f"cardVisible={st1.get('visible')}")
        await self.d.shot(f"{self.d.label}-approval-neutral-blocked.png", 420, 1580)
        if not input_present:
            mark("approval.neutral-with-text", "PENDING",
                 "#approvalInput absent — cannot type a note")
            return
        await self._input_focus_via_cdp("#approvalInput")
        await self._insert_text("please wait on that")
        await self._press("#approvalNeutral", "Enter")
        deadline = time.time() + 6
        entry2, resolved2, status2 = None, None, ""
        while time.time() < deadline:
            entry2 = await self._worker_entries(req_n)
            resolved2 = await self._req_result()
            st2 = self._parse(await self._card_state())
            status2 = st2.get("statusText") or st2.get("statusline")
            if entry2 and resolved2:
                break
            await asyncio.sleep(0.4)
        st3 = self._parse(await self._card_state())
        if entry2 and entry2[0].get("message") == "please wait on that" \
                and resolved2 and st3.get("display") == "none":
            mark("approval.neutral-with-text", "PASS",
                 f"decision={entry2[0]['decision']} note={entry2[0]['message']!r} "
                 f"resolve={resolved2} status={status2[:80] or '(empty)'}")
        else:
            mark("approval.neutral-with-text", "FAIL",
                 f"tap={entry2[:2]} resolve={resolved2} cardHidden={st3.get('display') == 'none'} "
                 f"status={status2[:80] or '(empty)'}")
        await self.d.shot(f"{self.d.label}-approval-after-neutral.png", 420, 1580)

        # auto-add (4th button): {decision:'allow', autoAdd:true}, empty text OK.
        if not found.get("approvalApproveAuto"):
            mark("approval.autoAdd-empty-approve", "PENDING",
                 "#approvalApproveAuto absent — not exercised; server-side auto-add "
                 "round-trip needs the /api/extension/agent_chat scratch server "
                 "(no autoAdd route in server/ yet) — deferred to integration")
            return
        req_a = "lh5_auto"
        await self._pump_req(req_a, "Simulated auto-add case")
        await asyncio.sleep(0.6)
        await self._drain_leftover(req_a)
        await asyncio.sleep(0.8)
        await self._press("#approvalApproveAuto", "Enter")
        deadline = time.time() + 6
        entry3, resolved3 = None, None
        while time.time() < deadline:
            entry3 = await self._worker_entries(req_a)
            resolved3 = await self._req_result()
            if entry3 and resolved3:
                break
            await asyncio.sleep(0.4)
        if entry3 and entry3[0].get("autoAdd") is True and entry3[0].get("decision") == "allow":
            mark("approval.autoAdd-empty-approve", "PASS",
                 f"tap={entry3[:1]} resolve={resolved3}")
        else:
            mark("approval.autoAdd-empty-approve", "FAIL",
                 f"tap={entry3[:2]} resolve={resolved3}")

        # drain: answer any leftovers through the real protocol, hide the card
        await self._drain_leftover("__none__")

    # -- drive ---------------------------------------------------------------
    # Popup over a chrome://newtab active tab: attach fails by design. The
    # harness accepts EITHER the in-extension auto-switch (clicks land without
    # our help) OR the RETRY bar (bar visible, press it after focusing the
    # http target, clicks land). Both are proven by the server-side counter,
    # never by DOM text alone.
    # A click-only burst left the TYPE path completely unexercised, which is how
    # "typing closes the extension" survived a green harness run. Click the
    # button (counter evidence), then click the input to focus it, then type.
    DRIVE_TEXT = "LH5_TYPE_OK"
    DRIVE_ACTION = ("[{op:'click', x:100, y:70},"
                    " {op:'click', x:150, y:190},"
                    f" {{op:'type', text:'{DRIVE_TEXT}'}}]")

    async def check_drive(self):
        d = self.d
        mark = self.mark
        await self.popup_ready()
        srv = DriveServer()
        port = srv.start()
        drive_url = f"http://127.0.0.1:{port}/drive.html"
        try:
            tab = await self.cdp.js(
                "chrome.tabs.create({url: %s})"
                ".then(t => JSON.stringify({id: t.id, winId: t.windowId}))"
                ".catch(e => JSON.stringify({id: null, err: String(e.message || e)}))"
                % json.dumps(drive_url))
            tab = json.loads(tab)
            drive_id = tab.get("id")
            mark("drive.target-tab", "PASS" if drive_id else "FAIL",
                 f"drive tab created: {tab}")
            if not await srv.wait_ready():
                mark("drive.target-page", "FAIL", "drive.html never reached /ready")
                return
            mark("drive.target-page", "PASS", f"drive.html loaded at {drive_url} (clicks={srv.clicks()})")

            nt = json.loads(await self.cdp.js(
                "(async () => { try {"
                "  const t = await chrome.tabs.create({url: 'chrome://newtab'});"
                "  return JSON.stringify({id: t.id, url: t.url || '', err: null});"
                "} catch (e) { return JSON.stringify({id: null, err: String(e.message || e)}); } })()"))
            if nt.get("err"):
                # extension path refused — fall back to browser-level Target.createTarget
                mark("drive.undriveable-tab", "NOTE",
                     f"chrome.tabs.create('chrome://newtab') refused: {nt['err']} — using "
                     f"browser-level Target.createTarget")
                bt = None
                try:
                    ver = _http_get_json(f"http://127.0.0.1:{self.port}/json/version")
                    bc = Cdp(ver["webSocketDebuggerUrl"], skip_enable=True)
                    await bc.start()
                    res = await bc.send("Target.createTarget", {"url": "chrome://newtab"})
                    tid = res.get("targetId")
                    await bc.send("Target.activateTarget", {"targetId": tid}) if tid else None
                    await bc.close()
                    bt = tid
                except Exception as exc:
                    mark("drive.undriveable-tab", "BLOCKED",
                         f"browser-level fallback failed too: {exc}")
                    return
                nt_id_found = self._find(lambda p: p.get("type") == "page"
                                         and (p.get("url") or "").startswith("chrome://newtab"))
                if nt_id_found:
                    nt_id = nt_id_found.get("id")
                    mark("drive.undriveable-tab", "PASS",
                         f"newtab tab via browser-level create (#{bt} -> {nt_id})")
                else:
                    mark("drive.undriveable-tab", "BLOCKED",
                         f"browser-level chrome://newtab target never appeared (tid={bt})")
                    return
            else:
                nt_id = nt["id"]
                mark("drive.undriveable-tab", "PASS",
                     f"newtab tab #{nt_id} created")
            mark("drive.undriveable-tab", "PASS",
                 f"newtab tab #{nt_id} created")
            await self.cdp.js(f"chrome.tabs.update({nt_id}, {{active: true}})")
            await asyncio.sleep(0.8)
            active = json.loads(await self.cdp.js(
                "chrome.tabs.query({active: true, currentWindow: true})"
                ".then(ts => JSON.stringify(ts.map(t => ({id: t.id, url: t.url, active: t.active}))))"))
            active = [t for t in active if t.get("active")] or active
            active = active[0] if active else None
            ok_active = active and str(active.get("url", "")).startswith("chrome://")
            mark("drive.undriveable-active", "PASS" if ok_active else "FAIL",
                 f"active tab = {active}")
            baseline = srv.clicks()

            await self.cdp.js(
                "(() => { window.__lh5driveDone = false; window.__lh5driveResult = null;"
                " window.__lh5cdplog = [];"
                " window.addEventListener('unhandledrejection', (ev) => {"
                "   window.__lh5cdplog.push('REJECT|' + String(ev.reason && ev.reason.message || ev.reason)); });"
                " const __ocdp = window.cdp;"
                " window.cdp = async (tabId, method, params) => {"
                "   window.__lh5cdplog.push('SENT|' + method + '|' + JSON.stringify(params || {}) + '|t' + Math.round(performance.now()));"
                "   try {"
                "     const __r = await __ocdp(tabId, method, params);"
                "     window.__lh5cdplog.push('OK|' + method + '|t' + Math.round(performance.now()));"
                "     return __r;"
                "   } catch (e) {"
                "     window.__lh5cdplog.push('ERR|' + method + '|' + String(e && e.message || e));"
                "     throw e; } };"
                f" executeReturnedActions({self.DRIVE_ACTION}).then(() => {{"
                "   window.__lh5driveDone = true; window.__lh5driveResult = 'ok'; })"
                " .catch((e) => { window.__lh5driveDone = true;"
                "   window.__lh5driveResult = 'err:' + String(e); });"
                " return true; })()")
            deadline = time.time() + 45
            while time.time() < deadline:
                if await self.cdp.js("window.__lh5driveDone"):
                    break
                await asyncio.sleep(0.5)
            await asyncio.sleep(1.5)
            drv = self._parse(await self.cdp.js(
                "JSON.stringify({res: window.__lh5driveResult,"
                " log: (window.__lh5cdplog || []).slice(-16),"
                " paused: String(isAgentActionPaused), retry: String(retryPending),"
                " running: String(isAgentActionRunning), activeBar: (() => {"
                "   const b = document.getElementById('agentActiveBar');"
                "   return !!(b && b.style.display && b.style.display !== 'none'); })(),"
                " desc: (() => { const d = document.getElementById('agentActiveDesc');"
                "   return d ? (d.innerText || d.textContent) : ''; })(),"
                " statusTxt: (() => { const s = document.getElementById('statusText')"
                "   || document.getElementById('status');"
                "   return s ? (s.innerText || s.textContent) : ''; })()})"))
            landed = srv.clicks() > baseline
            bar = self._parse(await self.cdp.js(
                "(() => { const b = document.getElementById('agentActiveBar');"
                " const t = document.getElementById('btnPauseAgentText');"
                " return JSON.stringify({visible: !!(b && b.style.display && b.style.display !== 'none'),"
                "  text: t ? (t.innerText || t.textContent) : null }); })()"))
            status = self._parse(await self.cdp.js(
                "(() => { const s = document.getElementById('statusText') || document.getElementById('status');"
                " return JSON.stringify({text: s ? s.innerText : ''}); })()"))
            if landed:
                mark("drive.auto-switch-or-retry", "PASS",
                     f"click landed WITHOUT harness-switch (clicks {baseline}->{srv.clicks()}); "
                     f"bar={bar} status={status.get('text', '')[:60]}")
            elif bar.get("visible") and "RETRY" in str(bar.get("text", "")).upper():
                await self.d.shot(f"{self.d.label}-drive-retry-bar.png", 420, 1580)
                mark("drive.auto-switch-or-retry", "PASS",
                     f"RETRY bar shown ({bar}) — switching active tab to the http target and pressing RETRY")
                await self.cdp.js(f"chrome.tabs.update({drive_id}, {{active: true}})")
                await asyncio.sleep(0.8)
                await self._press("#btnPauseAgentAction", "Enter")
                deadline = time.time() + 25
                while time.time() < deadline:
                    if srv.clicks() > baseline:
                        break
                    await asyncio.sleep(0.5)
                status2 = self._parse(await self.cdp.js(
                    "(() => { const s = document.getElementById('statusText') || document.getElementById('status');"
                    " return JSON.stringify({text: s ? s.innerText : ''}); })()"))
                landed2 = srv.clicks() > baseline
                mark("drive.retry-click-landed", "PASS" if landed2 else "FAIL",
                     f"after RETRY clicks={srv.clicks()} (need > {baseline}); "
                     f"status={status2.get('text', '')[:80]}")
            else:
                mark("drive.auto-switch-or-retry", "FAIL",
                     f"no landed click and no RETRY bar: clicks={srv.clicks()} bar={bar} "
                     f"status={status.get('text', '')[:80]} drv={drv}")

            # Typing evidence, reported by the target page itself. Only meaningful
            # once a click landed: if the burst never reached the page at all the
            # click assertion above has already failed and this would just echo it.
            if srv.clicks() > baseline:
                deadline = time.time() + 15
                while time.time() < deadline and srv.typed() != self.DRIVE_TEXT:
                    await asyncio.sleep(0.5)
                got = srv.typed()
                mark("drive.type-landed", "PASS" if got == self.DRIVE_TEXT else "FAIL",
                     f"input received {got!r} (expected {self.DRIVE_TEXT!r})")

            # post-detach evidence: the drive tab is debugger-free once the burst
            # finished — a page session can now read the real counter + shot.
            target = self._find(lambda p: p.get("type") == "page"
                                and "/drive.html" in (p.get("url") or ""))
            if target:
                try:
                    c2 = Cdp(target["webSocketDebuggerUrl"])
                    await c2.start()
                    cnt = await c2.js("window.__lh5c")
                    await c2.send("Emulation.setDeviceMetricsOverride",
                                  {"width": 800, "height": 600, "deviceScaleFactor": 1, "mobile": False})
                    await asyncio.sleep(0.3)
                    path = os.path.join(d.outdir, f"{d.label}-drive-target.png")
                    res = await c2.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True},
                                        timeout=60)
                    with open(path, "wb") as f:
                        f.write(base64.b64decode(res["data"]))
                    d.files.append(f"{d.label}-drive-target.png")
                    mark("drive.click-evidence", "PASS" if cnt and cnt >= 1 else "FAIL",
                         f"page-side click counter = {cnt}; server counter = {srv.clicks()}")
                    await c2.close()
                except Exception as exc:
                    mark("drive.click-evidence", "PASS" if landed else "FAIL",
                         f"server counter = {srv.clicks()} (page CDP read failed post-burst: {exc})")
            else:
                mark("drive.click-evidence", "PASS" if landed else "FAIL",
                     f"server counter = {srv.clicks()} (drive tab target vanished)")
            await self.cdp.js(f"chrome.tabs.remove([{nt_id}, {drive_id}]).catch(() => {{}})")
        finally:
            srv.stop()

    # -- keep-open -----------------------------------------------------------
    async def check_keepopen(self):
        d = self.d
        mark = self.mark
        await self.popup_ready()
        # the popup tab closes itself on keep-open; give W1 a spare tab so the
        # window survives and we can still focus it later
        spare = json.loads(await self.cdp.js(
            "chrome.tabs.create({url: 'about:blank'}).then(t => JSON.stringify({winId: t.windowId, tabId: t.id}))"))
        mark("keepopen.spare-tab", "PASS", f"spare tab #{spare.get('tabId')} in window {spare.get('winId')}")
        try:
            await self._press("#btnPopOut", "Enter")
        except Exception as exc:
            # windows.create(...).then(window.close()) tears the popup tab down
            # as soon as the new window is up; a mid-dispatch socket close is
            # EXPECTED here, the window itself is what we verify next.
            self.d.log(f"  [keepopen] press teardown race tolerated: {exc}")
        # ⧉ Keep open has TWO valid outcomes and the side panel is the preferred
        # one: popup.js tries chrome.sidePanel.open() first and only falls back to
        # chrome.windows.create when the API is missing. Both are persistent
        # surfaces — that is the product contract BUG 1 is about — so accept
        # either and branch on which one landed.
        target = None
        marker_url = None
        deadline = time.time() + 25
        while time.time() < deadline and not target:
            for marker in ("mode=panel", "mode=window"):
                target = self._find(lambda p: p.get("type") == "page"
                                    and marker in (p.get("url") or ""))
                if target:
                    marker_url = marker
                    break
            if not target:
                await asyncio.sleep(0.5)
        if not target:
            mark("keepopen.persistent-surface", "FAIL",
                 "neither popup.html?mode=panel nor ?mode=window appeared within 25s "
                 "(sidePanel.open and windows.create both failed)")
            return
        kind = "side panel" if marker_url == "mode=panel" else "popup window"
        mark("keepopen.persistent-surface", "PASS",
             f"{kind}: {target.get('url', '')[:90]}")
        if marker_url == "mode=panel":
            # The panel is not a window, so the windows.getAll assertions below do
            # not apply to it. Its survive-the-drive proof lives in
            # scripts/probe_drive_surfaces.py case C, which drives it end to end.
            mark("keepopen.second-window", "NOTE",
                 "side panel taken (preferred); windows.create fallback not exercised")
            return
        mark("keepopen.second-window", "PASS", f"target found: {target.get('url', '')[:90]}")
        c2 = Cdp(target["webSocketDebuggerUrl"])
        await c2.start()
        try:
            live = await c2.js(
                "!!(window.location.href.indexOf('mode=window') >= 0"
                " && window.chrome && chrome.runtime && chrome.runtime.getManifest)")
            # popup.js runs at the END of body; window-mode class lands only
            # after the script executes. Poll for it instead of sampling the
            # still-loading document (observed at readyState 'loading/completing').
            body_ok = False
            for _attempt in range(12):
                body_ok = bool(await c2.js(
                    "document.body.classList.contains('window-mode')"))
                if body_ok:
                    break
                await asyncio.sleep(0.4)
            popo_hidden = await c2.js(
                "(() => { const b = document.getElementById('btnPopOut');"
                " return !!(b && b.style.display === 'none'); })()")
            dbg = await c2.js(
                "JSON.stringify({href: window.location.href, search: window.location.search,"
                " ready: document.readyState,"
                " bodyCls: document.body ? document.body.className : null,"
                " popupJsLoaded: (typeof executeReturnedActions !== 'undefined'),"
                " urlParamsMode: (() => { try { return new URLSearchParams(window.location.search)"
                "   .get('mode'); } catch (e) { return 'ERR:' + e; } })()})")
            wins = json.loads(await c2.js(
                "chrome.windows.getAll({populate: true}).then(w => JSON.stringify(w))"))
            selfwin = None
            for w in wins:
                if any(marker_url in (t.get("url") or "") for t in (w.get("tabs") or [])):
                    selfwin = w
            mark("keepopen.mode-window", "PASS" if live and body_ok else "FAIL",
                 f"live={live} body.window-mode={body_ok} url={target.get('url', '')[:90]} dbg={dbg}")
            mark("keepopen.popout-hidden", "PASS" if popo_hidden else "FAIL",
                 f"btnPopOut hidden={popo_hidden} (window-mode hides the affordance)")
            if selfwin:
                mark("keepopen.window-type", "PASS" if selfwin.get("type") == "popup" else "NOTE",
                     f"windows.getAll: type={selfwin.get('type')} id={selfwin.get('id')}")
            await c2.send("Emulation.setDeviceMetricsOverride",
                          {"width": 420, "height": 660, "deviceScaleFactor": 1, "mobile": False})
            await asyncio.sleep(0.3)
            res = await c2.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True}, timeout=60)
            with open(os.path.join(d.outdir, f"{d.label}-keepopen-window.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            d.files.append(f"{d.label}-keepopen-window.png")

            # keep it listed after focusing another window (best effort headless)
            mj = json.dumps(marker_url)
            focus_res = json.loads(await c2.js(
                "(async () => { try {"
                "  const wins = await chrome.windows.getAll({populate: true});"
                f"  const me = wins.find((w) => w.tabs && w.tabs.some((t) => (t.url || '').indexOf({mj}) >= 0));"
                "  if (!me) return JSON.stringify({error: 'window with mode=window vanished'});"
                "  const other = wins.find((w) => w.id !== me.id);"
                "  let f = 'no-other-window';"
                "  if (other) { try { await chrome.windows.update(other.id, {focused: true}); f = 'ok'; }"
                "              catch (e) { f = 'err:' + String(e.message || e); } }"
                "  await new Promise((r) => setTimeout(r, 800));"
                "  const after = await chrome.windows.getAll();"
                "  return JSON.stringify({stillThere: !!after.find((w) => w.id === me.id), focus: f});"
                "} catch (e) { return JSON.stringify({error: String(e.message || e)}); } })()"))
            if not focus_res.get("error") and focus_res.get("stillThere"):
                mark("keepopen.listed-after-focus", "PASS",
                     f"still listed after focusing another window (focus result: {focus_res.get('focus')}; "
                     f"headless focus may be cosmetic)")
            else:
                mark("keepopen.listed-after-focus", "PENDING" if focus_res.get("error") else "FAIL",
                     f"focus/relist result: {focus_res}")
        finally:
            await c2.close()


# --------------------------------------------------------------------------
# main


async def amain(args):
    global _WS_NS
    _WS_NS = _ensure_websockets()

    ext_dir = args.extension
    if not os.path.isfile(os.path.join(ext_dir, "manifest.json")):
        sys.exit(f"no manifest.json at {ext_dir}")
    os.makedirs(args.outdir, exist_ok=True)

    browser = find_browser(args.browser)
    if not browser:
        sys.exit("no chromium binary found (tried playwright cache, chromium, google-chrome)")

    profile = args.profile or tempfile.mkdtemp(prefix="helpotron-ext-verify-", dir="/tmp")
    port = _free_port()

    cmd = [
        browser,
        "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--disable-popup-blocking",
        f"--remote-debugging-port={port}", "--remote-allow-origins=*",
        f"--user-data-dir={profile}",
        # NOTE: --load-extension only.  Adding --disable-extensions-except made
        # this Chromium build register TWO copies of the folder (two different
        # ids) and one of them refused to serve its pages (ERR_BLOCKED_BY_CLIENT).
        f"--load-extension={ext_dir}",
        # A background tab is a hidden page: Chrome clamps its chained setTimeout
        # to ~1/s and backgrounds its renderer. The drive path animates a virtual
        # cursor with chained timers, so without these the background-tab checks
        # measure Chrome's throttling, not the extension. Matches the flags used
        # by scripts/probe_drive_surfaces.py.
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "about:blank",
    ]
    print(f"[launch] {browser}")
    print(f"[profile] {profile} (fresh temp profile)")
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # The unpacked id is the sha256 of the absolute extension path; trust it and
    # only fall back to scanning /json/list (some builds register a second
    # unrelated worker named background.js, e.g. a component extension, whose
    # id sorts first — never pick it).
    ext_id = extension_id_from_path(ext_dir)
    seen_ids = set()

    def discover_ids():
        try:
            pages_all = _http_get_json(f"http://127.0.0.1:{port}/json/list")
        except Exception:
            return set()
        found = set()
        for p in pages_all:
            m = re.match(r"chrome-extension://([a-p]{32})/background\.js", p.get("url", ""))
            if m:
                found.add(m.group(1))
        seen_ids.update(found)
        return found

    async def wait_for(expected_id, seconds=20):
        deadline = time.time() + seconds
        while time.time() < deadline:
            if expected_id in discover_ids():
                return True
            await asyncio.sleep(0.5)
        return False

    ws_url = None
    deadline = time.time() + 15
    while time.time() < deadline and not ws_url:
        try:
            pages = _http_get_json(f"http://127.0.0.1:{port}/json/list")
        except Exception:
            pages = []
        for p in pages:
            if p.get("type") == "page":
                ws_url = p.get("webSocketDebuggerUrl")
        if not ws_url:
            await asyncio.sleep(0.4)
    if not ws_url:
        proc.terminate()
        sys.exit("CDP: no page target appeared on the debug port.")

    cdp = Cdp(ws_url)
    await cdp.start()
    popup_url = f"chrome-extension://{ext_id}"
    print(f"[extension] id={ext_id}  surface-root={popup_url}/")

    label = args.label
    log_lines = []
    def log(msg, end="\n"):
        print(msg, end=end)
        log_lines.append(msg)

    driver = Driver(cdp, ext_id, label, args.outdir, log)
    try:
        # manifest + invariants (with id fallback if this build ignores the
        # path-hash scheme and picks a per-profile id instead)
        await asyncio.sleep(1.0)  # let the unpacked extension registration settle
        try:
            await cdp.navigate(f"{popup_url}/popup.html", expect_ext=True)
        except RuntimeError:
            await wait_for(ext_id, seconds=20)
            if seen_ids:
                alt = sorted(seen_ids)[0]
                print(f"[note] id {ext_id} unreachable on this build; trying {alt}")
                ext_id = alt
                popup_url = f"chrome-extension://{ext_id}"
                await cdp.navigate(f"{popup_url}/popup.html", expect_ext=True)
            else:
                proc.terminate()
                sys.exit(
                    "EXTENSION DID NOT LOAD. No chrome-extension:// service-worker "
                    "target appeared. The branded google-chrome build ignores "
                    "--load-extension by design (Chrome 137+); point --browser at a "
                    "Chromium build (e.g. "
                    "~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome)."
                )
        await driver.read_manifest()
        m = driver.manifest or {}
        ver = m.get("version")
        name = m.get("name")
        perms = m.get("permissions") or []
        log(f"[manifest] {name} v{ver}")
        # Compare the LOADED build against extension/manifest.json rather than a
        # hardcoded string. A hardcoded "2.6.1" both goes stale on every release
        # and misses BUG 0 (2026-09-07): the build forked into a second directory
        # and Chrome kept loading the old one, so source and loaded build drifted
        # apart while this invariant stayed green.
        try:
            with open(os.path.join(_DEFAULT_EXT, "manifest.json")) as _f:
                src_ver = json.load(_f).get("version")
        except Exception as _exc:
            src_ver = f"UNREADABLE:{_exc}"
        inv = [
            ("name correct", name == "Helpotron Academic Companion"),
            (f"version matches extension/manifest.json ({src_ver})", ver == src_ver),
            ("service_worker present", bool(m.get("background", {}).get("service_worker"))),
            ("debugger required", "debugger" in perms),
            ("downloads absent", "downloads" not in perms),
            ("tabs permission", "tabs" in perms),
        ]
        for what, ok in inv:
            log(f"  [invariant] {what}: {'OK' if ok else 'FAIL'}")

        surfaces = ([] if args.features_only else
                    (args.surfaces or ["launch", "chat", "type", "settings",
                                       "options", "onboarding", "agent"]))
        failed_surfaces = []
        for surface in surfaces:
            log(f"[surface] {surface}")
            try:
                await driver.run_surface(surface, popup_url)
                if not args.no_toggles:
                    await driver.do_toggles(surface, popup_url)
            except Exception as exc:
                log(f"  [ERROR] {surface}: {exc}")
                failed_surfaces.append((surface, str(exc)))
                await asyncio.sleep(1.0)

        # ---- Lane 5 feature phase (final2 label): approval / drive / keep-open
        feature_results = []
        if args.features:
            runner = FeatureRunner(driver, port, popup_url)
            for feat in args.features:
                log(f"[feature] {feat}")
                try:
                    await {"approval": runner.check_approval,
                           "drive": runner.check_drive,
                           "keepopen": runner.check_keepopen}[feat]()
                except Exception as exc:
                    runner.mark(f"{feat}.run", "ERROR",
                                str(exc)[:200] + " | " + traceback.format_exc()[-700:])
                    await asyncio.sleep(1.0)
            feature_results = runner.results

        # tidy summary
        print()
        log(f"[sync checks] page console errors: {len(cdp.console)}")
        if cdp.console and args.verbose:
            for c in cdp.console[:20]:
                log(f"    {c}")
        if failed_surfaces:
            log(f"[failures] {len(failed_surfaces)} of {len(surfaces)} surfaces errored:")
            for s, err in failed_surfaces:
                log(f"    {s}: {err}")
        log("=== toggle results ===")
        for name, status, detail in driver.toggle_results:
            log(f"  {name}: {status} {detail}")
        log("=== feature check results ===")
        for r in feature_results:
            log(f"  [{r['status']:8s}] {r['check']}: {r['detail'][:240]}")
        log(f"=== screenshots ({len(driver.files)}) ===")
        for f in driver.files:
            log(f"  {os.path.join(args.outdir, f)}")
        summary = os.path.join(args.outdir, f"{label}-summary.txt")
        with open(summary, "w") as fh:
            fh.write(f"label: {label}\n")
            fh.write(f"browser: {browser}\n")
            fh.write(f"extension: {ext_dir}\n")
            fh.write(f"profile: {profile} (temp)\n")
            fh.write(f"extension id: {ext_id}\n")
            fh.write(f"manifest: {json.dumps(m, indent=2)}\n\n")
            fh.write("\n".join(log_lines) + "\n")
        with open(os.path.join(args.outdir, f"{label}-check-results.json"), "w") as fh:
            json.dump({"label": label, "extension_id": ext_id,
                       "features": feature_results,
                       "surface_failures": [s for s, _ in failed_surfaces]},
                      fh, indent=2)
        print(f"[summary] {summary}")
        feature_fails = [r for r in feature_results
                         if r["status"] not in ("PASS", "NOTE", "INFO-absent")]
        total_fails = len(failed_surfaces) + len(feature_fails)
        return 1 if total_fails > args.max_failures else 0
    finally:
        await cdp.close()
        proc.terminate()
        try:
            proc.wait(timeout=6)
        except subprocess.TimeoutExpired:
            proc.kill()
        if args.keep_profile:
            print(f"[profile] kept: {profile}")
        else:
            shutil.rmtree(profile, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--label", default=None)
    ap.add_argument("--outdir", default=_DEFAULT_OUT)
    ap.add_argument("--extension", default=_DEFAULT_EXT)
    ap.add_argument("--browser", default="auto")
    ap.add_argument("--surfaces", default=None)
    ap.add_argument("--features-only", action="store_true",
                    help="skip the surface walk entirely and run only the feature "
                         "phase (approval/drive/keep-open)")
    ap.add_argument("--features", default=None,
                    help="comma list: approval,drive,keepopen (default: all three "
                         "when --label final2, else none)")
    ap.add_argument("--viewport", default="1280x1600")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--keep-profile", action="store_true")
    ap.add_argument("--no-toggles", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--max-failures", type=int, default=0,
                    help="exit 1 if more surfaces+feature-checks than this fail (default 0)")
    args = ap.parse_args()
    if args.label is None:
        args.label = "live-" + time.strftime("%Y%m%d-%H%M%S")
    if args.surfaces:
        args.surfaces = [s.strip() for s in args.surfaces.split(",") if s.strip()]
    if args.features:
        args.features = [s.strip() for s in args.features.split(",") if s.strip()]
    elif args.label == "final2":
        args.features = ["approval", "drive", "keepopen"]
    raise SystemExit(asyncio.run(amain(args)))


if __name__ == "__main__":
    main()
