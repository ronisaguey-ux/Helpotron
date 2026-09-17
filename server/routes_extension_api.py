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
    from .resource_guard import queue_status, should_show_busy
    await _user(request, db)
    st = queue_status()
    st["should_show_busy"] = should_show_busy(st.get("last_wait_seconds", 0))
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
