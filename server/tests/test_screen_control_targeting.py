"""09-08: the agent must aim before it clicks, and admit it when it doesn't.

Operator report, on platform.deepseek.com/usage: "i saw it briefly display a
cursor, but it couldnt actually fullfull my extremely basic request", and
separately "i had it on manual, and it never asked for my permission".

Three defects behind that, pinned here:

1. TARGETING — the typing fallback clicked the viewport CENTRE and typed into
   whatever held focus. The middle of that page is not a field, so the caret
   landed on dead space and the text went nowhere.
2. HONESTY — a dropped action list produced execution=None, the client skipped
   silently, and the model's own prose ("I am typing that for you now") was the
   only account the user got of a turn where nothing ran.
3. PERMISSION — both agent-mode branches in routes_extension return before the
   permission gate further down the module, so manual mode was never consulted
   for the one capability that touches the user's machine.
"""
import pytest

from server.routes_extension import (
    _describe_control_actions,
    _execution_verdict,
    _screen_control_allowed,
)
from server.screen_vision import find_input_target, parse_interactive_elements

VP = {"width": 1280, "height": 800}

ANALYSIS = """The page shows a usage dashboard with a chart and a nav rail.

INTERACTIVE ELEMENTS:
- Sidebar toggle (button) at x=32, y=48
- Search bar (textbox) at x=640, y=112
- Upgrade plan (button) at x=900, y=300
- Sign out (link) at x=1180, y=48
"""


# ── 1. parse_interactive_elements ─────────────────────────────────────────────

def test_every_listed_element_is_parsed_with_its_coordinates():
    els = parse_interactive_elements(ANALYSIS)
    assert [e["name"] for e in els] == [
        "Sidebar toggle", "Search bar", "Upgrade plan", "Sign out",
    ]
    assert els[1] == {"name": "Search bar", "role": "textbox", "x": 640, "y": 112}


def test_elements_are_read_wherever_they_appear_not_only_after_the_heading():
    """Models inline the list as often as they emit the section verbatim."""
    inline = "I can see a Search bar (textbox) at x=100, y=200 near the top."
    assert parse_interactive_elements(inline) == [
        {"name": "Search bar", "role": "textbox", "x": 100, "y": 200},
    ]


@pytest.mark.parametrize("junk", [
    None, "", "   ", 42, {"elements": []},
    "INTERACTIVE ELEMENTS:\n- nothing usable here\n",
    "Search bar (textbox) at x=abc, y=200",
])
def test_unparseable_analysis_yields_no_elements_and_never_raises(junk):
    assert parse_interactive_elements(junk) == []


# ── 2. find_input_target ──────────────────────────────────────────────────────

def test_the_typable_element_wins_over_buttons_and_links():
    assert find_input_target(ANALYSIS, viewport=VP) == {
        "name": "Search bar", "role": "textbox", "x": 640, "y": 112,
    }


def test_a_page_with_no_typable_element_returns_none():
    """This is the whole fix: no target -> the caller reports a miss instead of
    clicking at a guessed point."""
    buttons_only = (
        "INTERACTIVE ELEMENTS:\n"
        "- Upgrade plan (button) at x=900, y=300\n"
        "- Sign out (link) at x=1180, y=48\n"
    )
    assert find_input_target(buttons_only, viewport=VP) is None
    assert find_input_target(None, viewport=VP) is None


def test_elements_outside_the_captured_frame_are_discarded():
    off = "INTERACTIVE ELEMENTS:\n- Search bar (textbox) at x=980, y=640\n"
    assert find_input_target(off, viewport={"width": 400, "height": 300}) is None
    assert find_input_target(off, viewport=VP) is not None


def test_the_users_own_words_break_the_tie_between_two_fields():
    two = (
        "INTERACTIVE ELEMENTS:\n"
        "- Message input (textbox) at x=640, y=700\n"
        "- Search bar (textbox) at x=640, y=112\n"
    )
    assert find_input_target(two, hint="send a message to my group")["name"] == "Message input"
    assert find_input_target(two, hint="search for cereal")["name"] == "Search bar"


# ── 3. execution verdict: never silent, never a phantom success ───────────────

def test_actions_that_ran_report_success_with_their_count():
    verdict = _execution_verdict([{"op": "click", "x": 1, "y": 1}], "")
    assert verdict == {"status": "success", "actions_count": 1}


@pytest.mark.parametrize("reason", [
    "no_block", "malformed_json", "wrong_shape", "over_cap",
    "invalid_op", "empty", "no_target",
])
def test_every_drop_reason_produces_a_failure_the_user_can_read(reason):
    verdict = _execution_verdict(None, reason)
    assert verdict["status"] == "failed"
    assert verdict["actions_count"] == 0
    assert verdict["reason"] == reason
    assert verdict["detail"] and verdict["detail"][0].isupper()


def test_an_unknown_reason_still_says_that_nothing_ran():
    verdict = _execution_verdict([], "something_new")
    assert verdict["status"] == "failed"
    assert "nothing was done" in verdict["detail"].lower()


def test_the_approval_card_names_the_real_ops_and_quotes_the_real_text():
    """'The agent would like to perform an action' is not informed consent."""
    summary = _describe_control_actions([
        {"op": "move", "x": 640, "y": 112},
        {"op": "click", "x": 640, "y": 112, "button": "left"},
        {"op": "type", "text": "applejack cereal"},
        {"op": "key", "key": "Enter", "modifiers": []},
    ])
    assert "click at 640,112" in summary
    assert 'type "applejack cereal"' in summary
    assert "press Enter" in summary


def test_a_long_burst_is_summarised_without_hiding_its_size():
    summary = _describe_control_actions([{"op": "move", "x": 1, "y": 1}] * 9)
    assert "(+3 more)" in summary


def test_no_actions_means_no_card_text():
    assert _describe_control_actions(None) == ""
    assert _describe_control_actions([]) == ""


# ── 4. permission gate: manual asks before anything touches the screen ────────

@pytest.mark.parametrize("mode,should_ask", [
    ("manual", True),    # asks for every action, screen control included
    ("automatic", False),  # browser_action is routine, not critical
    ("yolo", False),     # never asks — the user's explicit choice
])
def test_screen_control_follows_the_users_permission_mode(mode, should_ask):
    allowed, reason = _screen_control_allowed({}, mode)
    assert allowed is (not should_ask)
    assert isinstance(reason, str)


def test_the_request_mode_overrides_the_saved_setting():
    """The popup's mode selector is the live one — a stale saved 'yolo' must not
    let the agent run when the user has switched to manual for this turn."""
    saved_yolo = {"operation_mode": "yolo"}
    assert _screen_control_allowed(saved_yolo, "manual")[0] is False
    assert _screen_control_allowed(saved_yolo, None)[0] is True


def test_the_saved_setting_is_used_when_the_request_names_no_mode():
    assert _screen_control_allowed({"operation_mode": "manual"}, None)[0] is False
    assert _screen_control_allowed({"operation_mode": "automatic"}, "")[0] is True
