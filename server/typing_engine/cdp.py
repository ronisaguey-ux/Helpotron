"""Minimal Chrome DevTools Protocol client.

Enough to attach to an extension's service worker or a page, evaluate an
expression, and await a promise. Deliberately small: one websocket, one reader
task, replies matched by request id, flattened sessions so a single socket can
drive many targets at once.

Requires a Chrome started with --remote-debugging-port (9222 here).
"""
import asyncio, json, urllib.request

import websockets

DEBUG_PORT = 9222


def http_json(path, port=DEBUG_PORT, timeout=8):
    url = f"http://127.0.0.1:{port}{path}"
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)


class Browser:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0
        self.pending = {}
        self.reader = None

    async def start(self):
        self.reader = asyncio.create_task(self._read_loop())

    async def _read_loop(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                mid = msg.get("id")
                if mid is not None and mid in self.pending:
                    fut = self.pending.pop(mid)
                    if not fut.done():
                        fut.set_result(msg)
        except Exception:
            for fut in list(self.pending.values()):
                if not fut.done():
                    fut.set_exception(RuntimeError("cdp socket closed"))
            self.pending.clear()

    async def call(self, method, params=None, timeout=120):
        self.n += 1
        mid = self.n
        fut = asyncio.get_event_loop().create_future()
        self.pending[mid] = fut
        await self.ws.send(json.dumps({"id": mid, "method": method,
                                       "params": params or {}}))
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self.pending.pop(mid, None)

    async def new_tab(self, url):
        r = await self.call("Target.createTarget", {"url": url})
        return r["result"]["targetId"]

    async def close_tab(self, tid):
        await self.call("Target.closeTarget", {"targetId": tid})

    async def ws_for(self, tid):
        r = await self.call("Target.attachToTarget", {"targetId": tid, "flatten": True})
        return r["result"]["sessionId"]


class Tab:
    """A flattened session on one target."""

    def __init__(self, br, sid):
        self.br = br
        self.sid = sid

    async def call(self, method, params=None, timeout=180):
        self.br.n += 1
        mid = self.br.n
        fut = asyncio.get_event_loop().create_future()
        self.br.pending[mid] = fut
        await self.br.ws.send(json.dumps({"id": mid, "method": method,
                                          "params": params or {},
                                          "sessionId": self.sid}))
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self.br.pending.pop(mid, None)

    # `js` is the name the changelog decoder uses; keep both so either reads
    # naturally. Awaiting a non-promise is harmless in CDP.
    async def js(self, expr, await_promise=False, timeout=180):
        return await self.evaluate(expr, await_promise=await_promise, timeout=timeout)

    async def evaluate(self, expr, await_promise=True, timeout=180):
        """Run an expression. Returns the value, or raises with the real exception."""
        r = await self.call("Runtime.evaluate", {
            "expression": expr, "awaitPromise": await_promise,
            "returnByValue": True}, timeout=timeout)
        res = r.get("result", {})
        if res.get("exceptionDetails"):
            raise RuntimeError(str(res["exceptionDetails"])[:400])
        return res.get("result", {}).get("value")


async def connect(port=DEBUG_PORT):
    ver = http_json("/json/version", port)
    ws = await websockets.connect(ver["webSocketDebuggerUrl"],
                                  max_size=64 * 1024 * 1024)
    br = Browser(ws)
    await br.start()
    return br


def find_target(kind=None, url_contains=None, port=DEBUG_PORT):
    for t in http_json("/json/list", port):
        if kind and t.get("type") != kind:
            continue
        if url_contains and url_contains not in (t.get("url") or ""):
            continue
        return t
    return None
