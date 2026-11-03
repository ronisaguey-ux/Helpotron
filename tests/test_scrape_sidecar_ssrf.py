"""V5-A3-01: in-page subrequest SSRF guard for the scrape sidecar.

Pure-function tests plus fakes for the scrapling/playwright/curl_cffi
surfaces (none of which are installed in the API venv), so they run
offline without DNS for the literal-IP cases.
"""
import re
import sys
import types

import pytest

import scrape_sidecar.app as app

INTERNAL = [
    "http://127.0.0.1/",
    "http://127.0.0.1:8000/api/admin",
    "http://10.0.0.5/",
    "http://172.16.3.4/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fd12:3456::1]/",
    "http://[fe80::1]/",
    "http://0.0.0.0/",
    "http://[::ffff:127.0.0.1]/",
    "ws://127.0.0.1:9778/",
    "wss://10.1.2.3/socket",
    "http://localhost/",
]


@pytest.mark.parametrize("url", INTERNAL)
def test_internal_subrequests_refused(url):
    assert app._subrequest_allowed(url) is False


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://8.8.8.8/", "chrome://settings", "gopher://1.1.1.1/"])
def test_unknown_schemes_refused(url):
    assert app._subrequest_allowed(url) is False


@pytest.mark.parametrize("url", ["data:image/png;base64,AAAA", "blob:https://example.com/uuid", "about:blank"])
def test_local_schemes_allowed(url):
    assert app._subrequest_allowed(url) is True


@pytest.mark.parametrize("url", ["http://8.8.8.8/", "https://1.1.1.1/x", "wss://8.8.4.4/ws"])
def test_public_literal_ip_allowed(url):
    assert app._subrequest_allowed(url) is True


def test_cache_reused(monkeypatch):
    calls = []

    import server.ssrf as ssrf
    monkeypatch.setattr(ssrf, "is_safe_url", lambda u: calls.append(u) or True)
    cache = {}
    assert app._subrequest_allowed("https://cdn.example.com/a.js", cache)
    assert app._subrequest_allowed("https://cdn.example.com/b.css", cache)
    assert len(calls) == 1


# ── Fakes for the browser hook ─────────────────────────────────────────────

class FakeRoute:
    def __init__(self, url):
        self.request = types.SimpleNamespace(url=url)
        self.outcome = None

    def fallback(self):
        self.outcome = "fallback"

    def abort(self):
        self.outcome = "abort"


class FakeWsRoute:
    def __init__(self, url):
        self.url = url
        self.outcome = None

    def connect_to_server(self):
        self.outcome = "connect"

    def close(self):
        self.outcome = "close"


class FakeContext:
    def __init__(self):
        self.routes = []

    def route(self, pattern, handler):
        self.routes.append((pattern, handler))


class FakePage:
    """Records handlers; `load(urls)` replays requests through them."""

    def __init__(self, ws_supported=True):
        self.context = FakeContext()
        self.http_handler = None
        self.ws_handler = None
        self.ws_supported = ws_supported

    def route(self, pattern, handler):
        self.http_handler = handler

    def route_web_socket(self, pattern, handler):
        if not self.ws_supported:
            raise AttributeError("route_web_socket")
        assert isinstance(pattern, re.Pattern)
        self.ws_handler = handler

    def load(self, urls):
        out = []
        for u in urls:
            if u.startswith(("ws://", "wss://")):
                r = FakeWsRoute(u)
                self.ws_handler(r)
            else:
                r = FakeRoute(u)
                self.http_handler(r, r.request)
            out.append(r.outcome)
        return out


def test_guard_blocks_internal_and_passes_public():
    state, setup = app._make_browser_guard()
    page = FakePage()
    setup(page)
    assert state["installed"] is True
    assert len(page.context.routes) == 1
    outcomes = page.load(["http://8.8.8.8/", "data:,x", "ws://8.8.4.4/"])
    assert outcomes == ["fallback", "fallback", "connect"]
    assert state["blocked"] is False
    outcomes = page.load(["http://169.254.169.254/latest/meta-data/", "ws://127.0.0.1:1/"])
    assert outcomes == ["abort", "close"]
    assert state["blocked"] is True


def test_guard_not_installed_when_setup_raises():
    state, setup = app._make_browser_guard()
    with pytest.raises(AttributeError):
        setup(FakePage(ws_supported=False))
    assert state["installed"] is False


# ── _fetch_scrapling browser lanes with a fake scrapling module ────────────

PAGE_HTML = "<html><body>" + ("<p>assignment text</p>" * 40) + "</body></html>"


def _install_fake_scrapling(monkeypatch, subrequests, swallow_setup_errors=True, ws_supported=True):
    class FakeResponse:
        status = 200
        url = "http://8.8.8.8/page"
        html = PAGE_HTML

        def markdown(self):
            return "assignment text " * 40

    class FakeBrowserFetcher:
        def fetch(self, url, timeout, page_setup=None, **kw):
            page = FakePage(ws_supported=ws_supported)
            try:
                page_setup(page)
            except Exception:
                if not swallow_setup_errors:
                    raise
                # scrapling 0.4.15 logs and continues without the hook
                return FakeResponse()
            page.load(subrequests)
            return FakeResponse()

    fetchers = types.ModuleType("scrapling.fetchers")
    fetchers.StealthyFetcher = FakeBrowserFetcher
    fetchers.DynamicFetcher = FakeBrowserFetcher
    pkg = types.ModuleType("scrapling")
    pkg.fetchers = fetchers
    monkeypatch.setitem(sys.modules, "scrapling", pkg)
    monkeypatch.setitem(sys.modules, "scrapling.fetchers", fetchers)


@pytest.mark.parametrize("mode", ["stealth", "dynamic"])
def test_browser_lane_refuses_page_with_internal_fetch(monkeypatch, mode):
    _install_fake_scrapling(monkeypatch, ["http://8.8.8.8/app.js", "http://127.0.0.1:8000/admin"])
    assert app._fetch_scrapling("http://8.8.8.8/page", mode) == ""


@pytest.mark.parametrize("mode", ["stealth", "dynamic"])
def test_browser_lane_refuses_internal_websocket(monkeypatch, mode):
    _install_fake_scrapling(monkeypatch, ["ws://10.0.0.1:6379/"])
    assert app._fetch_scrapling("http://8.8.8.8/page", mode) == ""


@pytest.mark.parametrize("mode", ["stealth", "dynamic"])
def test_browser_lane_fails_closed_when_hook_swallowed(monkeypatch, mode):
    _install_fake_scrapling(monkeypatch, [], ws_supported=False)
    assert app._fetch_scrapling("http://8.8.8.8/page", mode) == ""


@pytest.mark.parametrize("mode", ["stealth", "dynamic"])
def test_browser_lane_returns_public_page(monkeypatch, mode):
    _install_fake_scrapling(monkeypatch, ["https://1.1.1.1/style.css", "data:,x"])
    assert "assignment text" in app._fetch_scrapling("http://8.8.8.8/page", mode)


# ── Plain lane: pinned resolution ──────────────────────────────────────────

def _install_fake_curl(monkeypatch, primary_ip):
    seen = {}

    class CurlOpt:
        RESOLVE = "RESOLVE"

    class FakeCurlResp:
        status_code = 200

        def __init__(self):
            self.primary_ip = primary_ip

    class Session:
        def __init__(self, curl_options=None):
            seen["curl_options"] = curl_options

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, **kw):
            seen["url"] = url
            seen["kw"] = kw
            return FakeCurlResp()

    class ResponseFactory:
        @staticmethod
        def from_http_request(resp, args):
            return types.SimpleNamespace(status=resp.status_code, headers={}, url=seen["url"])

    curl_pkg = types.ModuleType("curl_cffi")
    curl_req = types.ModuleType("curl_cffi.requests")
    curl_req.Session = Session
    curl_const = types.ModuleType("curl_cffi.const")
    curl_const.CurlOpt = CurlOpt
    curl_pkg.requests = curl_req
    conv = types.ModuleType("scrapling.engines.toolbelt.convertor")
    conv.ResponseFactory = ResponseFactory
    for name, mod in {
        "curl_cffi": curl_pkg, "curl_cffi.requests": curl_req, "curl_cffi.const": curl_const,
        "scrapling": types.ModuleType("scrapling"),
        "scrapling.engines": types.ModuleType("scrapling.engines"),
        "scrapling.engines.toolbelt": types.ModuleType("scrapling.engines.toolbelt"),
        "scrapling.engines.toolbelt.convertor": conv,
    }.items():
        monkeypatch.setitem(sys.modules, name, mod)
    return seen


def test_pinned_get_forces_validated_ip(monkeypatch):
    import server.ssrf as ssrf
    monkeypatch.setattr(ssrf, "resolve_and_validate_host", lambda h, p: "93.184.216.34")
    seen = _install_fake_curl(monkeypatch, "93.184.216.34")
    page = app._pinned_curl_get("https://example.com/a")
    assert page.status == 200
    assert seen["curl_options"] == {"RESOLVE": ["example.com:443:93.184.216.34"]}
    assert seen["kw"]["allow_redirects"] is False


def test_pinned_get_brackets_ipv6(monkeypatch):
    import server.ssrf as ssrf
    monkeypatch.setattr(ssrf, "resolve_and_validate_host", lambda h, p: "2606:2800::1")
    seen = _install_fake_curl(monkeypatch, "2606:2800::1")
    app._pinned_curl_get("http://example.com:8080/")
    assert seen["curl_options"] == {"RESOLVE": ["example.com:8080:[2606:2800::1]"]}


def test_pinned_get_refuses_rebound_connection(monkeypatch):
    import server.ssrf as ssrf
    monkeypatch.setattr(ssrf, "resolve_and_validate_host", lambda h, p: "93.184.216.34")
    _install_fake_curl(monkeypatch, "127.0.0.1")
    with pytest.raises(ValueError):
        app._pinned_curl_get("https://example.com/a")


def test_pinned_get_refuses_unsafe_host(monkeypatch):
    def boom(h, p):
        raise ValueError("blocked")
    import server.ssrf as ssrf
    monkeypatch.setattr(ssrf, "resolve_and_validate_host", boom)
    _install_fake_curl(monkeypatch, "")
    with pytest.raises(ValueError):
        app._pinned_curl_get("http://internal.example/")
