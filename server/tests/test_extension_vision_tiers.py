"""09-02: effort-tiered screen-vision model resolution for the extension.

Covers resolve_vision_model (effort 1..1000 -> one of the four spec'd vision
models, cheapest -> most expensive), parse_effort_score clamping, the
OpenRouter slug map kept in sync with llm.py, and the 15-action control cap.
"""
import pytest

from server.screen_vision import (
    DEFAULT_EFFORT_SCORE,
    VISION_MODEL,
    VISION_MODEL_TIERS,
    _MAX_CONTROL_ACTIONS,
    _OR_SLUG_MAP,
    extract_control_actions,
    parse_effort_score,
    resolve_vision_model,
)


# ── parse_effort_score ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("value,expected", [
    (None, DEFAULT_EFFORT_SCORE),
    ("", DEFAULT_EFFORT_SCORE),
    ("abc", DEFAULT_EFFORT_SCORE),
    ("  12.7  ", 12),
    (True, DEFAULT_EFFORT_SCORE),  # bool is not a score
    ({"x": 1}, DEFAULT_EFFORT_SCORE),
    (250, 250),
    (0, 1),          # clamp low
    (-10, 1),        # clamp low
    (5000, 1000),    # clamp high
    (999.9, 999),
])
def test_parse_effort_score(value, expected):
    assert parse_effort_score(value) == expected


# ── resolve_vision_model tiers ────────────────────────────────────────────────

def test_tier_lite_below_300():
    model, tier, score = resolve_vision_model(300)
    assert model == "google/gemini-3.1-flash-lite"      # cheapest
    assert tier == "lite"
    assert score == 300


def test_tier_mid_lower_301_500():
    model, tier, _ = resolve_vision_model(301)
    assert model == VISION_MODEL                          # deepseek flash vision
    assert tier == "mid_lower"
    model, tier, _ = resolve_vision_model(500)
    assert model == VISION_MODEL
    assert tier == "mid_lower"


def test_tier_mid_upper_501_700():
    model, tier, _ = resolve_vision_model(501)
    assert model == "google/gemini-3.7-flash"
    assert tier == "mid_upper"
    model, tier, _ = resolve_vision_model(700)
    assert model == "google/gemini-3.7-flash"
    assert tier == "mid_upper"


def test_tier_pro_above_700():
    model, tier, _ = resolve_vision_model(701)
    assert model == "deepseek/deepseek-v4-pro-vision"     # most expensive
    assert tier == "pro"
    model, tier, _ = resolve_vision_model(1000)
    assert model == "deepseek/deepseek-v4-pro-vision"
    assert tier == "pro"


def test_resolve_default_and_clamped():
    # absent effort -> default 500 (mid_lower tier)
    assert resolve_vision_model() == (VISION_MODEL, "mid_lower", 500)
    # out-of-range clamps, never a 500/error
    assert resolve_vision_model(99999) == ("deepseek/deepseek-v4-pro-vision", "pro", 1000)
    assert resolve_vision_model(-42) == ("google/gemini-3.1-flash-lite", "lite", 1)


def test_tiers_are_ordered_by_price():
    """Sanity: the four ids are distinct, ascending price, and every one of
    them is declared in ModelPolicy's price table (llm.py) — the tier resolver
    must never name a model the pricing layer does not know."""
    from server.llm import MODEL_PRICING
    tiers = list(VISION_MODEL_TIERS.keys())
    assert len(tiers) == 4
    assert len(set(tiers)) == 4
    for model_id in tiers:
        assert model_id in MODEL_PRICING, f"{model_id} missing from llm.MODEL_PRICING"
    prices = [MODEL_PRICING[m]["input"] for m in tiers]
    assert prices == sorted(prices), "tier order must be cheapest -> most expensive"


# ── OpenRouter slug map sync (mirror of llm.call_llm, 09-01) ───────────────────

def test_or_slug_map_matches_llm_call_slug_rules():
    # flash-vision exp slug; pro-vision -> pro text slug (no standalone
    # pro-vision catalog entry); both gemini slugs pass through untouched.
    assert _OR_SLUG_MAP["deepseek/deepseek-v4-flash-vision"] == "deepseek/deepseek-v4-flash-vision-exp"
    assert _OR_SLUG_MAP["deepseek/deepseek-v4-pro-vision"] == "deepseek/deepseek-v4-pro"
    assert _OR_SLUG_MAP["google/gemini-3.1-flash-lite"] == "google/gemini-3.1-flash-lite"
    assert _OR_SLUG_MAP["google/gemini-3.7-flash"] == "google/gemini-3.7-flash"
    # every tier model resolves through the map
    assert set(_OR_SLUG_MAP.keys()) == set(VISION_MODEL_TIERS.keys())


# ── Control action cap (09-02 spec: max 15 per task) ──────────────────────────

def _viewport():
    return {"width": 1200, "height": 800}


def _act(i):
    return {"op": "move", "x": i * 10 % 1199, "y": i * 10 % 799}


def test_control_action_cap_is_15():
    assert _MAX_CONTROL_ACTIONS == 15


def test_control_block_at_cap_accepted():
    reply = "doing it now\n```control\n" + "{\"actions\": " + repr([_act(i) for i in range(15)]).replace("'", '"') + "}\n```"
    clean, actions = extract_control_actions(reply, _viewport())
    assert actions is not None and len(actions) == 15
    assert "doing it now" in clean


def test_control_block_over_cap_dropped_whole():
    big = [dict(_act(i)) for i in range(16)]
    import json as _json
    reply = "x\n```control\n" + _json.dumps({"actions": big}) + "\n```"
    clean, actions = extract_control_actions(reply, _viewport())
    assert actions is None, "over-cap list must be dropped entirely (never partial)"
    assert "x" in clean
