"""Extension API — the server half of a pure-UI extension (owner 2026-09-17).

Owner: *"migrate all possible logic to be completed by a helpotron api and have
the extension be PURE ui"*.

Every endpoint here exists because logic used to live in the extension and had no
business doing so. The extension now:
  * captures (screen, DOM, frame),
  * dispatches primitive input via Chrome's debugger/CDP,
  * renders what it is told.
Everything decision-shaped — motion curves, crawl scope, robots policy,
assignment attribution, UI copy — is answered here.

Auth is the same API key the rest of the extension uses (see server/api_keys.py),
so these routes work with `Authorization: Bearer htk_...` and with a normal
session.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import extension_logic as L
from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/extension", tags=["extension-api"])


async def _user(request: Request, db: Session):
    from .security import get_current_user
    return await get_current_user(request=request)


class MousePathIn(BaseModel):
    from_x: float = 0
    from_y: float = 0
    to_x: float = 0
    to_y: float = 0
    stops: Optional[List[Dict[str, float]]] = None


class CrawlPlanIn(BaseModel):
    url: str = ""
    robots_text: str = ""
    html: str = ""
    crawl_path: str = ""
    # Links the extension found in the page DOM. The server decides which of
    # them may be visited — the extension never judges scope itself, because a
    # per-URL check in the client is both a hot loop and a policy the client
    # could be made to get wrong.
    candidate_links: Optional[List[str]] = None


class PayloadIn(BaseModel):
    data: Dict[str, Any] = Field(default_factory=dict)


class PageInfoIn(BaseModel):
    """Everything the extension can observe about the page it is standing on.

    The extension's only remaining job is reading the DOM — it cannot know which
    LMS a host is, what subject the material belongs to, which course an item is
    filed under, or how to render that page as Markdown. All four are answered by
    `POST /page-info` so a rule change is a deploy, not a store review.
    """
    url: str = ""
    host: str = ""
    path: str = ""
    title: str = ""
    # Course/page name candidates the extension could read (breadcrumbs, context
    # name, document title). The server picks and classifies.
    name_candidates: Optional[List[str]] = None
    # Raw innerHTML of the content root. Converted server-side by html_markdown.
    html: str = ""


class EnrichIn(BaseModel):
    """A whole scraped payload, with raw HTML left in its text fields.

    The extension hands over what it read from the DOM; the server decides what
    that markup MEANS. This is the boundary that replaces the four functions that
    used to ship inside `content.js`: `detectPlatform`, `classifySubject`,
    `parseCourseUrl` and `htmlToCleanMarkdown`.
    """
    url: str = ""
    host: str = ""
    path: str = ""
    title: str = ""
    name_candidates: Optional[List[str]] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    # Field names whose value is raw HTML and should be converted. Explicit
    # rather than sniffed, so a text field that merely contains a '<' is never
    # mangled into Markdown by accident.
    html_fields: Optional[List[str]] = None


# Any tag-like run is treated as markup only when the field is declared in
# `html_fields`; this regex just decides whether conversion is worth doing.
_TAG_RE = None


def _looks_like_html(value: str) -> bool:
    """Is this string actually markup?

    The tag name must follow the `<` immediately — no leading whitespace. A
    looser pattern treated a plain sentence like "contains < not html > maybe"
    as markup, which would have reported it as a converted field and put it
    through the parser for no reason.
    """
    global _TAG_RE
    if _TAG_RE is None:
        import re as _re
        _TAG_RE = _re.compile(r"</?[a-zA-Z][a-zA-Z0-9]*(\s[^<>]*)?/?>")
    return bool(_TAG_RE.search(value or ""))


@router.post("/page-info")
async def page_info(body: PageInfoIn, request: Request,
                    db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Identify the page and convert it — platform, subject, course, Markdown.

    One round trip replaces four functions that used to ship in `content.js`:
    `detectPlatform`, `classifySubject`, `parseCourseUrl` and
    `htmlToCleanMarkdown`.
    """
    await _user(request, db)
    ident = _identify(body.url, body.host, body.path, body.title, body.name_candidates)

    markdown = ""
    if body.html:
        from .html_markdown import html_to_markdown
        markdown = html_to_markdown(body.html)

    return {
        "status": "success",
        **ident,
        "markdown": markdown,
        "markdown_chars": len(markdown),
    }


def _identify(url: str, host: str, path: str, title: str,
              name_candidates: Optional[List[str]]) -> Dict[str, Any]:
    """Platform + course + subject. Shared by /page-info and /enrich so the two
    can never disagree about what page this is."""
    if not path and url:
        try:
            from urllib.parse import urlparse
            path = urlparse(url).path or ""
        except Exception:
            path = ""
    if not host and url:
        try:
            from urllib.parse import urlparse
            host = urlparse(url).netloc or ""
        except Exception:
            host = ""

    platform = L.detect_platform(host, path)
    course = L.parse_course_url(url)

    name = ""
    for cand in (name_candidates or []):
        c = (cand or "").strip()
        if len(c) > 1 and c.lower() != "dashboard":
            name = c
            break
    if not name:
        name = (title or "").strip()

    return {
        "platform": platform,
        "subject": L.classify_subject(name),
        "course": course,
        "name": name[:200],
    }


@router.post("/enrich")
async def enrich(body: EnrichIn, request: Request,
                 db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Convert a whole scraped payload in one round trip.

    The extension collects raw `innerHTML` into its text fields; this endpoint
    turns the declared HTML fields into Markdown and attaches the page identity.
    Doing it in ONE call rather than per-field keeps a page scrape to a single
    request and keeps the conversion rules on the server, where they cannot be
    edited by a modified client.
    """
    await _user(request, db)
    from .html_markdown import html_to_markdown

    ident = _identify(body.url, body.host, body.path, body.title, body.name_candidates)

    payload = dict(body.payload or {})
    declared = set(body.html_fields or [])
    converted: List[str] = []

    for key, val in list(payload.items()):
        # A declared field is converted whether or not it looks like markup.
        # An undeclared one is converted only when it demonstrably IS markup,
        # so a plain text field containing a stray '<' is never mangled.
        is_declared = key in declared
        if isinstance(val, str) and val:
            if is_declared or _looks_like_html(val):
                if _looks_like_html(val):
                    payload[key] = html_to_markdown(val)
                    converted.append(key)
        # Many scrapers collect a list of content blocks.
        elif isinstance(val, list) and val and all(isinstance(x, str) for x in val):
            if is_declared or any(_looks_like_html(x) for x in val):
                if any(_looks_like_html(x) for x in val):
                    payload[key] = [html_to_markdown(x) for x in val]
                    converted.append(key)

    return {
        "status": "success",
        **ident,
        "payload": payload,
        "converted_fields": converted,
    }


@router.post("/action-stream")
async def action_stream(body: Dict[str, Any], request: Request,
                        db: Session = Depends(get_db)) -> Dict[str, Any]:
    """The typing engine, served. Text in, primitive action stream out.

    The extension's `HumanProfile` decided the delay, the typos, the false
    starts, the rereads and the corrections for every character. That model now
    lives in `server/human_profile.py` and this route emits the resulting
    stream; the shipped player executes it with a fixed vocabulary and holds no
    cadence policy of its own.
    """
    await _user(request, db)
    from .action_stream import (
        ACTION_STREAM_VERSION,
        build_action_stream,
        validate_action_stream,
    )

    text = str(body.get("text") or "")
    if not text:
        raise HTTPException(400, "text is required")
    if len(text) > 200_000:
        raise HTTPException(413, "text is too large for one stream")

    from .human_profile import HumanProfile
    import random as _random

    seed = body.get("seed")
    gear = float(body.get("speed") or 1.0)

    # Two views of the SAME run, so a client can either play the flat primitive
    # stream or drive its own loop from the per-character decisions. Both come
    # from one HumanProfile instance, so they can never disagree.
    profile = HumanProfile(gear=gear, rng=_random.Random(seed))
    decisions = profile.tick_many(list(text), burst_scale=1.0)

    actions = build_action_stream(
        text,
        speed=gear,
        typo_rate=float(body.get("typo_rate") if body.get("typo_rate") is not None else 0.101),
        natural_pauses=bool(body.get("natural_pauses", True)),
        jitter=bool(body.get("jitter", True)),
        false_start_rate=float(body.get("false_start_rate") if body.get("false_start_rate") is not None else 0.025),
        seed=seed,
    )
    ok, err = validate_action_stream(actions)
    if not ok:
        logger.error("action stream failed self-validation: %s", err)
        raise HTTPException(500, "action stream failed validation")

    # Decisions are floats from the model; JSON-safe already, but round the
    # delays so a client showing them does not render 16 decimal places.
    for d in decisions:
        if isinstance(d.get("delay"), float):
            d["delay"] = round(d["delay"], 2)

    # The sub-step timings for corrections (a backspace, a fragment character, a
    # repair pause). These were the last timing numbers decided in the client —
    # `calculateDelay` in content.js. They come from the same fitted distributions
    # the action stream uses, so the two paths cannot drift.
    timing = {
        "backspace_ms": [44, 104],
        "fragment_char_ms": [70, 150],
        "notice_ms": [90, 1200],
        "repair_ms": [60, 160],
        "thinking_lull_ms": [1200, 2000],
        "thinking_every_words": 75,
        "shift_beat_ms": [16, 56],
        "intra_burst_floor_ms": 150,
    }

    return {
        "status": "success",
        "stream_version": ACTION_STREAM_VERSION,
        "actions": actions,
        "count": len(actions),
        "decisions": decisions,
        "decision_count": len(decisions),
        "profile": profile.snapshot(),
        "timing": timing,
    }


@router.get("/bootstrap")
async def bootstrap(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Everything the extension needs to configure and render itself.

    One call instead of a dozen: feature flags, UI copy and the spinner rotation
    all come from here, so changing wording or turning a capability off is a
    server deploy rather than an extension release under store review.
    """
    user = await _user(request, db)
    settings = dict(getattr(user, "settings", None) or {})
    plan = getattr(user, "plan", "free")
    return {
        "status": "success",
        "user": {"public_id": getattr(user, "public_id", ""), "plan": plan},
        "balance": float(settings.get("token_balance", 0) or 0),
        "ui": {
            "spinner_verbs": L.spinner_verbs(6),
            "busy_message": (
                "The server is busy — your task is queued and will be completed "
                "automatically once load lightens."
            ),
            "busy_after_seconds": 180,
        },
        "features": {
            "agent_mode": True,
            "vision": True,
            "crawl": True,
            "control": True,
        },
    }


@router.get("/queue")
async def queue(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Live load and queue depth.

    The extension polls this while a task runs so it can keep the user informed:
    which spinner verb to show, and whether to switch to the "server is busy"
    notice after three minutes. The task itself is never cancelled — the server
    keeps it queued until the machine has room.
    """
    from .resource_guard import queue_status
    from .priority import should_show_busy, wait_budget_seconds, get_priority
    await _user(request, db)
    st = queue_status()
    # ★ THE WAIT BUDGET SCALES WITH PRIORITY (owner 2026-09-28). A flat 3-minute notice is
    # wrong in both directions: a "hello" should not be told to wait 3 minutes, and a
    # humanization legitimately takes ~5, so warning at 3 would be noise. The caller names
    # the process it is asking about; an unnamed caller gets the default budget.
    proc = request.query_params.get("process") or ""
    st["process"] = proc or None
    st["wait_budget_seconds"] = wait_budget_seconds(proc) if proc else None
    if proc:
        st["priority"] = get_priority(proc)
    st["should_show_busy"] = should_show_busy(st.get("last_wait_seconds", 0), proc or None)
    return {"status": "success", **st}


@router.post("/mouse-path")
async def mouse_path(body: MousePathIn, request: Request,
                     db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Humanlike pointer path for one move, or a chained multi-stop drive.

    Pure geometry that used to ship inside the extension. The caller replays
    these samples verbatim, so the motion contract is unchanged — it simply
    originates here now, where it can be tuned without a store review.
    """
    await _user(request, db)
    if body.stops:
        points = L.human_move_chain(body.stops, {"x": body.from_x, "y": body.from_y})
    else:
        points = L.human_move_points(body.from_x, body.from_y, body.to_x, body.to_y)
    return {"status": "success", "points": points, "duration_ms": points[-1]["t"] if points else 0}


@router.post("/crawl/plan")
async def crawl_plan(body: CrawlPlanIn, request: Request,
                     db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Scope + robots decision + the content links worth visiting.

    This is a security boundary, not a convenience: the rule that a crawl may
    never leave one origin and one course belongs on the server, where a
    compromised or outdated extension cannot loosen it.
    """
    await _user(request, db)
    scope = L.course_scope_of(body.url)
    if scope is None:
        return {"status": "success", "in_scope": False,
                "reason": "not_a_course_url", "links": [], "next_index_urls": []}

    path = body.crawl_path or ""
    if not path:
        try:
            from urllib.parse import urlparse
            path = urlparse(body.url).path or ""
        except Exception:
            path = ""

    if path and not L.is_robots_allowed(body.robots_text, path):
        return {"status": "success", "in_scope": True, "robots_allowed": False,
                "reason": "robots_disallow", "scope": scope, "links": [], "next_index_urls": []}

    links: List[str] = []
    extra = L.collect_index_links(body.html, scope, links)

    # Candidate links reported by the client: return ONLY those the server
    # accepts, so following the response is inherently safe.
    accepted: List[str] = []
    if body.candidate_links:
        seen = set()
        for raw in body.candidate_links:
            canon = (raw or "").split("#")[0]
            if not canon or canon in seen:
                continue
            if L.is_scoped_content_url(canon, scope):
                seen.add(canon)
                accepted.append(canon)

    return {"status": "success", "in_scope": True, "robots_allowed": True,
            "scope": scope, "links": links, "next_index_urls": extra,
            "accepted_links": accepted}


@router.post("/crawl/payload")
async def crawl_payload(body: PayloadIn, request: Request,
                        db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Attribution payload for one scraped page — built here so the dedupe key
    and the bubble routing cannot drift between the extension and the server."""
    user = await _user(request, db)
    return {"status": "success",
            "payload": L.build_assignment_payload(body.data, getattr(user, "public_id", ""))}
