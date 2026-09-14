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


def test_ui_config_model_ladder_is_three_tiers():
    body = client.get("/api/extension/ui-config").json()
    tiers = [t["tier"] for t in body["model_ladder"]]
    assert tiers == ["low", "med", "high"]


def test_ui_config_carries_action_caps():
    body = client.get("/api/extension/ui-config").json()
    assert body["action_cap"] == 15
    assert body["type_text_cap"] == 2000
