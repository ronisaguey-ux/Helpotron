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
    can send screen frames, so it runs only the three models that can see —
    gemini-3.1-flash-lite, deepseek-v4.1-flash, gemini-3.8-flash — and the chat
    route pins itself to the same ladder (`model_override` + `vision_only`).
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

    # The owner's spec, stated directly: low = lite, mid = deepseek, high = 3.8.
    for e in ladder:
        lvl = e["level"]
        if lvl <= 3:
            assert e["model"] == "google/gemini-3.1-flash-lite"
        elif lvl <= 6:
            assert e["model"] == "deepseek/deepseek-v4.1-flash"
        else:
            assert e["model"] == "google/gemini-3.8-flash"

    # My Agent is a DIFFERENT surface and must NOT be pinned to this ladder.
    from server.llm import resolve_model_routing
    assert resolve_model_routing(effort_score=100)["model"] != ladder[0]["model"]

    # Tier matches the popup's own banding, which drives the badge styling.
    for entry in ladder:
        lvl = entry["level"]
        expect_tier = "low" if lvl <= 3 else "med" if lvl <= 6 else "high"
        assert entry["tier"] == expect_tier

    # `vision_ladder` is kept as an alias for older clients — same content.
    assert body["vision_ladder"] == ladder


def test_ui_config_carries_action_caps():
    body = client.get("/api/extension/ui-config").json()
    assert body["action_cap"] == 15
    assert body["type_text_cap"] == 2000
