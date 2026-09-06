#!/usr/bin/env python3
"""Helpotron scrape sidecar — fetch lanes + ScrapeGraphAI SmartScraperGraph.

Serves ONE job (feature #79, "Scrape from anywhere"): fetch the page the
user pasted and let SmartScraperGraph extract the assignment fields
{title, due_date, instructions, subject}, hand the result to the main
API's import-from-url route.

Fetch chain (first lane that yields readable content wins; every lane
reports `fetched_by` so the operator can see what happened):
  1. agentreach:youtube — yt-dlp on youtube.com/youtu.be (title,
     description, captions/subtitles as plain text).
  2. agentreach:rss      — feedparser on RSS/Atom feeds (title links +
     summaries).
  3. scrapling          — TLS-impersonating Fetcher.
  4. scrapling-stealth  — StealthyFetcher (Cloudflare/Turnstile pages).
  5. scrapling-dynamic  — DynamicFetcher (JS-shelled LMS pages, headless
     chromium).
  6. static / playwright — legacy fallbacks (kept for environments where
     scrapling is missing or its browser install failed).
  7. jina               — r.jina.ai reader (Agent-Reach zero-config web
     lane) as the last resort before giving up.

Layout decision (operator 09-01, approved): the langchain family is heavy
against the 10G cgroup, so the sidecar is its OWN venv and answers on
127.0.0.1 only. The main API is the trusted boundary: it enforces auth,
SSRF (server/ssrf.py validate_safe_url), the feature flag and the token
budget BEFORE calling us. We double-check the scheme and nothing more.

Key discipline:
  - FREE OpenRouter key only (repo-root .env OPENROUTER_API_KEY, never
    the OmniRoute paid key).
  - SCRAPEGRAPHAI_TELEMETRY_ENABLED=false, set BEFORE scrapegraphai is
    imported.
  - One LLM call per scrape (sub-cent on deepseek flash).
"""

import json
import os
import re
import time
import urllib.parse

# ── Telemetry off BEFORE importing scrapegraphai. ─────────────────────────
os.environ.setdefault("SCRAPEGRAPHAI_TELEMETRY_ENABLED", "false")

import requests  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402

from pydantic import BaseModel, Field  # noqa: E402

_HOSTNAME = os.uname().nodename or "helpotron"
PORT = int(os.getenv("SCRAPE_SIDECAR_PORT", "9778"))
_MODEL = os.getenv("SCRAPE_MODEL", "deepseek/deepseek-v4-flash-vision-exp")
_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root (server/../.env)
_UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
_SCRAPE_TIMEOUT = 30
# Cap the source handed to the graph: the graph chunks the source at
# model_tokens and runs per chunk, so an unbounded page (a 600 KB Wikipedia
# article) means dozens of LLM calls. An assignment page fits in a few KB;
# keep one chunk so a scrape stays one cheap call.
_MAX_SOURCE_CHARS = 40_000
_JINA_BASE = "https://r.jina.ai/"
_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}


def _load_env_file(path: str) -> dict:
    """Minimal dotenv reader (no dependency): KEY=VALUE, # comments, quotes."""
    out = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                v = v.strip().strip('"').strip("'")
                out[k.strip()] = v
    except OSError:
        pass
    return out


_env = _load_env_file(os.path.join(_BASE_DIR, ".env"))
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") or _env.get("OPENROUTER_API_KEY", "")

# scrapegraphai import is expensive (~seconds); do it lazily so /health
# answers fast and a crash in the import degrades gracefully.
_scrapegraphai = None


def _get_scrapegraphai():
    global _scrapegraphai
    if _scrapegraphai is None:
        from scrapegraphai.graphs import SmartScraperGraph  # heavy import
        _scrapegraphai = SmartScraperGraph
    return _scrapegraphai


# ── Lazy availability probes (imports are expensive; probe once, cache). ──
_probe_cache: dict = {}


def _probe(name: str, importer) -> bool:
    """Import `importer` once; cache True/False. Never raises."""
    if name not in _probe_cache:
        try:
            importer()
            _probe_cache[name] = True
        except Exception:
            _probe_cache[name] = False
    return _probe_cache[name]


def _has_scrapling() -> bool:
    return _probe("scrapling", lambda: __import__("scrapling"))


def _has_ytdlp() -> bool:
    return _probe("ytdlp", lambda: __import__("yt_dlp"))


def _has_feedparser() -> bool:
    return _probe("feedparser", lambda: __import__("feedparser"))


def _has_playwright() -> bool:
    return _probe("playwright", lambda: __import__("playwright.sync_api", fromlist=["sync_playwright"]))


def _looks_like_real_page(html: str) -> bool:
    """A JS-shell (SPA bootstrap) has almost no text; a real page has content."""
    if not html or len(html) < 2000:
        return False
    text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=re.I)
    visible = re.sub(r"<[^>]+>", " ", text)
    words = visible.split()
    return len(words) > 40


def _strip_tags(value: str) -> str:
    """HTML -> readable plain text (for feed summaries and SRT-ish captions)."""
    value = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", value or "", flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"&#\d+;|&amp;|&lt;|&gt;|&quot;|&#x([0-9a-fA-F]+);", " ", value)
    return re.sub(r"[ \t]+", " ", value).strip()


def _strip_vtt(subs: str) -> str:
    """WebVTT/SRT caption text -> plain subtitle lines (no timestamps/dupes)."""
    lines = []
    for raw in (subs or "").splitlines():
        line = raw.strip()
        if not line or line == "WEBVTT":
            continue
        if "-->" in line or re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?[.,]\d+.*", line):
            continue
        lines.append(line)
    # collapse consecutive duplicates (VTT repeats lines across cues)
    out = []
    for line in lines:
        if not out or out[-1] != line:
            out.append(line)
    return " ".join(out)


# ── Lane 1/2: Agent-Reach zero-config channels (yt-dlp, feedparser). ──────

def _fetch_youtube(url: str) -> str:
    """yt-dlp: title + description + captions/subtitles as plain text."""
    from yt_dlp import YoutubeDL

    opts = {
        "skip_download": True,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "socket_timeout": _SCRAPE_TIMEOUT,
    }
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info:
            return ""
        parts = [
            f"# {info.get('title') or ''}".strip(),
            f"Channel: {info.get('uploader') or info.get('channel') or ''}".strip(),
        ]
        if info.get("duration"):
            dur = int(info["duration"])
            parts.append(f"Duration: {dur // 60}m {dur % 60}s")
        desc = (info.get("description") or "").strip()
        if desc:
            parts.append(f"\nDescription:\n{desc}")
        # Captions: prefer real subtitles, fall back to auto captions.
        captions = info.get("subtitles") or info.get("automatic_captions") or {}
        chosen = None
        for lang in ("en", "en-US", "en-GB"):
            if lang in captions:
                chosen = captions[lang]
                break
        if chosen is None and captions:
            chosen = next(iter(captions.values()))
        if chosen:
            sub_url = chosen[0].get("url") if isinstance(chosen, list) else None
            if sub_url:
                try:
                    raw = ydl.urlopen(sub_url).read().decode("utf-8", "replace")
                    text = _strip_vtt(raw)
                    if text:
                        parts.append(f"\nTranscript:\n{text[:_MAX_SOURCE_CHARS]}")
                except Exception as e:
                    logger_silent("youtube subtitles", e)
        return "\n\n".join(p for p in parts if p).strip()


def _fetch_rss(url: str) -> str:
    """feedparser: channel title + latest items (title, date, summary, link)."""
    import feedparser

    parsed = feedparser.parse(url, request_headers={"User-Agent": _UA})
    if not parsed or not parsed.entries:
        return ""
    parts = [f"# {parsed.feed.get('title') or 'RSS feed'}"]
    for entry in parsed.entries[:25]:
        parts.append(f"## {entry.get('title', '')}")
        when = entry.get("published") or entry.get("updated") or ""
        if when:
            parts.append(f"({when})")
        summary = _strip_tags(entry.get("summary") or entry.get("description") or "")
        if summary:
            parts.append(summary)
        link = entry.get("link")
        if link:
            parts.append(f"Link: {link}")
    return "\n\n".join(parts).strip()


def _looks_like_feed(url: str) -> bool:
    path = urllib.parse.urlparse(url).path.lower()
    return path.endswith((".xml", ".rss", ".atom")) or "/feed/" in path


# ── Lane 3-5: Scrapling (impersonation / stealth / dynamic). ──────────────

def _fetch_scrapling(url: str, mode: str) -> str:
    """mode in {'plain', 'stealth', 'dynamic'}; returns markdown or ''.

    Unit quirk (verified against scrapling 0.4.15): the curl-based Fetcher.get
    takes `timeout` in SECONDS (with `impersonate`), while the browser-based
    StealthyFetcher/DynamicFetcher `.fetch` forwards `timeout` straight to
    Playwright — MILLISECONDS. Both are honored here.
    """
    if mode == "plain":
        from scrapling import Fetcher
        page = Fetcher().get(url, timeout=_SCRAPE_TIMEOUT, impersonate="chrome")
    elif mode == "stealth":
        from scrapling.fetchers import StealthyFetcher
        page = StealthyFetcher().fetch(url, timeout=max(_SCRAPE_TIMEOUT, 60) * 1000)
    else:
        from scrapling.fetchers import DynamicFetcher
        page = DynamicFetcher().fetch(url, timeout=max(_SCRAPE_TIMEOUT, 60) * 1000,
                                      headless=True)
    if getattr(page, "status", 200) != 200 and getattr(page, "status", None) is not None:
        return ""
    for attr in ("markdown", "text"):
        fn = getattr(page, attr, None)
        if callable(fn):
            try:
                content = fn()
                if content and len(content) > 200:
                    return str(content)
            except Exception:
                continue
    html = getattr(page, "html", "") or ""
    if not html:
        return ""
    if not _looks_like_real_page(str(html)):
        return ""
    return _strip_tags(str(html))


# ── Lane 6: legacy static / playwright. ───────────────────────────────────

def _fetch_static(url: str) -> str:
    try:
        r = requests.get(url, headers={"User-Agent": _UA,
                                       "Accept-Language": "en-US,en;q=0.9"},
                         timeout=_SCRAPE_TIMEOUT, allow_redirects=True)
        if r.status_code != 200:
            return ""
        if not _looks_like_real_page(r.text):
            return ""
        return r.text
    except Exception:
        return ""


def _fetch_playwright(url: str) -> str:
    """On-demand chromium. Only for JS-heavy pages; launched, used, closed."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        try:
            page = browser.new_page(user_agent=_UA)
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(3000)  # let JS hydrate
            html = page.content()
        finally:
            browser.close()
    return html if _looks_like_real_page(html) else ""


# ── Lane 7: Jina reader (Agent-Reach zero-config web lane). ───────────────

def _fetch_jina(url: str) -> str:
    try:
        r = requests.get(_JINA_BASE + urllib.parse.quote(url, safe=""),
                         headers={"User-Agent": _UA,
                                  "Accept": "text/plain,text/html"},
                         timeout=_SCRAPE_TIMEOUT, allow_redirects=True)
        if r.status_code != 200:
            return ""
        text = r.text or ""
        return text if len(text) > 200 else ""
    except Exception:
        return ""


def logger_silent(what: str, exc: Exception) -> None:
    import logging
    logging.getLogger("helpotron_sidecar").debug("%s failed: %s", what, exc)


# ── Fetch chain: first readable content wins. ─────────────────────────────

def _fetch_page(url: str) -> tuple[tuple[str, str], list[dict]]:
    """"Returns ((content, how), lane_log). Lane log records every lane tried
    for operator visibility (what ran, what yielded)."""
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    log: list[dict] = []
    lanes: list[tuple[str, str, callable]] = []

    if host in _YOUTUBE_HOSTS and _has_ytdlp():
        lanes.append(("agentreach:youtube", "yt-dlp title/description/captions", lambda: _fetch_youtube(url)))
    if _looks_like_feed(url) and _has_feedparser():
        lanes.append(("agentreach:rss", "feedparser entries", lambda: _fetch_rss(url)))

    if _has_scrapling():
        lanes.append(("scrapling", "impersonated HTTP fetch", lambda: _fetch_scrapling(url, "plain")))
        lanes.append(("scrapling-stealth", "anti-bot stealth fetch", lambda: _fetch_scrapling(url, "stealth")))
        lanes.append(("scrapling-dynamic", "headless chromium (JS)", lambda: _fetch_scrapling(url, "dynamic")))

    lanes.append(("static", "plain requests fetch", lambda: _fetch_static(url)))
    if _has_playwright():
        lanes.append(("playwright", "headless chromium (legacy)", lambda: _fetch_playwright(url)))
    lanes.append(("jina", "r.jina.ai reader fallback", lambda: _fetch_jina(url)))

    for name, what, fn in lanes:
        try:
            content = fn()
        except Exception as e:
            log.append({"lane": name, "what": what, "ok": False, "why": f"{type(e).__name__}: {e}"})
            continue
        if content and len(content) > 200:
            log.append({"lane": name, "what": what, "ok": True, "chars": len(content)})
            return (content, name), log
        log.append({"lane": name, "what": what, "ok": False, "why": "no readable content"})
    return ("", "none"), log


# ── LLM extraction (ScrapeGraphAI). ───────────────────────────────────────

def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _clean(value) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        # scrapegraphai sometimes nests a single-key dict
        v = next(iter(value.values()), "")
        return _clean(v)
    return str(value).strip()


def _extract_with_graph(source: str, url: str, description: str) -> dict:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="Sidecar has no OpenRouter API key configured.")

    SmartScraperGraph = _get_scrapegraphai()
    prompt = (
        "You are extracting an academic assignment from the content below. "
        'Output ONLY one JSON object with exactly these keys: "title" (a short '
        'assignment title), "due_date" (the due date as free text, or an empty '
        'string if none is given), "instructions" (the full assignment '
        'instructions, verbatim and complete — this is the field that matters most), '
        '"subject" (the academic subject/course of the assignment, e.g. "Calculus II"). '
        "If a field cannot be determined, use an empty string. Never invent content."
    )
    if description:
        prompt += ('\nThe student also provided this context about the assignment: "' +
                   description[:1500] + '". Use it to fill gaps on the page.')

    # ScrapeGraphAI's own "deepseek" provider branch only knows the DeepSeek
    # endpoint and a `deepseek_api_key` — with a "/" slug in the model name it
    # instantiates ChatDeepSeek and treats our free OpenRouter key as unknown.
    # The documented escape hatch is `model_instance`: WE build the client
    # (langchain_openai → ChatOpenAI against OpenRouter's OpenAI-compatible
    # endpoint, FREE key only) and hand it to the graph ready-made.
    from langchain_openai import ChatOpenAI

    llm_instance = ChatOpenAI(
        model=_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url=_OPENROUTER_BASE_URL,
        temperature=0.1,
        timeout=120,
        max_retries=1,
    )
    config = {
        "llm": {
            "model_instance": llm_instance,
            # model_instance path REQUIRES model_tokens — it's the token
            # window the graph chunks long sources with (default would be
            # 8192 anyway; keep it explicit so it can be tuned here).
            "model_tokens": 8192,
        },
        "verbose": False,
        "headless": True,
        "loader_kwargs": {"timeout": _SCRAPE_TIMEOUT},
    }
    started = time.time()
    # Pass the lane content directly so WE control fetch end-to-end.
    graph = SmartScraperGraph(
        prompt=prompt,
        source=(source[:_MAX_SOURCE_CHARS] if source else url),
        config=config)
    result = graph.run()
    elapsed = time.time() - started
    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail=f"Scraper returned no structured result ({type(result).__name__}).")

    title = _clean(result.get("title"))
    due_date = _clean(result.get("due_date"))
    instructions = _clean(result.get("instructions"))
    subject = _clean(result.get("subject"))
    prompt_tok = _estimate_tokens(prompt + source[:12000])
    completion_tok = _estimate_tokens(json.dumps(result)[:8000])
    return {
        "title": title,
        "due_date": due_date,
        "instructions": instructions,
        "subject": subject,
        "scrape_seconds": round(elapsed, 1),
        "usage": {"prompt_tokens": prompt_tok, "completion_tokens": completion_tok,
                  "estimated": True, "model": _MODEL},
    }


class ScrapePayload(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    description: str = Field("", max_length=5000)


app = FastAPI(title="helpotron scrape sidecar", version="2.0.0")


def _agent_reach_available() -> bool:
    """agent-reach is installed INTO this venv (its bin dir is the venv bin),
    so PATH lookup alone misses it when the service env doesn't include it."""
    import os
    import shutil
    import sys
    here = os.path.join(os.path.dirname(sys.executable), "agent-reach")
    return shutil.which("agent-reach") is not None or os.path.isfile(here)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "host": _HOSTNAME,
        "model": _MODEL,
        "key_configured": bool(OPENROUTER_API_KEY),
        "lanes": {
            "agentreach:youtube": _has_ytdlp(),
            "agentreach:rss": _has_feedparser(),
            "scrapling": _has_scrapling(),
            "scrapling_stealth": _has_scrapling(),
            "scrapling_dynamic": _has_scrapling() and _has_playwright(),
            "static": True,
            "playwright": _has_playwright(),
            "jina": True,
            "agentreach_cli": _agent_reach_available(),
        },
    }


@app.get("/platforms")
def platforms():
    """Agent-Reach-style doctor: which lanes can actually run right now."""
    return {
        "lanes": [
            {"name": "agentreach:youtube", "kind": "yt-dlp (zero-config)",
             "available": _has_ytdlp(), "note": "title/description/captions"},
            {"name": "agentreach:rss", "kind": "feedparser (zero-config)",
             "available": _has_feedparser(), "note": "RSS/Atom entries"},
            {"name": "scrapling", "kind": "scrapling Fetcher",
             "available": _has_scrapling(), "note": "browser-TLS impersonation"},
            {"name": "scrapling-stealth", "kind": "scrapling StealthyFetcher",
             "available": _has_scrapling(), "note": "Cloudflare/Turnstile bypass"},
            {"name": "scrapling-dynamic", "kind": "scrapling DynamicFetcher",
             "available": _has_scrapling() and _has_playwright(),
             "note": "JS-shelled pages via headless chromium"},
            {"name": "static", "kind": "requests", "available": True, "note": "plain HTTP"},
            {"name": "playwright", "kind": "playwright chromium",
             "available": _has_playwright(), "note": "legacy JS fallback"},
            {"name": "jina", "kind": "r.jina.ai reader", "available": True,
             "note": "Agent-Reach zero-config web lane"},
        ],
        "agent_reach_cli": {
            "installed": _agent_reach_available(),
            "note": "agent-reach exposes no fetch command; its doctor tool is "
                    "the status surface. Channels are used directly here.",
        },
    }


@app.post("/scrape")
def scrape(payload: ScrapePayload):
    url = payload.url.strip()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Only http(s) URLs are supported.")
    # Defense-in-depth: internal hosts are rejected here too (the main API is
    # the authoritative SSRF gate; this is the cheap second look).
    host = parsed.hostname or ""
    if url.startswith("http://127") or url.startswith("http://localhost") or "127.0.0.1" in host:
        raise HTTPException(status_code=400, detail="Refusing local/internal URL.")

    (content, how), lane_log = _fetch_page(url)
    if not content:
        raise HTTPException(
            status_code=422,
            detail="Could not fetch readable content from that URL "
                   "(blocked, JS-only, or empty page). Lanes tried: " +
                   ", ".join(f"{l['lane']}({'ok' if l.get('ok') else l.get('why', 'no content')})" for l in lane_log))
    try:
        data = _extract_with_graph(content, url, payload.description)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scraping failed: {e}") from e

    data["fetched_by"] = how
    data["status"] = "ok"
    data["url"] = url
    data["lanes"] = lane_log
    return data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
