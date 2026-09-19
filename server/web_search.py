"""Web search for Helpotron agents (owner 2026-09-18).

Owner: *"allow the agents to access the websearch mcp when needed so they can
actually look up shi"* and *"allow it for any of the helpotron agents, so
whenever it needs it can browse the web for extra context or to solve stuff"*.

**Why OpenRouter's own web plugin and not a separate search API.** The owner's
standing rule is that every Helpotron LLM call goes through OpenRouter (key in
`.env`, no other lanes). This uses that same key and that same channel, so there
is no new provider, no new secret to rotate, and no second bill to reconcile —
the search charge arrives inside `usage.cost` on the very response we already
meter, which means the existing watermark → `charge_actual_usage` path bills it
with no extra plumbing.

**Cost is engine-controlled, verified live 2026-09-18.** The same query against
the same model cost:

    default engine (Exa)                        $0.0072157
    engine=parallel, mode=turbo                 $0.0012576

so the cheap engine is selected deliberately. `/v1/chat/completions` with
`plugins:[{"id":"web", ...}]` returns `message.annotations[]` of
`{type:"url_citation", url_citation:{title,url,content}}` — real sources to cite.
Note that `usage.cost` already INCLUDES the search fee, so callers must ledger
that figure and must not add a separate per-search charge on top of it.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"

# The cheap engine. `turbo` is $0.001/request vs Exa's default $0.007 — a 5x
# difference for the same answer to a factual lookup, measured not assumed.
SEARCH_ENGINE = os.getenv("HELPOTRON_SEARCH_ENGINE", "parallel")
SEARCH_MODE = os.getenv("HELPOTRON_SEARCH_MODE", "turbo")
SEARCH_MAX_RESULTS = int(os.getenv("HELPOTRON_SEARCH_MAX_RESULTS", "5"))

# Every search bills a real request. One agent turn must not be able to spend an
# unbounded amount, so the number of searches a single action may perform is
# capped here rather than left to the caller.
_MAX_SEARCHES_PER_ACTION = 1


def _api_key() -> str:
    try:
        from .config import config
        key = os.getenv("OPENROUTER_API_KEY") or getattr(config, "openrouter_api_key", "") or ""
    except Exception:
        key = os.getenv("OPENROUTER_API_KEY", "")
    return (key or "").strip()


def search_configured() -> bool:
    return bool(_api_key())


def _parse_sources(message: Dict[str, Any]) -> List[Dict[str, str]]:
    """Pull the citation list out of the assistant message.

    Annotations are only attached when a NON-native engine ran the search; a
    provider that grounds natively returns none. That is not an error, so an
    empty list is returned rather than raising — the answer is still usable, it
    simply has no sources to show.
    """
    out: List[Dict[str, str]] = []
    for ann in (message.get("annotations") or []):
        if not isinstance(ann, dict):
            continue
        cit = ann.get("url_citation") or {}
        url = str(cit.get("url") or "").strip()
        if not url:
            continue
        out.append({
            "title": str(cit.get("title") or url).strip(),
            "url": url,
            "snippet": str(cit.get("content") or "").strip()[:400],
        })
    # Stable de-dupe: an answer often cites the same page more than once.
    seen, unique = set(), []
    for s in out:
        if s["url"] in seen:
            continue
        seen.add(s["url"])
        unique.append(s)
    return unique


async def web_search(
    query: str,
    *,
    model: Optional[str] = None,
    user_id: Optional[str] = None,
    db: Any = None,
    max_results: int = SEARCH_MAX_RESULTS,
    timeout: float = 60.0,
) -> Dict[str, Any]:
    """Search the live web and return a grounded answer plus its sources.

    Returns {ok, answer, sources, cost_usd, usage, error}. Never raises: the
    agent is mid-conversation and a search failure must degrade into "I couldn't
    look that up" rather than killing the turn.

    The caller is responsible for having established the metering context. When
    `db` and `user_id` are supplied the search itself is recorded against the
    ledger, so its cost is billable by the standard watermark settlement.
    """
    query = (query or "").strip()
    if not query:
        return {"ok": False, "answer": "", "sources": [], "cost_usd": 0.0,
                "usage": {}, "error": "empty query"}

    key = _api_key()
    if not key:
        return {"ok": False, "answer": "", "sources": [], "cost_usd": 0.0,
                "usage": {}, "error": "OpenRouter key not configured"}

    # Model is resolved by the caller (each surface has its own ladder — the
    # extension must stay on a vision model, My Agent uses the text ladder).
    if not model:
        try:
            from .llm import resolve_model_routing
            model = resolve_model_routing(effort_score=500)["model"]
        except Exception:
            model = "deepseek/deepseek-v4.1-flash"

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://helpotron.app",
        "X-Title": "Helpotron Study OS",
    }
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are looking things up on the live web for a study assistant. "
                    "Answer the question directly and concisely using the search results. "
                    "Lead with the answer, then give only the detail that is needed. "
                    "If the results do not actually answer it, say so plainly instead of "
                    "guessing — never invent facts, numbers, dates or sources."
                ),
            },
            {"role": "user", "content": query},
        ],
        "plugins": [{
            "id": "web",
            "engine": SEARCH_ENGINE,
            "mode": SEARCH_MODE,
            "max_results": max(1, min(int(max_results or 5), 10)),
        }],
        "max_tokens": 900,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(OPENROUTER_CHAT_URL, headers=headers, json=payload)
            if resp.status_code != 200:
                detail = resp.text[:200]
                logger.warning("web_search failed: HTTP %s %s", resp.status_code, detail)
                return {"ok": False, "answer": "", "sources": [], "cost_usd": 0.0,
                        "usage": {}, "error": f"search provider returned HTTP {resp.status_code}"}
            data = resp.json()
    except Exception as exc:  # network, timeout, malformed JSON
        logger.warning("web_search request error: %s", exc)
        return {"ok": False, "answer": "", "sources": [], "cost_usd": 0.0,
                "usage": {}, "error": "could not reach the search provider"}

    try:
        message = data["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        return {"ok": False, "answer": "", "sources": [], "cost_usd": 0.0,
                "usage": {}, "error": "search provider returned no answer"}

    from .llm import strip_thinking_tokens

    answer = strip_thinking_tokens(message.get("content") or "").strip()
    sources = _parse_sources(message)
    usage = data.get("usage") or {}
    try:
        cost_usd = float(usage.get("cost") or 0.0)
    except (TypeError, ValueError):
        cost_usd = 0.0

    # Ledger it. `usage.cost` already includes the search fee, so this single row
    # is the whole charge — adding a separate search fee would double-bill.
    if db is not None and user_id:
        try:
            from .llm import record_routing_telemetry
            await record_routing_telemetry(
                db, user_id, {"model": model, "tier": "web_search", "reason": "web search"}, usage
            )
        except Exception as exc:
            logger.warning("web_search ledger write failed: %s", exc)

    if not answer:
        return {"ok": False, "answer": "", "sources": sources, "cost_usd": cost_usd,
                "usage": usage, "error": "the search returned no usable text"}

    return {"ok": True, "answer": answer, "sources": sources, "cost_usd": cost_usd,
            "usage": usage, "error": None}


def format_for_agent(result: Dict[str, Any], query: str) -> str:
    """Render a search result as the text the agent reads back in its turn."""
    if not result.get("ok"):
        return (f"Web search for \"{query}\" did not return usable results "
                f"({result.get('error') or 'unknown reason'}). Tell the user you could not "
                f"look it up rather than guessing.")
    lines = [f"Web search results for \"{query}\":", "", result["answer"].strip()]
    sources = result.get("sources") or []
    if sources:
        lines.append("")
        lines.append("Sources:")
        for s in sources[:8]:
            lines.append(f"- {s['title']} — {s['url']}")
    else:
        lines.append("")
        lines.append("(No source list was returned for this search.)")
    return "\n".join(lines)
