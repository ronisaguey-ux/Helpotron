"""Thin-wrapper migration endpoints — /render and /ui-config."""
from __future__ import annotations

from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def test_render_endpoint_returns_html():
    r = client.post("/api/extension/render", json={"text": "area is $\\pi r^2$"})
    assert r.status_code == 200
    html = r.json()["html"]
    assert "<math" in html
    assert "\\pi" not in html  # raw LaTeX replaced by MathML


def test_render_endpoint_empty_text():
    assert client.post("/api/extension/render", json={"text": ""}).json()["html"] == ""


def test_ui_config_serves_mode_hints():
    r = client.get("/api/extension/ui-config")
    assert r.status_code == 200
    body = r.json()
    assert set(body["mode_hints"]) == {"manual", "auto", "yolo"}
    assert "version" in body


def test_ui_config_model_ladder_matches_the_real_router():
    """The ladder the popup renders must name the model the extension runs.

    The extension is a VISION surface (owner 2026-09-18): it drives the page and
    can send screen frames, so it runs only the three models that can see (the
    allow-list asserted below) and the chat route pins itself to the same ladder
    (`model_override` + `vision_only`). Which of the three sits at which level is
    decided by `resolve_vision_model` and ordered by real cost — it is NOT pinned
    here, because a pinned order is what went stale on 2026-09-26.
    The badge is therefore computed from `resolve_vision_model`, NOT from the
    text ladder My Agent routes through (which uses nemotron at level 1 and qwen
    at level 2 — models that cannot read a screenshot).

    One entry per LEVEL, not per band: the popup looks up the exact slider
    position, so bands would not be enough to pick the right row.
    """
    from server.screen_vision import resolve_vision_model

    body = client.get("/api/extension/ui-config").json()
    ladder = body["model_ladder"]
    assert [t["level"] for t in ladder] == list(range(1, 11))

    for entry in ladder:
        expected, tier, _ = resolve_vision_model(entry["level"])
        assert entry["model"] == expected, (
            f"level {entry['level']}: ui-config advertises {entry['model']} "
            f"but the extension runs {expected}"
        )
        assert entry["tier"] == tier

    # The whole ladder must be vision-capable — a text-only model here would mean
    # the extension could answer about a page it cannot see.
    vision = {
        "google/gemini-3.1-flash-lite",
        "deepseek/deepseek-v4.1-flash",
        "google/gemini-3.8-flash",
    }
    assert {e["model"] for e in ladder} == vision

    # ── 2026-09-26: the band assignment is NOT restated here any more. ──────────
    # This block used to hardcode "low = lite, mid = deepseek, high = 3.8" as
    # literals. That is a SECOND copy of a fact that already lives in
    # screen_vision.VISION_MODEL_TIERS, so when the ladder was reordered by real
    # cost this copy went stale and the test failed while the code was correct.
    # Two sources of one fact is the defect; asserting the literal again would
    # re-create it. The invariants that are NOT derivable from the resolver are
    # checked instead: the ladder ascends in real cost, and the tier bands rise
    # monotonically with the level.
    from server.llm import calculate_effective_task_cost as _cost

    costs = [_cost(e["model"]) for e in ladder]
    assert costs == sorted(costs), (
        "the effort ladder must ascend in real cost — a level that costs less than "
        f"the level below it is not a spend control. got {costs}"
    )

    bands = [e["tier"] for e in ladder]
    order = {"low": 0, "med": 1, "high": 2}
    assert all(b in order for b in bands), f"unexpected tier label in {bands}"
    assert [order[b] for b in bands] == sorted(order[b] for b in bands), (
        f"tier bands must rise with the level, got {bands}"
    )

    # My Agent is a DIFFERENT surface and must NOT be pinned to this ladder.
    from server.llm import resolve_model_routing
    assert resolve_model_routing(effort_score=100)["model"] != ladder[0]["model"]

    # Tier drives the badge styling; the resolver loop above already proves the
    # tier matches, and the band-order check above proves it rises with the level.
    # The old copy here restated the 3/6 boundaries as literals — the same
    # duplication this file just removed.

    # `vision_ladder` is kept as an alias for older clients — same content.
    assert body["vision_ladder"] == ladder


def test_ui_config_carries_action_caps():
    from server.screen_vision import _MAX_AGENT_TOOL_CALLS, _MAX_CONTROL_ACTIONS

    body = client.get("/api/extension/ui-config").json()
    assert body["action_cap"] == _MAX_CONTROL_ACTIONS
    # The extension's loop reads this rather than hardcoding it, so the server
    # stays the single source of truth for the tool-call budget.
    assert body["tool_call_budget"] == _MAX_AGENT_TOOL_CALLS
    assert body["tool_call_budget"] == 100
    assert body["type_text_cap"] == 2000
