"""09-06: hardening for the extension's `browser_action` burst + math/thinking paths.

Three regressions are pinned here, all found against the live 2.6.1 build:

1. `routes_extension` accepted a PARTIAL `browser_action` burst — invalid ops
   were skipped and the survivors still executed, so a dropped `click` left the
   following `type` landing on whatever happened to hold focus. It also never
   applied the 15-action cap to the direct payload path.
2. `_extract_math_expression` matched ordinary prose that merely CONTAINED a
   sum ("search inside my tab, how to solve 1+1"), compiling it into
   `print(search inside my tab, how to solve 1+1)` — a guaranteed SyntaxError
   that surfaced as "I couldn't run that computation safely" and stole the turn
   from `browser_action`.
3. `strip_thinking_tokens` raised `NameError: name 'kw' is not defined` on the
   exact internal-monologue branch it exists to handle (the generator rebound
   the loop variable `s`), so deliberation could reach the user.
"""
import asyncio
import subprocess

import pytest

from server.llm import strip_thinking_tokens
from server.routes_extension import _harden_actions, _search_burst
from server.routes_overlord import _extract_math_expression, _extract_shell_query
from server.screen_vision import _MAX_CONTROL_ACTIONS

VP = {"width": 1280, "height": 800}
SMALL_VP = {"width": 400, "height": 300}

VALID_BURST = [
    {"op": "move", "x": 480, "y": 320},
    {"op": "click", "x": 480, "y": 320, "button": "left"},
    {"op": "type", "text": "how to solve 1+1"},
    {"op": "key", "key": "Enter", "modifiers": []},
]


# ── 1. browser_action JSON shape: allowlist, clamp, cap, all-or-nothing ───────

def test_valid_move_click_type_key_burst_passes_through():
    out = _harden_actions(VALID_BURST, VP)
    assert [op["op"] for op in out] == ["move", "click", "type", "key"]
    assert out[1] == {"op": "click", "x": 480, "y": 320, "button": "left"}
    assert out[2] == {"op": "type", "text": "how to solve 1+1"}
    assert out[3] == {"op": "key", "key": "Enter", "modifiers": []}


def test_scroll_op_normalizes_with_deltas():
    out = _harden_actions([{"op": "scroll", "x": 10, "y": 10, "deltaX": 0, "deltaY": 240}], VP)
    assert out == [{"op": "scroll", "x": 10, "y": 10, "deltaX": 0, "deltaY": 240}]


def test_scroll_without_deltas_drops_the_list():
    assert _harden_actions([{"op": "scroll", "x": 10, "y": 10}], VP) is None


@pytest.mark.parametrize("coords,expected", [
    ({"x": 99999, "y": 10}, (SMALL_VP["width"] - 1, 10)),   # clamped to right edge
    ({"x": -40, "y": 10}, (0, 10)),                          # clamped to left edge
    ({"x": 10, "y": 99999}, (10, SMALL_VP["height"] - 1)),   # clamped to bottom
    ({"x": 10, "y": -40}, (10, 0)),                          # clamped to top
])
def test_coordinates_are_clamped_to_the_viewport(coords, expected):
    out = _harden_actions([dict(op="move", **coords)], SMALL_VP)
    assert (out[0]["x"], out[0]["y"]) == expected


@pytest.mark.parametrize("bad_op", [
    {"op": "exec", "x": 1, "y": 1},                     # not on the allowlist
    {"op": "click", "x": 1, "y": 1, "button": "middle"},  # button not allowed
    {"op": "key", "key": "F13", "modifiers": []},         # key not allowed
    {"op": "type", "text": "   "},                        # empty after strip
    {"op": "move", "x": "left", "y": 1},                  # non-numeric coords
    "not-a-dict",
])
def test_one_invalid_op_drops_the_whole_burst(bad_op):
    """Never a partial burst: a dropped click must not leave the type running."""
    assert _harden_actions(VALID_BURST + [bad_op], VP) is None
    assert _harden_actions([bad_op] + VALID_BURST, VP) is None


def test_action_cap_is_enforced_on_the_direct_payload_path():
    at_cap = [{"op": "move", "x": 1, "y": 1}] * _MAX_CONTROL_ACTIONS
    assert _harden_actions(at_cap, VP) is not None
    assert _harden_actions(at_cap + [{"op": "move", "x": 1, "y": 1}], VP) is None


@pytest.mark.parametrize("empty", [None, [], {}, "actions", 0])
def test_empty_or_non_list_payload_yields_no_actions(empty):
    assert _harden_actions(empty, VP) is None


def test_search_burst_is_derived_from_the_viewport_not_hardcoded():
    """The old fallback hard-coded (480, 320) — outside a small frame."""
    small = _harden_actions(_search_burst("q", SMALL_VP), SMALL_VP)
    assert (small[0]["x"], small[0]["y"]) == (200, 120)
    assert small[0]["x"] < SMALL_VP["width"] and small[0]["y"] < SMALL_VP["height"]

    big = _harden_actions(_search_burst("q", VP), VP)
    assert (big[0]["x"], big[0]["y"]) == (640, 320)
    assert [op["op"] for op in big] == ["move", "click", "type", "key"]
    assert big[2]["text"] == "q"


# ── 2. math path: prose never becomes a shell command; equations solve ────────

@pytest.mark.parametrize("prose", [
    "search inside my tab, how to solve 1+1",
    "look up 2+2 on google for me",
    "open the page about 1+1 please",
])
def test_prose_containing_a_sum_is_not_treated_as_math(prose):
    """Regression: these compiled into print(<prose>) and crashed the sandbox."""
    assert _extract_math_expression(prose) == ""
    assert _extract_shell_query(prose) == ""


@pytest.mark.parametrize("question,expected", [
    ("what is 1+1", "2"),
    ("how to solve 1+1", "2"),
    ("calculate 12*7", "84"),
    ("solve 1+x=2", "x = 1"),
    ("solve 2x+3=11", "x = 4"),
    ("x/4=3", "x = 12"),
])
def test_math_is_answered_by_running_the_sandboxed_command(question, expected):
    """Every answer comes from executing the generated one-liner — never from
    arithmetic done in prompt text. The command must also pass the executor's
    validation gate (_validated_argv) — a command that fails the gate answers
    with 'couldn't run that computation safely' (regression: the linear
    equations generated a `<` redirect metachar and never validated)."""
    from server.overlord_agent import _validated_argv, _compute_shell_command
    cmd = _extract_shell_query(question)
    assert cmd, f"no command generated for {question!r}"
    assert cmd.startswith('python3 -c "')
    assert _validated_argv(cmd) is not None, f"executor rejects its own command: {cmd}"
    assert asyncio.run(_compute_shell_command(cmd)) == expected


def test_linear_equation_without_unique_solution_says_so():
    from server.overlord_agent import _validated_argv, _compute_shell_command
    cmd = _extract_shell_query("solve x+1=x+2")
    assert cmd
    assert _validated_argv(cmd) is not None
    assert asyncio.run(_compute_shell_command(cmd)) == "No unique solution."


@pytest.mark.parametrize("not_math", [
    "click the search bar",
    "open my canvas page",
    "call me on 555-123-4567",
])
def test_non_math_messages_generate_no_command(not_math):
    assert _extract_shell_query(not_math) == ""


# ── 3. thinking-token stripping ──────────────────────────────────────────────

@pytest.mark.parametrize("raw,must_not_contain", [
    ("<think>deliberating hard</think>The answer is 2.", "deliberating"),
    ("<thought>secret</thought>Hello.", "secret"),
    ("<reasoning>chain of thought</reasoning>Hi.", "chain of thought"),
    ("<THINK>upper case</THINK>Done.", "upper case"),
    ("<think>never closed, truncated generation", "never closed"),
])
def test_thinking_blocks_are_stripped(raw, must_not_contain):
    out = strip_thinking_tokens(raw)
    assert must_not_contain not in out
    assert "<think" not in out.lower()


def test_internal_rules_monologue_does_not_crash_and_is_filtered():
    """Regression: this branch raised NameError('kw') and let the monologue through."""
    raw = (
        "We need to follow the system's rules. The user says: solve 1+1. "
        "The instruction says use sandboxed math. The answer is 2."
    )
    out = strip_thinking_tokens(raw)  # must not raise
    assert "we need to follow" not in out.lower()
    assert "the instruction says" not in out.lower()
    assert "The answer is 2." in out


@pytest.mark.parametrize("value", [None, "", "   "])
def test_strip_handles_empty_input(value):
    assert strip_thinking_tokens(value) == ""


def test_clean_reply_is_left_untouched():
    assert strip_thinking_tokens("x = 1") == "x = 1"


# ── 4. regex fallback: browser_action burst derives coords from the viewport ──

def test_regex_fallback_search_burst_is_viewport_derived():
    """The keyword fallback used to hard-code (480, 320) — outside a small
    captured frame. It must derive from the real viewport like _search_burst."""
    from server.routes_overlord import _regex_fallback_intent

    small = _regex_fallback_intent("search for cats", node="extensions", viewport=SMALL_VP)
    assert small["action"] == "browser_action"
    burst = small["payload"]["actions"]
    assert [op["op"] for op in burst] == ["move", "click", "type", "key"]
    assert (burst[0]["x"], burst[0]["y"]) == (200, 120)
    assert all(0 <= a["x"] < SMALL_VP["width"] and 0 <= a["y"] < SMALL_VP["height"]
               for a in burst if "x" in a)

    big = _regex_fallback_intent("search for cats", node="extensions", viewport=VP)
    assert (big["payload"]["actions"][0]["x"], big["payload"]["actions"][0]["y"]) == (640, 320)

    # No viewport supplied -> the default 1280x800 frame, inside it.
    defaults = _regex_fallback_intent("search for cats", node="extensions")
    assert (defaults["payload"]["actions"][0]["x"], defaults["payload"]["actions"][0]["y"]) == (640, 320)


# ── 5. structured agent call: math quick-path answers from the sandbox ────────

class _FakeUser:
    """Minimal user for the deterministic quick-path (never reaches the LLM)."""
    settings = {}
    public_id = "test-lane3-user"
    id = 1


def test_structured_intent_answers_math_from_the_sandbox():
    """'solve 1+x=2' must resolve to run_shell (deterministic, no LLM round)
    and the executed output must be x = 1 — never 'couldn't run that
    computation safely'."""
    from server.overlord_agent import _compute_shell_command
    from server.routes_overlord import _resolve_agent_intent

    intent = asyncio.run(_resolve_agent_intent(
        _FakeUser(), {}, "solve 1+x=2", is_admin=False, node="extensions",
    ))
    assert isinstance(intent, dict)
    assert intent["action"] == "run_shell"
    cmd = intent["payload"]["command"]
    assert cmd.startswith('python3 -c "')
    out = asyncio.run(_compute_shell_command(cmd))
    assert out == "x = 1"

    # A true structured call next: the resolve result for a math message must
    # never carry deliberation text into the reply either.
    assert "think" not in str(intent).lower()
    assert "couldn't run that computation safely" not in str(intent)


def test_no_candidate_math_form_reaches_the_compute_refusal():
    """Regression guard: the refusal string must never surface as the answer
    for any of the supported math forms."""
    from server.overlord_agent import _compute_shell_command
    from server.routes_overlord import _extract_shell_query

    for question in ("solve 1+x=2", "what is 1+1", "calculate 12*7", "what is 5 × 6?"):
        cmd = _extract_shell_query(question)
        assert cmd, f"no command generated for {question!r}"
        out = asyncio.run(_compute_shell_command(cmd))
        assert out, f"computation refused for {question!r}"
        assert "couldn't run that computation safely" not in out


# ── 6. structured agent call: thinking never survives JSON parsing ────────────

def test_safe_json_extract_strips_thinking_before_parse():
    from server.routes_overlord import _safe_json_extract
    raw = ('{"action": "plain_answer", "payload": {}, '
           '"reply": "<think>I am deliberating internally</think>The answer is 2."}')
    parsed = _safe_json_extract(raw)
    assert parsed and parsed["action"] == "plain_answer"
    assert "deliberating" not in parsed["reply"]
    assert "think" not in parsed["reply"].lower()
    assert "The answer is 2." in parsed["reply"]
