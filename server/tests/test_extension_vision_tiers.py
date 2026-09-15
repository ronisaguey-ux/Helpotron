"""09-02: effort-tiered screen-vision model resolution for the extension.

Covers resolve_vision_model (effort 1..1000 -> one of the three spec'd vision
models, cheapest -> most expensive), parse_effort_score clamping, the retired
OpenRouter slug map, and the 15-action control cap.
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

def test_tier_low_below_333():
    model, tier, score = resolve_vision_model(333)
    assert model == "google/gemini-3.1-flash-lite"      # cheapest
    assert tier == "low"
    assert score == 333


def test_tier_med_334_666():
    model, tier, _ = resolve_vision_model(334)
    assert model == VISION_MODEL                          # deepseek v4.1 flash
    assert tier == "med"
    model, tier, _ = resolve_vision_model(666)
    assert model == VISION_MODEL
    assert tier == "med"


def test_tier_high_above_666():
    model, tier, _ = resolve_vision_model(667)
    assert model == "google/gemini-3.8-flash"             # most expensive
    assert tier == "high"
    model, tier, _ = resolve_vision_model(1000)
    assert model == "google/gemini-3.8-flash"
    assert tier == "high"


def test_resolve_default_and_clamped():
    # absent effort -> default 500 (med tier)
    assert resolve_vision_model() == (VISION_MODEL, "med", 500)
    # out-of-range clamps, never a 500/error
    assert resolve_vision_model(99999) == ("google/gemini-3.8-flash", "high", 1000)
    assert resolve_vision_model(-42) == ("google/gemini-3.1-flash-lite", "low", 1)


def test_tiers_are_ordered_by_price():
    """Sanity: the three ids are distinct, ascending price, and every one of
    them is declared in ModelPolicy's price table (llm.py) — the tier resolver
    must never name a model the pricing layer does not know."""
    from server.llm import MODEL_PRICING
    tiers = list(VISION_MODEL_TIERS.keys())
    assert len(tiers) == 3
    assert len(set(tiers)) == 3
    for model_id in tiers:
        assert model_id in MODEL_PRICING, f"{model_id} missing from llm.MODEL_PRICING"
    prices = [MODEL_PRICING[m]["input"] for m in tiers]
    assert prices == sorted(prices), "tier order must be cheapest -> most expensive"


def test_no_banned_gemini_models_in_ladder():
    """Owner pin (09-08): gemini is 3.1-flash-lite + 3.8-flash ONLY, and
    v4-pro-vision is off the ladder entirely."""
    banned = ("gemini-3.5-flash", "gemini-3.1-pro-preview", "deepseek-v4-pro")
    for model_id in list(VISION_MODEL_TIERS) + list(_OR_SLUG_MAP.values()):
        for bad in banned:
            assert bad not in model_id, f"{model_id} contains banned slug {bad}"


# ── OpenRouter slug map sync (mirror of llm.call_llm, 09-01) ───────────────────

def test_or_slug_map_is_identity_for_v4_1_flash():
    # 09-10: V4.1 Flash is natively vision on OpenRouter, so no canonical ->
    # wire rewrite is needed. The map is empty and every tier id reaches
    # OpenRouter unchanged (llm.call_llm applies .get(cid, cid)).
    assert _OR_SLUG_MAP == {}
    for model_id in VISION_MODEL_TIERS:
        assert _OR_SLUG_MAP.get(model_id, model_id) == model_id


# ── Dead-tier fallback (09-08) ────────────────────────────────────────────────

def test_fallback_targets_are_live_tier_models():
    """A fallback must point at a model that is itself a tier model, and must
    never point at itself (that would loop the retry back onto the dead one)."""
    from server.screen_vision import _VISION_FALLBACK
    for src, dst in _VISION_FALLBACK.items():
        assert src in VISION_MODEL_TIERS, f"fallback source {src} is not a tier"
        assert dst in VISION_MODEL_TIERS, f"fallback target {dst} is not a tier"
        assert src != dst
        assert dst not in _VISION_FALLBACK, f"fallback target {dst} is itself dead"


def test_med_tier_degrades_up_not_down():
    """The med tier's deepseek model stays behind a fallback until it is
    re-measured end-to-end: its predecessor was LISTED as image-capable but
    returned empty content for image payloads (measured 09-08). The user asked
    for more than low effort, so the retry must land on the HIGH tier, never
    back down on the cheapest one."""
    from server.llm import MODEL_PRICING
    from server.screen_vision import _VISION_FALLBACK
    src = "deepseek/deepseek-v4.1-flash"
    dst = _VISION_FALLBACK[src]
    assert MODEL_PRICING[dst]["input"] >= MODEL_PRICING[src]["input"]


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


# ── dual-scale: the 1..10 UI LEVEL must not pin everyone to the cheap tier ────
#
# The web dial and the extension sliders write ten effort LEVELS (1..10), but
# this resolver was written against the original 1..1000 score with bands at
# 333/666. A level of 1..10 clamped to itself, landed under the first band, and
# silently pinned every user to the cheapest vision tier no matter where the
# slider was dragged. Measured before the fix: levels 1/3/5/7/10 all resolved to
# 'low'. parse_effort_score scales a level up to the same bands instead.

@pytest.mark.parametrize("level,expected_tier", [
    (1, "low"), (2, "low"), (3, "low"),
    (4, "med"), (5, "med"), (6, "med"),
    (7, "high"), (8, "high"), (9, "high"), (10, "high"),
])
def test_ui_levels_map_to_the_same_bands_the_ui_advertises(level, expected_tier):
    _, tier, score = resolve_vision_model(level)
    assert tier == expected_tier, f"level {level} resolved to {tier}"
    # and the level is scaled onto the 1..1000 scale, not used raw
    assert score == level * 100


def test_ui_levels_are_not_all_stuck_on_the_cheapest_tier():
    """The regression itself: before the fix every level was 'low'."""
    tiers = {resolve_vision_model(n)[1] for n in range(1, 11)}
    assert tiers == {"low", "med", "high"}


@pytest.mark.parametrize("score,expected_tier", [
    (300, "low"), (333, "low"), (334, "med"),
    (500, "med"), (666, "med"), (667, "high"), (1000, "high"),
])
def test_legacy_1_1000_scores_are_unchanged_by_the_dual_scale(score, expected_tier):
    """Existing stored scores must behave exactly as before the change."""
    _, tier, out = resolve_vision_model(score)
    assert (tier, out) == (expected_tier, score)
