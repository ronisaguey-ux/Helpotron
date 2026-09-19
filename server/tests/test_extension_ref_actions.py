"""09-11: DOM-ref control ops survive server validation and describe correctly.

Regression pinned here, found while fixing the extension's "cursor clicks
blindly, nothing happens" report:

The 09-10 accuracy upgrade made the server advertise
`{"op":"click","ref":N}` as the preferred form (each LIVE DOM ELEMENTS line
carries a ref), but `_validate_op` still required x/y for every click. A
ref-only op therefore came back as `invalid_op`, and because the burst is
all-or-nothing the WHOLE action list was dropped: the model followed the
instructions it was given and nothing ran at all. These tests hold the ref
path open — acceptance, normalization, fallback to x/y, and the approval
card's description — while asserting a malformed ref still drops the list.
"""
from server.routes_extension import _describe_control_actions, _harden_actions
from server.screen_vision import extract_control_actions_ex

VP = {"width": 1280, "height": 800}


def _fence(actions_json: str) -> str:
    return f"on it\n```control\n{actions_json}\n```"


# ── acceptance + normalization ────────────────────────────────────────────────

def test_click_by_ref_is_accepted_and_keeps_the_default_button():
    out = _harden_actions([{"op": "click", "ref": 3}], VP)
    assert out == [{"op": "click", "ref": 3, "button": "left"}]


def test_click_by_ref_honours_an_explicit_button():
    out = _harden_actions([{"op": "click", "ref": 7, "button": "right"}], VP)
    assert out == [{"op": "click", "ref": 7, "button": "right"}]


def test_move_and_dblclick_by_ref_are_accepted():
    out = _harden_actions([{"op": "move", "ref": 0}, {"op": "dblclick", "ref": 12}], VP)
    assert out == [{"op": "move", "ref": 0}, {"op": "dblclick", "ref": 12}]


def test_ref_is_not_clamped_and_survives_a_tiny_viewport():
    """A ref is resolved against the live DOM at dispatch — the viewport box
    the server clamps x/y into has nothing to say about it."""
    out = _harden_actions([{"op": "click", "ref": 59}], {"width": 10, "height": 10})
    assert out == [{"op": "click", "ref": 59, "button": "left"}]


def test_numeric_string_ref_is_coerced():
    out = _harden_actions([{"op": "click", "ref": "4"}], VP)
    assert out == [{"op": "click", "ref": 4, "button": "left"}]


def test_integral_float_ref_is_coerced():
    out = _harden_actions([{"op": "click", "ref": 5.0}], VP)
    assert out == [{"op": "click", "ref": 5, "button": "left"}]


def test_ref_preferred_over_x_y_when_both_present():
    """When the model gives both, the exact anchor wins — the x/y estimate is
    exactly what the DOM list tells it not to use."""
    out = _harden_actions([{"op": "click", "ref": 2, "x": 99999, "y": 99999}], VP)
    assert out == [{"op": "click", "ref": 2, "button": "left"}]


def test_a_burst_mixing_ref_and_coordinate_ops_passes():
    out = _harden_actions([
        {"op": "click", "ref": 1},
        {"op": "type", "text": "hello"},
        {"op": "click", "x": 480, "y": 320, "button": "left"},
    ], VP)
    assert [op["op"] for op in out] == ["click", "type", "click"]
    assert out[0] == {"op": "click", "ref": 1, "button": "left"}
    assert out[2] == {"op": "click", "x": 480, "y": 320, "button": "left"}


# ── fallback + rejection still behave ─────────────────────────────────────────

def test_click_without_ref_falls_back_to_clamped_coordinates():
    out = _harden_actions([{"op": "click", "x": 99999, "y": 10}], {"width": 400, "height": 300})
    assert out == [{"op": "click", "x": 399, "y": 10, "button": "left"}]


# ── semantic target (Stagehand-style grounding, 2026-09-14) ────────────────────

def test_click_by_target_is_accepted_and_kept():
    out = _harden_actions([{"op": "click", "target": "Search button"}], VP)
    assert out == [{"op": "click", "target": "Search button", "button": "left"}]


def test_move_and_dblclick_by_target_are_accepted():
    out = _harden_actions(
        [{"op": "move", "target": "Foo"}, {"op": "dblclick", "target": "Bar"}], VP)
    assert out == [
        {"op": "move", "target": "Foo"},
        {"op": "dblclick", "target": "Bar"},
    ]


def test_target_preferred_over_x_y_but_ref_wins_over_target():
    # ref is the most precise anchor; target beats a coordinate estimate.
    assert _harden_actions([{"op": "click", "ref": 1, "target": "X", "x": 9, "y": 9}], VP) == [
        {"op": "click", "ref": 1, "button": "left"}]
    assert _harden_actions([{"op": "click", "target": "X", "x": 9, "y": 9}], VP) == [
        {"op": "click", "target": "X", "button": "left"}]


def test_empty_target_drops_the_list():
    for bad in ({"op": "click", "target": ""}, {"op": "click", "target": "   "},
                {"op": "click", "target": 5}):
        assert _harden_actions([bad], VP) is None, bad


def test_click_with_neither_ref_nor_coordinates_drops_the_list():
    assert _harden_actions([{"op": "click"}], VP) is None


def test_ref_with_bad_button_drops_the_list():
    assert _harden_actions([{"op": "click", "ref": 1, "button": "middle"}], VP) is None


def test_malformed_refs_drop_the_whole_burst():
    """All-or-nothing still holds for STATE ops: a nonsense ref must never let
    the rest run. A malformed ref on a `move` is skipped on its own instead —
    a move changes nothing on the page, so it cannot leave a type half-run
    (see test_a_bad_move_ref_is_skipped_not_fatal)."""
    for bad in ({"op": "click", "ref": -1}, {"op": "click", "ref": True},
                {"op": "click", "ref": "three"}, {"op": "click", "ref": 1.5},
                {"op": "dblclick", "ref": None}):
        assert _harden_actions([bad], VP) is None, bad
        assert _harden_actions(
            [{"op": "type", "text": "x"}] + [bad], VP
        ) is None, bad


def test_a_bad_move_ref_is_skipped_not_fatal():
    """A move with a nonsense ref is dropped; the real work still runs.

    One bad op used to fail the entire burst — which is how a model writing a
    scroll or a move the validator disliked lost its clicks as well, and the
    page never moved at all. That is the "it doesn't scroll" report.
    """
    bad = {"op": "move", "ref": -2}
    assert _harden_actions([bad], VP) is None          # nothing left to run
    out = _harden_actions([{"op": "type", "text": "x"}] + [bad], VP)
    assert out == [{"op": "type", "text": "x"}]
    out2 = _harden_actions([bad, {"op": "click", "x": 5, "y": 5}], VP)
    assert [op["op"] for op in out2] == ["click"]


# ── the control fence path the model actually uses ────────────────────────────

def test_extract_control_actions_ex_keeps_a_ref_only_block():
    clean, actions, reason = extract_control_actions_ex(
        _fence('[{"op":"click","ref":3}]'), VP)
    assert reason == ""
    assert actions == [{"op": "click", "ref": 3, "button": "left"}]
    assert "```" not in clean


def test_extract_control_actions_ex_reports_invalid_op_for_a_bad_ref():
    _, actions, reason = extract_control_actions_ex(
        _fence('[{"op":"click","ref":"nope"}]'), VP)
    assert actions is None
    assert reason == "invalid_op"


# ── approval card description ─────────────────────────────────────────────────

def test_describe_control_actions_names_the_ref_target():
    line = _describe_control_actions([
        {"op": "click", "ref": 5, "button": "left"},
        {"op": "type", "text": "essay"},
    ])
    assert "click element [5]" in line
    assert 'type "essay"' in line


def test_describe_control_actions_keeps_coordinates_for_plain_clicks():
    line = _describe_control_actions([{"op": "click", "x": 10, "y": 20, "button": "left"}])
    assert line == "click at 10,20"
