"""Extension logic, server-side (owner 2026-09-17).

Owner: *"migrate all possible logic to be completed by a helpotron api and have
the extension be PURE ui"*.

The extension stays a dumb renderer plus a Chrome-API bridge: it captures
screens/frames, dispatches input events, and displays what it is told. Every
decision — what to click, where the cursor bows, which links are in scope,
whether robots.txt allows a path, how a page maps onto an assignment — is made
here, where it can be tested, changed, and shipped without a store review.

Two modules moved wholesale from the extension, because both were already pure
and deterministic and there was never a reason for them to live in a browser:

  * `mouse_path.js`  -> human_move_points() / human_move_chain()
  * `crawl-core.js`  -> course_scope_of() / is_scoped_content_url() /
                        is_robots_allowed() / collect_index_links()
                        / build_assignment_payload()

The contracts are preserved EXACTLY, including the humanlike-motion numbers,
because the extension replays these samples verbatim and any drift changes what
a monitored page sees.
"""
from __future__ import annotations

import math
import random
import re
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple
from urllib.parse import unquote, urljoin, urlsplit, urlparse


# ── Humanlike mouse motion (ported from extension/mouse_path.js) ─────────────
# Contract preserved exactly (operator spec 09-01):
#   * cubic bezier, TWO control points offset PERPENDICULAR to the travel line
#     by 8-18% of the distance, alternating side per move,
#   * duration = clamp(260 + dist * 0.35, 300, 950) ms,
#   * ease-in-out, optional <=3px overshoot at the end,
#   * sampled every ~10-16 ms, no consecutive gap beyond max(40, dist/6),
#   * at least 4 intermediate points,
#   * first sample AT the start, LAST sample EXACTLY at (toX, toY),
#   * ~3% of moves get a 2-6 px micro-adjust settle.
#
# The randomness is injectable so a test can pin it; production passes nothing
# and gets real jitter.

def _rand(lo: float, hi: float, rng: Callable[[], float]) -> float:
    return lo + rng() * (hi - lo)


def _bez(p0, p1, p2, p3, t: float) -> Tuple[float, float]:
    u = 1.0 - t
    a = u * u * u
    b = 3 * u * u * t
    c = 3 * u * t * t
    d = t * t * t
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])


def _ease_in_out(t: float) -> float:
    return 2 * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 2) / 2.0


def human_move_points(from_x: float, from_y: float, to_x: float, to_y: float,
                      rng: Optional[Callable[[], float]] = None,
                      side: Optional[int] = None) -> List[Dict[str, float]]:
    """Full sampled path for one humanlike mouse move.

    Returns [{x, y, t}] with strictly increasing t (ms); [0] is exactly the
    start at t=0 and the last sample is exactly the target at t=duration.
    """
    rng = rng or random.random
    fx, fy = float(from_x or 0), float(from_y or 0)
    tx, ty = float(to_x or 0), float(to_y or 0)

    dx, dy = tx - fx, ty - fy
    dist = math.hypot(dx, dy)
    if dist < 0.25:
        # Already there — one absolute step, no jump.
        return [{"x": tx, "y": ty, "t": 0.0}]

    duration = min(950.0, max(300.0, 260.0 + dist * 0.35))

    n_x = (-dy / dist) if dist > 0 else 0.0
    n_y = (dx / dist) if dist > 0 else 0.0
    if side is None:
        bow = 1 if rng() < 0.5 else -1
    else:
        bow = 1 if side > 0 else -1

    off = dist * _rand(0.08, 0.18, rng) * bow
    u1 = _rand(0.25, 0.40, rng)
    u2 = _rand(0.60, 0.78, rng)
    p0 = (fx, fy)
    p3 = (tx, ty)
    p1 = (fx + dx * u1 + n_x * off, fy + dy * u1 + n_y * off)
    p2 = (fx + dx * u2 + n_x * off * _rand(0.7, 1.3, rng),
          fy + dy * u2 + n_y * off * _rand(0.7, 1.3, rng))

    dt = _rand(10, 16, rng)
    gap_cap = max(40.0, dist / 6.0)
    if dt > gap_cap:
        dt = gap_cap

    points: List[Dict[str, float]] = [{"x": fx, "y": fy, "t": 0.0}]
    count = max(4, int(round(duration / dt)))
    for i in range(1, count + 1):
        t_norm = i / (count + 1)
        px, py = _bez(p0, p1, p2, p3, _ease_in_out(t_norm))
        points.append({"x": px, "y": py, "t": t_norm * duration})
    points.append({"x": tx, "y": ty, "t": duration})

    if rng() < 0.03:
        mag = _rand(2, 6, rng)
        ox, oy = n_x * mag * bow, n_y * mag * bow
        k = _rand(0.25, 0.6, rng)
        settle_ms = min(min(140.0, duration * 0.18), gap_cap / max(k, 1 - k))
        points.append({"x": tx + ox * k, "y": ty + oy * k, "t": duration + settle_ms * k})
        points.append({"x": tx, "y": ty, "t": duration + settle_ms})

    return points


def human_move_chain(stops: Iterable[Dict[str, float]],
                     from_xy: Optional[Dict[str, float]] = None,
                     rng: Optional[Callable[[], float]] = None) -> List[Dict[str, float]]:
    """Walk several targets as one continuous, strictly-increasing timeline.

    The bow side alternates per segment so a multi-op drive never repeats the
    same arch, and each segment's first sample is dropped after the first so the
    cursor never teleports and t stays strictly increasing.
    """
    rng = rng or random.random
    cx = float((from_xy or {}).get("x", 0) or 0)
    cy = float((from_xy or {}).get("y", 0) or 0)
    acc = 0.0
    out: List[Dict[str, float]] = []
    bow = 1 if rng() < 0.5 else -1
    for stop in (stops or []):
        pts = human_move_points(cx, cy, stop.get("x", 0), stop.get("y", 0),
                                rng=rng, side=bow)
        for i, p in enumerate(pts):
            if i == 0 and out:
                continue
            out.append({"x": p["x"], "y": p["y"], "t": acc + p["t"]})
        acc += pts[-1]["t"]
        cx, cy = float(stop.get("x", 0) or 0), float(stop.get("y", 0) or 0)
        bow = -bow
    return out


# ── Crawl scope and robots (ported from extension/crawl-core.js) ─────────────
# Scope of one crawl = one origin + one Canvas course id. Only URLs inside that
# scope, and inside gradeable/content sections, may ever be scraped — the
# crawler must never wander the open internet. This rule belongs on the server
# because it is a security boundary, not a UI concern.

_COURSE_RE = re.compile(r"^/courses/(\d+)")
_CONTENT_RE = re.compile(
    r"^(assignments/|quizzes/|pages/|discussion_topics/|modules/(items/)?|files/)")
_ITEM_RE = re.compile(
    r"^(assignments|quizzes|pages|discussion_topics|modules/items|files)/[^/?#]")
_INDEX_RE = re.compile(
    r"^(assignments|modules|pages|quizzes|discussion_topics)(\?[^?#]*)?$")


def course_scope_of(url: str) -> Optional[Dict[str, str]]:
    try:
        u = urlparse(url)
    except Exception:
        return None
    m = _COURSE_RE.match(u.path or "")
    if not m:
        return None
    origin = f"{u.scheme}://{u.netloc}"
    return {"origin": origin, "course_id": m.group(1),
            "course_url": f"{origin}/courses/{m.group(1)}"}


def is_scoped_content_url(raw_url: str, scope: Optional[Dict[str, str]]) -> bool:
    if not scope or not raw_url:
        return False
    try:
        u = urlparse(raw_url)
    except Exception:
        return False
    origin = f"{u.scheme}://{u.netloc}"
    if origin != scope.get("origin"):
        return False
    base = f"/courses/{scope.get('course_id')}/"
    if not (u.path or "").startswith(base):
        return False
    rest = u.path[len(base):]
    if not rest:
        return False          # the course home itself carries no content
    return bool(_CONTENT_RE.match(rest))


def is_robots_allowed(robots_text: str, crawl_path: str) -> bool:
    """Conservative robots.txt check: a Disallow under ANY user-agent blocks us.
    A missing or unparseable robots.txt defaults to allowed."""
    for raw in (robots_text or "").split("\n"):
        line = re.sub(r"\s+#.*$", "", raw).strip()
        if not line or not line.lower().startswith("disallow:"):
            continue
        rule = line.split(":", 1)[1].strip()
        if not rule:
            continue
        pattern = re.escape(rule).replace(r"\*", ".*")
        try:
            if re.match(f"^{pattern}", crawl_path):
                return False
        except re.error:
            continue
    return True


def collect_index_links(html: str, scope: Dict[str, str],
                        out: Optional[List[str]] = None) -> List[str]:
    """Pull content URLs out of an index page into `out`; returns paginated
    index URLs to visit next."""
    extra: List[str] = []
    if out is None:
        out = []
    if not html:
        return extra

    base_url = scope.get("course_url") or ""
    course_id = scope.get("course_id") or ""
    base_path = f"/courses/{course_id}/"

    for m in re.finditer(r"""href\s*=\s*["']([^"']+)["']""", html):
        href = m.group(1)
        if not href or href.startswith("javascript:") or href.startswith("#"):
            continue
        try:
            absolute = urljoin(base_url, href)
        except Exception:
            continue
        u = urlparse(absolute)
        origin = f"{u.scheme}://{u.netloc}"
        if origin != scope.get("origin"):
            continue
        path = u.path or ""
        if not path.startswith(base_path):
            continue
        rest = path[len(base_path):]

        if _ITEM_RE.match(rest):
            canon = f"{origin}{path}"
            if canon not in out:
                out.append(canon)
            continue

        if _INDEX_RE.match(rest + (f"?{u.query}" if u.query else "")):
            page_no = re.search(r"[?&]page=(\d+)", u.query or "")
            if page_no and 1 < int(page_no.group(1)) <= 4:
                extra.append(absolute)
    return extra


def build_assignment_payload(data: Dict[str, Any], public_id: str) -> Dict[str, Any]:
    """Attribution for one scraped page.

    The Canvas context identifies which assignment/course the page came from so
    the server dedupes on canvas_id and the material lands in the right bubble.
    Non-course pages send no canvas_id and fall back to subject keywords.
    """
    data = data or {}
    meta = data.get("meta") or {}
    canvas_id = ""
    if meta.get("courseId") and meta.get("itemId") and meta.get("itemKind"):
        canvas_id = f"c{meta['courseId']}:{meta['itemKind']}:{meta['itemId']}"
    return {
        "public_id": public_id,
        "canvas_id": canvas_id,
        "title": data.get("title") or "Scraped Coursework",
        "due_date": data.get("dueDate") or "",
        "prompt": data.get("prompt") or "",
        "file_urls": data.get("files") or [],
        "files_meta": data.get("filesWithMeta") or [],
        "instruction": data.get("instruction") or "",
        "rubric": data.get("rubric") or "",
        "subject": meta.get("subject") or "",
        "course_name": meta.get("courseName") or "",
        "course_code": meta.get("courseCode") or "",
        "source_url": data.get("url") or "",
    }


# ── Spinner verbs (owner 2026-09-17) ─────────────────────────────────────────
# "for the user, just let add a bunch of spinner verbs to hide that their not
# currently in use, like 'thinking' 'assessing the task' 'calculating'
# 'assembling' 'verifying' etc so the user doesnt get pissed if their thing is
# taking a while". The server picks the verb so the wording can be changed
# without shipping a new extension build.
SPINNER_VERBS = [
    "Thinking",
    "Assessing the task",
    "Reading the page",
    "Planning the approach",
    "Calculating",
    "Gathering context",
    "Assembling the answer",
    "Checking the details",
    "Verifying",
    "Cross-referencing",
    "Tightening the wording",
    "Double-checking",
    "Almost there",
]


def spinner_verb(seed: Optional[int] = None) -> str:
    """One verb from the rotation. Deterministic when seeded (tests)."""
    rng = random.Random(seed) if seed is not None else random
    return rng.choice(SPINNER_VERBS)


def spinner_verbs(count: int = 6, seed: Optional[int] = None) -> List[str]:
    """A fresh, non-repeating rotation for one task, so the label can change
    every few seconds without the user seeing the same word twice in a row."""
    rng = random.Random(seed) if seed is not None else random
    pool = list(SPINNER_VERBS)
    rng.shuffle(pool)
    return pool[:max(1, min(count, len(pool)))]


# ══════════════════════════════════════════════════════════════════════════════
# Page identity + attribution — moved off the extension (owner 2026-09-18)
#
# These three were pure functions living in `content.js` (`detectPlatform`,
# `classifySubject`, `parseCourseUrl`). They decide WHICH scraper runs, what
# subject a page belongs to, and which course an item is filed under — i.e. they
# decide where a user's material lands. On the server they can be corrected by a
# deploy instead of a Chrome Web Store review, and a modified client cannot
# loosen them.
#
# All three are pure: input is a host/path/url/text string, output is a plain
# value. No DOM, so they move cleanly.
# ══════════════════════════════════════════════════════════════════════════════

# The recognised LMS surfaces, in the SAME precedence order content.js used.
# Order matters: a host matching two rules must resolve to the first.
_PLATFORM_RULES: List[Tuple[str, Tuple[str, ...], Tuple[str, ...]]] = [
    # (platform, host substrings, path substrings)
    ("canvas", ("instructure.com", "canvas"), ()),
    ("google_classroom", ("classroom.google.com",), ()),
    ("blackboard", ("blackboard", "bb."), ("/webapps/blackboard",)),
    ("brightspace", ("brightspace", "d2l"), ()),
    ("moodle", ("moodle",), ("/mod/assign/",)),
    ("schoology", ("schoology",), ()),
    ("google_docs", ("docs.google.com",), ()),
    ("notion", ("notion.so", "notion.site"), ()),
]


def detect_platform(host: str = "", path: str = "") -> str:
    """Which LMS is this page on? `generic` when nothing matches.

    The extension used `window.location`; it now sends the host and path. Keeping
    the mapping here means a new LMS is a server deploy, not a store review.
    """
    h = (host or "").lower()
    p = (path or "").lower()
    for platform, host_subs, path_subs in _PLATFORM_RULES:
        if any(s in h for s in host_subs) or any(s in p for s in path_subs):
            return platform
    return "generic"


# The subject keyword table, ported verbatim. IN ORDER: the first subject with a
# matching keyword wins, so more specific subjects precede broader ones.
SUBJECT_HINTS: List[Tuple[str, Tuple[str, ...]]] = [
    ("Mathematics", ("algebra", "geometry", "calculus", "trig", "trigonometr", "statistic",
                     "equation", "theorem", "linear", "quadratic", "function", "probability",
                     "arithmetic", "math", "integral", "derivative", "exponential", "logarithm")),
    ("Biology", ("cell", "dna", "genetics", "organism", "biology", "evolution", "crispr",
                 "photosynthesis", "ecosystem", "bacteria", "mitochondria")),
    ("Chemistry", ("chemistry", "chemical", "molecule", "atom", "compound", "reaction",
                   "acid", "periodic")),
    ("Physics", ("physics", "motion", "force", "kinematics", "newton", "velocity",
                 "acceleration", "gravity", "electricity", "magnet")),
    ("Computer Science", ("algorithm", "code", "programming", "data structure", "python",
                          "machine learning", "neural", "ap csp", "apcsp", "computer science",
                          "java")),
    ("History", ("history", "reconstruction", "civil war", "president", "ancient",
                 "revolution", "empire", "world war", "century", "antebellum", "columbian")),
    ("Literature", ("novel", "literature", "poem", "woolf", "faulkner", "narrative",
                    "modernist", "english literature", "shakespeare", "poetry")),
    ("English", ("english", "grammar", "essay", "vocabulary", "reading", "writing", "rhetoric")),
    ("Economics", ("economic", "inflation", "gdp", "macroeconomic", "microeconomic",
                   "monetary", "supply", "demand", "market")),
    ("Ethics", ("ethics", "ethical", "moral", "autonomous systems")),
    ("Psychology", ("cognitive", "behavior", "psychology", "bias", "decision")),
    ("Spanish", ("spanish", "espanol", "español", "conjugat", "vocabulario")),
    ("French", ("french", "francais", "français")),
    ("Health", ("health", "nutrition", "p.e.", "physical education", "wellness")),
]

# Word-START boundary so substrings never false-positive: "miscellaneous" must
# not match the 'cell' keyword. (?![\w]) is the same guard `(?:^|[\s\W])` gave.
_SUBJECT_RES = [
    (subj, re.compile("|".join(r"(?<!\w)" + re.escape(k) for k in keys)))
    for subj, keys in SUBJECT_HINTS
]


def classify_subject(text: str = "") -> str:
    """Best-effort subject for a course/page name. Empty string when unsure.

    Deliberately conservative: returning '' lets the caller fall back to the
    user's own choice rather than mis-filing material under a wrong subject.
    """
    low = (text or "").lower()
    if not low:
        return ""
    for subj, rx in _SUBJECT_RES:
        if rx.search(low):
            return subj
    return ""


# Canvas URL shapes: /courses/123/assignments/456 (/quizzes/…, /pages/x,
# /discussion_topics/…, /modules/items/…).
#
# ORDERING TRAP, preserved from the JS: 'modules/items' MUST precede 'modules' in
# the alternation. Python's `re` also takes the FIRST alternative that matches,
# so with 'modules' first /courses/1/modules/items/44 would parse as
# kind='modules', itemId='items' — collapsing every module item onto one wrong
# canvas_id ('c1:modules:items') and breaking subject pairing and dedupe.
_CANVAS_ITEM_RE = re.compile(
    r"^/courses/(\d+)/(assignments|quizzes|pages|discussion_topics|modules/items|modules|files)/([^/?#]+)"
)
_CANVAS_COURSE_RE = re.compile(r"^/courses/(\d+)")


def parse_course_url(url: str = "") -> Dict[str, str]:
    """Split a Canvas URL into {courseId, itemId, itemKind, courseUrl}.

    All fields are '' when the URL is not a course page, so a caller can test
    truthiness instead of handling None.
    """
    empty = {"courseId": "", "itemId": "", "itemKind": "", "courseUrl": ""}
    if not url:
        return dict(empty)
    try:
        parts = urlsplit(url)
    except ValueError:
        return dict(empty)
    path = unquote(parts.path or "")
    m = _CANVAS_ITEM_RE.match(path)
    base = f"{parts.scheme}://{parts.netloc}" if parts.scheme else ""
    if not m:
        c = _CANVAS_COURSE_RE.match(path)
        return {
            "courseId": c.group(1) if c else "",
            "itemId": "",
            "itemKind": "",
            "courseUrl": f"{base}/courses/{c.group(1)}" if c else "",
        }
    return {
        "courseId": m.group(1),
        "itemKind": m.group(2),
        "itemId": unquote(m.group(3)),
        "courseUrl": f"{base}/courses/{m.group(1)}",
    }
