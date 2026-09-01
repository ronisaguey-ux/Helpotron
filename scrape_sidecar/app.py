#!/usr/bin/env python3
"""Helpotron scrape sidecar — ScrapeGraphAI SmartScraperGraph behind FastAPI.

Serves ONE job (feature #79, "Scrape from anywhere"): fetch the page the
user pasted (static fetch first, Playwright chromium on demand for
JS-shelled LMS pages), let SmartScraperGraph extract the assignment
fields {title, due_date, instructions, subject}, and hand the result to
the main API's import-from-url route.

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
# Cap the HTML handed to the graph: the graph chunks the source at
# model_tokens and runs per chunk, so an unbounded page (a 600 KB Wikipedia
# article) means dozens of LLM calls. An assignment page fits in a few KB;
# keep one chunk so a scrape stays one cheap call.
_MAX_SOURCE_CHARS = 40_000


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


def _has_playwright() -> bool:
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
        return True
    except Exception:
        return False


def _looks_like_real_page(html: str) -> bool:
    """A JS-shell (SPA bootstrap) has almost no text; a real page has content."""
    if not html or len(html) < 2000:
        return False
    text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=re.I)
    visible = re.sub(r"<[^>]+>", " ", text)
    words = visible.split()
    return len(words) > 40


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


def _fetch_page(url: str) -> tuple[str, str]:
    """"Returns (html, how). Tries static first, playwright only when needed."""
    html = _fetch_static(url)
    if html:
        return html, "static"
    if _has_playwright():
        html = _fetch_playwright(url)
        if html:
            return html, "playwright"
    return "", "static"


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


def _extract_with_graph(html: str, url: str, description: str) -> dict:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="Sidecar has no OpenRouter API key configured.")

    SmartScraperGraph = _get_scrapegraphai()
    prompt = (
        "You are extracting an academic assignment from the page below. "
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
            # window the graph chunks long pages with (default would be 8192
            # anyway; keep it explicit so it can be tuned here).
            "model_tokens": 8192,
        },
        "verbose": False,
        "headless": True,
        "loader_kwargs": {"timeout": _SCRAPE_TIMEOUT},
    }
    started = time.time()
    # Pass the fetched HTML directly so WE control fetch (static/playwright).
    graph = SmartScraperGraph(prompt=prompt, source=(html[: _MAX_SOURCE_CHARS] if html else url), config=config)
    result = graph.run()
    elapsed = time.time() - started
    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail=f"Scraper returned no structured result ({type(result).__name__}).")

    title = _clean(result.get("title"))
    due_date = _clean(result.get("due_date"))
    instructions = _clean(result.get("instructions"))
    subject = _clean(result.get("subject"))
    prompt_tok = _estimate_tokens(prompt + html[:12000])
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


app = FastAPI(title="helpotron scrape sidecar", version="1.0.0")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "host": _HOSTNAME,
        "model": _MODEL,
        "key_configured": bool(OPENROUTER_API_KEY),
        "playwright": _has_playwright(),
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

    html, how = _fetch_page(url)
    if not html:
        raise HTTPException(status_code=422,
                            detail="Could not fetch readable content from that URL "
                                   "(blocked, JS-only without chromium, or empty page).")
    try:
        data = _extract_with_graph(html, url, payload.description)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scraping failed: {e}") from e

    data["fetched_by"] = how
    data["status"] = "ok"
    data["url"] = url
    return data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
