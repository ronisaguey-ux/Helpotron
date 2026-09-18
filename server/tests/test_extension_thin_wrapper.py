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
    """The ladder the popup renders must name the model that actually runs.

    Regression guard for a real mismatch (owner 2026-09-18): the badge said
    "Gemini 3.1 Flash Lite" while the agent was answering on deepseek-v4.1-flash.
    The ladder was computed from `resolve_vision_model` — the SCREEN-FRAME ladder
    — while text chat routes through `resolve_model_routing`, and the two
    disagree: vision's top band is gemini-3.8-flash, but the text ladder sends
    levels 8-10 to DeepSeek, so gemini-3.8-flash is unreachable on the text path.

    One entry per LEVEL, not per band: levels 1, 2 and 3 select three different
    models, so a band-level label can only be right for one of them.
    """
    from server.llm import effective_chat_model

    body = client.get("/api/extension/ui-config").json()
    ladder = body["model_ladder"]
    assert [t["level"] for t in ladder] == list(range(1, 11))

    # Every entry must equal what a chat turn at that level will ACTUALLY run —
    # which is the router plus the request-dependent rewrites (the agent's intent
    # call is JSON mode, which turns a level-1 nemotron pick into gemini-lite).
    # Asserting against the raw router instead is what let the badge name a model
    # that never executed.
    for entry in ladder:
        expected = effective_chat_model(entry["level"])
        assert entry["model"] == expected, (
            f"level {entry['level']}: ui-config advertises {entry['model']} "
            f"but a chat turn runs {expected}"
        )

    # The specific case the owner reported: slider at level 1 must advertise
    # Gemini 3.1 Flash Lite, because that is what runs there.
    assert ladder[0]["model"] == "google/gemini-3.1-flash-lite"

    # Tier matches the popup's own banding, which drives the badge styling.
    for entry in ladder:
        lvl = entry["level"]
        expect_tier = "low" if lvl <= 3 else "med" if lvl <= 6 else "high"
        assert entry["tier"] == expect_tier

    # The vision ladder is still published, and separately labelled, because
    # screen-frame analysis genuinely is tiered differently.
    assert len(body["vision_ladder"]) == 3


def test_ui_config_carries_action_caps():
    body = client.get("/api/extension/ui-config").json()
    assert body["action_cap"] == 15
    assert body["type_text_cap"] == 2000
