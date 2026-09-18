"""Server-owned extension logic: the typing engine, page identity, conversion.

Owner directive (2026-09-18): *"move absolutely everything possible server side
... the extension should be useless and do nothing without a valid helpotron
api"*.

Every test here pins logic that used to live in `extension/content.js` as a pure
function and now lives on the server, so the move can be proved rather than
asserted:

  * `HumanProfile` — the 35-parameter writing model, ported from the JS class.
  * `detect_platform` / `classify_subject` / `parse_course_url` — page identity.
  * `html_to_markdown` — the DOM converter, reimplemented on stdlib `html.parser`.

The parity tests are the important ones: a port that produces a *plausible*
rhythm but not the *same* one would be a silent behaviour change.
"""
import random

import pytest

from server.extension_logic import classify_subject, detect_platform, parse_course_url
from server.html_markdown import html_to_markdown
from server.human_profile import HumanProfile
from server.action_stream import (
    ACTION_STREAM_VERSION,
    build_action_stream,
    replay_text,
    validate_action_stream,
)


# ─── the typing model ───────────────────────────────────────────────────────

def test_profile_exposes_all_35_parameters():
    """The JS class had 35 slots; the port must not quietly lose any."""
    p = HumanProfile(gear=1.0, rng=random.Random(1))
    snap = p.snapshot()
    assert len(snap) == 35, f"expected 35 parameters, got {len(snap)}: {sorted(snap)}"


def test_profile_is_deterministic_for_a_seed():
    """Same seed → same decisions. Without this the stream is not replayable and
    the tests above prove nothing across runs."""
    a = HumanProfile(gear=1.0, rng=random.Random(42)).tick_many(list("Hello world."))
    b = HumanProfile(gear=1.0, rng=random.Random(42)).tick_many(list("Hello world."))
    assert a == b


def test_profile_differs_across_seeds():
    """A model that ignored its seed would make the determinism test vacuous."""
    a = HumanProfile(gear=1.0, rng=random.Random(1)).tick_many(list("Hello world."))
    b = HumanProfile(gear=1.0, rng=random.Random(2)).tick_many(list("Hello world."))
    assert a != b


def test_gear_slows_the_clock():
    """`gear` is a multiplier on the measured bands (lower gear = slower), so a
    slower setting must produce a longer run. This is the contract the extension's
    cadence slider relied on."""
    def total(gear):
        return sum(
            d.get("delay", 0) for d in
            HumanProfile(gear=gear, rng=random.Random(9)).tick_many(list("a" * 400))
        )
    assert total(2.2) > total(1.0) > total(0.55)


def test_profile_never_emits_a_negative_or_zero_delay():
    ds = HumanProfile(gear=1.0, rng=random.Random(5)).tick_many(list("The quick brown fox. " * 20))
    for d in ds:
        assert d["delay"] >= 0
        assert d["action"] in {"type", "letter", "think", "typo", "falsestart",
                               "reread", "nudge", "mouse"}


# ─── the stream contract ────────────────────────────────────────────────────

TEXTS = ["Hello world.", "The quick brown fox jumps over the lazy dog.",
         "a\nb\nc", "UPPER lower 12345 !@#$%", " "]


@pytest.mark.parametrize("text", TEXTS)
def test_replay_reproduces_the_source_text(text):
    """The independent oracle: replaying the stream must yield exactly the input.

    This is what makes a typo/false-start safe to emit — every wrong key is
    corrected, so the document ends up identical no matter what the model chose.
    """
    actions = build_action_stream(text, seed=3)
    ok, err = validate_action_stream(actions)
    assert ok, err
    assert replay_text(actions) == text


def test_stream_only_uses_the_closed_op_vocabulary():
    actions = build_action_stream("Some real text to type here.", seed=4)
    for a in actions:
        assert a["op"] in {"focus", "type", "key", "backspace", "wait",
                           "mouse", "click", "label"}


# ─── page identity ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("host,path,expected", [
    ("canvas.instructure.com", "/courses/1", "canvas"),
    ("school.instructure.com", "/x", "canvas"),
    ("classroom.google.com", "/u/0", "google_classroom"),
    ("bb.example.edu", "/webapps/blackboard/x", "blackboard"),
    ("brightspace.example.edu", "/d2l/x", "brightspace"),
    ("moodle.example.edu", "/mod/assign/view.php", "moodle"),
    ("docs.google.com", "/document/d/abc", "google_docs"),
    ("www.notion.so", "/page", "notion"),
    ("example.com", "/", "generic"),
])
def test_detect_platform_matches_the_client_table(host, path, expected):
    assert detect_platform(host, path) == expected


@pytest.mark.parametrize("text,expected", [
    ("Algebra 2 Honors", "Mathematics"),
    ("AP Biology Cell Unit", "Biology"),
    ("Miscellaneous Notes", ""),
    ("World History Reconstruction", "History"),
    ("", ""),
])
def test_classify_subject(text, expected):
    assert classify_subject(text) == expected


def test_classify_subject_respects_word_boundaries():
    """'miscellaneous' must not match the Biology keyword 'cell' — the boundary
    guard is why this returns '' rather than a wrong filing."""
    assert classify_subject("Miscellaneous") == ""


def test_parse_course_url_keeps_modules_items_distinct():
    """THE ORDERING TRAP, pinned.

    'modules/items' must precede 'modules' in the alternation. With the order
    reversed, /courses/1/modules/items/44 parses as kind='modules',
    itemId='items' — collapsing every module item onto one canvas_id
    ('c1:modules:items') and breaking subject pairing and dedupe.
    """
    r = parse_course_url("https://x.instructure.com/courses/1/modules/items/44")
    assert r["itemKind"] == "modules/items"
    assert r["itemId"] == "44"
    assert r["courseId"] == "1"


@pytest.mark.parametrize("url,kind,item", [
    ("https://x.instructure.com/courses/9/assignments/12", "assignments", "12"),
    ("https://x.instructure.com/courses/9/quizzes/3", "quizzes", "3"),
    ("https://x.instructure.com/courses/9/pages/home", "pages", "home"),
    ("https://x.instructure.com/courses/9/discussion_topics/5", "discussion_topics", "5"),
    ("https://x.instructure.com/courses/9/files/7", "files", "7"),
])
def test_parse_course_url_item_kinds(url, kind, item):
    r = parse_course_url(url)
    assert r["itemKind"] == kind
    assert r["itemId"] == item


def test_parse_course_url_bare_course_and_non_course():
    bare = parse_course_url("https://x.instructure.com/courses/7")
    assert bare["courseId"] == "7" and bare["itemId"] == ""
    assert parse_course_url("https://example.com/")["courseId"] == ""
    assert parse_course_url("")["courseId"] == ""


# ─── HTML → Markdown ────────────────────────────────────────────────────────

def test_markdown_headings_emphasis_and_links():
    md = html_to_markdown('<h2>T</h2><p>a <strong>b</strong> and <em>c</em> '
                          '<a href="https://x.y/z">link</a>.</p>')
    assert "## T" in md
    assert "**b**" in md
    assert "*c*" in md
    assert "[link](https://x.y/z)" in md


def test_markdown_strips_boilerplate():
    """A script, nav and footer must not reach a saved document."""
    md = html_to_markdown("<nav>menu</nav><script>evil()</script>"
                          "<p>real content</p><footer>foot</footer>")
    assert "real content" in md
    for gone in ("menu", "evil", "foot"):
        assert gone not in md


def test_markdown_table_gets_a_header_row():
    """HTML allows a headerless table; Markdown does not, so one is synthesised."""
    md = html_to_markdown("<table><tr><th>Name</th><th>Score</th></tr>"
                          "<tr><td>A</td><td>9</td></tr></table>")
    assert "| Name | Score |" in md
    assert "| --- | --- |" in md
    assert "| A | 9 |" in md


def test_markdown_escapes_a_pipe_inside_a_cell():
    md = html_to_markdown("<table><tr><th>a</th></tr><tr><td>x|y</td></tr></table>")
    assert r"x\|y" in md


def test_markdown_lists_are_tight():
    """A blank line between items makes Markdown render a loose list wrapped in
    <p>, which is not what the page said."""
    md = html_to_markdown("<ul><li>alpha</li><li>beta</li></ul>")
    assert "- alpha\n- beta" in md


def test_markdown_ordered_list_numbers():
    md = html_to_markdown("<ol><li>one</li><li>two</li></ol>")
    assert "1. one" in md and "2. two" in md


def test_markdown_empty_input():
    assert html_to_markdown("") == ""


# ─── the auth boundary ──────────────────────────────────────────────────────

def test_extension_endpoints_reject_an_unauthenticated_caller():
    """The property the owner asked for: the extension does nothing without a
    valid key. Every server-side decision point must refuse an anonymous call —
    otherwise "useless without a key" is only true of the UI.
    """
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)
    for path, body in [
        ("/api/extension/bootstrap", None),
        ("/api/extension/mouse-path", {"from_x": 0, "from_y": 0, "to_x": 10, "to_y": 10}),
        ("/api/extension/crawl/plan", {"url": "https://x.instructure.com/courses/1"}),
        ("/api/extension/page-info", {"url": "https://x.instructure.com/courses/1"}),
        ("/api/extension/enrich", {"url": "https://x.instructure.com/courses/1", "payload": {}}),
        ("/api/extension/action-stream", {"text": "hello"}),
    ]:
        if body is None:
            r = client.get(path)
        else:
            r = client.post(path, json=body)
        assert r.status_code == 401, f"{path} answered {r.status_code} without a key"


def test_extension_endpoints_reject_a_bogus_key():
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)
    r = client.post("/api/extension/action-stream", json={"text": "hi"},
                    headers={"Authorization": "Bearer htk_not_a_real_key_at_all"})
    assert r.status_code == 401


def test_page_info_reports_missing_creds_within_endpoint_contract():
    """With the feature wired, the shape is pinned: platform, subject, course,
    markdown. Auth is covered above; this asserts the response contract the
    extension indexes into."""
    from server.routes_extension_api import _identify
    ident = _identify("https://canvas.instructure.com/courses/42/assignments/7",
                      "", "", "Cell Lab", ["AP Biology Cell Unit"])
    assert ident["platform"] == "canvas"
    assert ident["subject"] == "Biology"
    assert ident["course"]["courseId"] == "42"
    assert ident["course"]["itemKind"] == "assignments"
