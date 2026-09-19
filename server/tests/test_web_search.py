"""Web search for every Helpotron agent (owner 2026-09-18).

Owner: *"allow the agents to access the websearch mcp when needed so they can
actually look up shi"* and *"allow it for any of the helpotron agents, so
whenever it needs it can browse the web for extra context or to solve stuff"*.

These tests pin the wiring, not the network: the one test that would hit
OpenRouter is skipped when no key is present, so an offline box still runs the
suite. What must not silently regress is that the action is OFFERED to the
model, DISPATCHABLE by the executor, NEVER gated behind a permission prompt, and
METERED when it runs.
"""
import os

import pytest

from server.routes_overlord import _AGENT_ACTIONS, _AGENT_ACTION_COSTS
from server.overlord_agent import CRITICAL_ACTION_TYPES, READONLY_ACTION_TYPES


def test_web_search_is_offered_to_every_surface():
    """It lives in the SHARED action table, which is what makes it available to
    every agent — My Agent, the assignment team, and the extension. If someone
    moves it behind a `node == ...` check, surfaces silently lose it."""
    assert "web_search" in _AGENT_ACTIONS
    assert list(_AGENT_ACTIONS["web_search"].keys()) == ["query"]


def test_web_search_is_gated_as_a_read():
    """A lookup reads the web; it changes nothing. A confirmation card in front
    of it would stall every current-facts question for no safety gain — the cost
    is metered, and the budget is what bounds it, not a prompt."""
    assert "web_search" in READONLY_ACTION_TYPES
    assert "web_search" not in CRITICAL_ACTION_TYPES


def test_web_search_has_a_billable_eligible_cost():
    """`_AGENT_ACTION_COSTS` is the eligibility hint (0 = needs no balance).
    A search spends real money, so it must not read as free."""
    assert _AGENT_ACTION_COSTS.get("web_search", 0) > 0


def test_search_cost_comes_from_the_provider_not_a_second_charge():
    """The search fee arrives inside `usage.cost` on the response, so the ledger
    row that records it is the WHOLE charge. Adding a separate per-search fee on
    top would double-bill — the helper must not carry one."""
    import inspect

    from server import web_search as ws

    # No per-search price constant exists in the module. The measured figures in
    # the docstring are documentation of why the cheap engine was chosen — they
    # are never read as a charge.
    src = inspect.getsource(ws)
    assert "dollars_per_search" not in src.lower()
    assert not hasattr(ws, "SEARCH_FEE")
    assert not hasattr(ws, "SEARCH_PRICE")
    # the cheap engine is the configured default
    assert ws.SEARCH_ENGINE == "parallel"
    assert ws.SEARCH_MODE == "turbo"


@pytest.mark.parametrize("bad", ["", "   ", None])
def test_empty_query_never_raises(bad):
    """The agent is mid-conversation: a bad query degrades to a message, it
    must not kill the turn."""
    import asyncio

    from server.web_search import web_search

    res = asyncio.run(web_search(bad))
    assert res["ok"] is False
    assert res["error"]


def test_citation_parsing_dedupes_and_skips_junk():
    from server.web_search import _parse_sources

    msg = {
        "annotations": [
            {"type": "url_citation", "url_citation": {"title": "A", "url": "https://a.test"}},
            {"type": "url_citation", "url_citation": {"title": "A again", "url": "https://a.test"}},
            {"type": "url_citation", "url_citation": {"title": "no url"}},
            {"url_citation": {"title": "B", "url": "https://b.test", "content": "snippet"}},
            "not-a-dict",
        ]
    }
    out = _parse_sources(msg)
    assert [s["url"] for s in out] == ["https://a.test", "https://b.test"]
    assert out[1]["snippet"] == "snippet"


def test_agent_text_says_so_when_the_search_failed():
    """A failed lookup must be stated, never papered over — the agent reads this
    text and would otherwise answer from memory as if it had searched."""
    from server.web_search import format_for_agent

    text = format_for_agent({"ok": False, "error": "could not reach the search provider"}, "x")
    assert "could not" in text.lower()
    assert "rather than guessing" in text.lower()


@pytest.mark.skipif(
    not os.getenv("OPENROUTER_API_KEY"),
    reason="needs the live OpenRouter key — network test",
)
def test_live_search_returns_sources_and_a_cost():
    """End-to-end against the real provider. Proves the plugin is accepted by
    our channel and that a cost is reported for the meter to bill."""
    import asyncio

    from server.web_search import web_search

    res = asyncio.run(web_search("Who is the current UK prime minister?",
                                 model="deepseek/deepseek-v4.1-flash"))
    assert res["ok"], res.get("error")
    assert res["answer"].strip()
    assert res["cost_usd"] > 0, "search cost must be measurable or it cannot be billed"
