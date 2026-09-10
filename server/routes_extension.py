"""API routes for Chrome Extension version tracking, update alerts, zip packaging,
and the extension mini-chatbox (operator task 08-28)."""
from __future__ import annotations

import html
import io
import json
import logging
import os
import re
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .admin import require_admin
from .config import BASE_DIR
from .database import ExtensionRelease, ExtensionReleaseRead, get_db
from .screen_vision import (
    DEFAULT_EFFORT_SCORE,
    VISION_MODEL,
    _MAX_CONTROL_ACTIONS,
    _MAX_IMAGES_PER_CALL,
    analyze_screen_image,
    extract_control_actions,
    extract_control_actions_ex,
    parse_effort_score,
    resolve_vision_model,
    validate_image_b64,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/extension", tags=["extension"])
# Public (no /api prefix) routes: legal/doc pages referenced by /version and
# the CWS listing — must be reachable at clean top-level URLs.
public_router = APIRouter(tags=["documentation"])

EXTENSION_DIR = BASE_DIR / "extension" if (BASE_DIR / "extension").exists() else BASE_DIR.parent / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"


def get_current_manifest() -> Dict[str, Any]:
    if MANIFEST_PATH.exists():
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"version": "2.7.0", "name": "Helpotron Academic Companion"}


class VersionCheckRequest(BaseModel):
    current_version: Optional[str] = Field(None, description="Current version installed in the browser")
    client_id: Optional[str] = None


@router.get("/version")
async def get_extension_version(db: Session = Depends(get_db)):
    """Returns the latest available extension version, changelog, and download metadata.
    Release notes now come from the remembered ExtensionRelease row (sync_extension_releases)
    so they can never go stale; the dictionary below is only the no-DB fallback."""
    releases = sync_extension_releases(db)
    manifest = get_current_manifest()
    latest_version = manifest.get("version", "2.0.0")
    top = releases[0] if releases else None

    return {
        "status": "success",
        "latest_version": latest_version,
        "minimum_supported_version": "1.0.0",
        "release_date": top.created_at.strftime("%Y-%m-%d") if top and top.created_at else "2026-09-01",
        "is_critical_update": bool(top and top.is_major),
        "release_notes": (top.notes.split("\n") if top and top.notes else PRESET_RELEASE_NOTES.get(latest_version, [])),
        "download_url": "/api/extension/download",
        "setup_guide_url": "/extension-guide",
    }


@router.post("/check-update")
async def check_extension_update(req: VersionCheckRequest):
    """Compares the client extension version with the latest server version."""
    manifest = get_current_manifest()
    latest = manifest.get("version", "2.0.0")
    current = req.current_version or "0.0.0"

    is_outdated = current != latest

    return {
        "status": "success",
        "current_version": current,
        "latest_version": latest,
        "update_available": is_outdated,
        "message": "A new version of the Helpotron Extension is available!" if is_outdated else "Your extension is up to date.",
        "download_url": "/api/extension/download",
    }


@router.get("/download")
async def download_extension_zip():
    """Packages the extension/ folder into a clean .zip file for instant 1-click download."""
    if not EXTENSION_DIR.exists():
        raise HTTPException(status_code=404, detail="Extension directory not found")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(EXTENSION_DIR):
            for file in files:
                # Exclude temporary, cache, git files, and .md docs (review notes,
                # design docs) — the zip is the installable extension only
                if file.startswith(".") or file.endswith((".pyc", ".tmp", ".log", ".md")):
                    continue
                file_path = Path(root) / file
                archive_name = file_path.relative_to(EXTENSION_DIR)
                zip_file.write(file_path, arcname=str(archive_name))

    zip_buffer.seek(0)
    manifest = get_current_manifest()
    version = manifest.get("version", "2.0.0")
    filename = f"helpotron-extension-v{version}.zip"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Access-Control-Expose-Headers": "Content-Disposition",
    }
    return Response(content=zip_buffer.getvalue(), media_type="application/zip", headers=headers)


# ─── Release announcements (09-03): "remember all new major updates" ────────
# Every manifest.json bump is auto-synced into an ExtensionRelease row, so no
# update can be forgotten; the popup surfaces unread rows as a What's-new
# notification for EVERY user, with per-user read receipts (ExtensionReleaseRead)
# so one user dismissing never silences it for others. Major vs minor is
# inferred from the version segments; an admin can overwrite name/notes via
# POST /api/extension/releases.
PRESET_RELEASE_NOTES: Dict[str, List[str]] = {
    "2.7.0": [
        "🖱️ Driving actually works: the agent auto-picks a real web page (new-tab/extension pages are skipped with a clear RETRY), then moves a visible cursor and clicks for you.",
        "✅ Same approval card everywhere — popup, popped-out window, and the Helpotron site: Approve, Reject, or Neutral (with an optional note the agent sees).",
        "⚡ Approve + auto-add: approve an action type once and future identical actions run without asking.",
        "🗝️ Agent prompt hardened: the agent never refuses a legit request, and Educational Mode limits it to school/study tasks.",
    ],
    "2.6.1": [
        "🖥️ Natural mouse glide: agent moves cursor smoothly along Bezier curves before clicking or typing.",
        "🎛️ Full interactive toggles: Educational Mode, See Screen, and Execute switches now fully responsive and synced.",
        "🪟 Keep Open pop-out window: open extension in a persistent window that stays open beside tabs.",
        "✨ Embedded Settings overhaul: clean account view and preference controls right inside the extension.",
    ],
    "2.6.0": [
        "🎉 Helpotron 2.6 — the big clean-up: simpler 4-pillar navigation, a live 3-stage progress ribbon on every assignment (watch agents work, send messages, upload files, interrupt them), and honest open pricing — you always see the task-token cost before you approve (no hidden flat fees).",
        "🛡️ Safety first: two-factor authentication is now required for any purchase, and a clear FERPA banner lets you choose exactly what you allow.",
        "🏷️ Brand-wide: Helpotron logo everywhere, no more stock AI imagery, and detector toggles only show what's really running.",
        "💬 Assignment work now auto-routes to the right deliverable (do-it-for-me, study guide, practice quiz, flashcards) with real cost estimates before you approve.",
    ],
    "2.5.2": [
        "🔧 Fixed login, chat, and site scraping — the extension now connects to the Helpotron server from the popup, the background service, and the recorder (they all pointed at a dead local address).",
        "✨ Agent page overhaul — clean two-row top bar with live See-screen / Execute chips, a chat composer that actually fits (input + send side by side), and an action-log empty state.",
        "🖥️ Popup polish — compact release banner, clearer status messages, and the correct chat icon for Agent mode.",
    ],
    "2.5.1": [
        "🛡️ Safer permissions — agent actions (type/click/move) now ask for the debugger permission the first time you switch Execute on; install is much lighter with no untrusted permission grants.",
        "🌐 Renamed to Helpotron Academic Companion — store listing, app, and policy now use one name.",
        "📦 Installer zip only ships extension files — no docs inside.",
    ],
    "2.5.0": [
        "🎨 Complete design refresh — popup, options, and onboarding now match Helpotron's new look (dark-first, teal accent, real logo).",
        "⚙️ New Options page — theme (System / Light / Dark), accent color, capture behaviour, and privacy settings.",
        "🚀 First-run onboarding — a 3-step welcome screen opens once on install.",
        "🖥️ Agent panel upgrades — My Agent settings sync, copy buttons on every response, Educational Mode toggle.",
        "🔒 Hardened CSP — fonts and icons bundled locally, no CDN dependencies.",
    ],
}

RELEASE_NOTE_TEMPLATE = "Helpotron Extension updated to v{version}."


def _version_tuple(v: str) -> Tuple[int, int, int]:
    parts: List[int] = []
    for p in str(v or "0.0.0").split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return (parts[0], parts[1], parts[2])


def _is_major_bump(prev: Optional[str], new: str) -> bool:
    """Major/minor segment change => major update (2.5.0→2.6.0, 2.x→3.0.0);
    patch-only bump (2.5.0→2.5.1) is minor. First ever release = major."""
    if prev is None:
        return True
    a, b = _version_tuple(prev), _version_tuple(new)
    return a[0] != b[0] or a[1] != b[1]


def sync_extension_releases(db: Session) -> List[ExtensionRelease]:
    """Idempotent: ensure a release row exists for the current manifest version.
    Creates rows for ANY bump — including versions nobody annotated — so the
    notification history is complete by construction."""
    version = get_current_manifest().get("version") or "2.0.0"
    known = {r.version for r in db.query(ExtensionRelease).all()}
    if version not in known:
        prev = db.query(ExtensionRelease).order_by(ExtensionRelease.id.desc()).first()
        notes = PRESET_RELEASE_NOTES.get(version, [RELEASE_NOTE_TEMPLATE.format(version=version)])
        db.add(ExtensionRelease(
            version=version,
            title=f"Helpotron Extension v{version}",
            notes="\n".join(notes),
            is_major=_is_major_bump(prev.version if prev else None, version),
        ))
        db.commit()
    elif version in PRESET_RELEASE_NOTES:
        row = db.query(ExtensionRelease).filter(ExtensionRelease.version == version).first()
        preset_text = "\n".join(PRESET_RELEASE_NOTES[version])
        if row and row.notes != preset_text and len(row.notes.split("\n")) < len(PRESET_RELEASE_NOTES[version]):
            row.notes = preset_text
            db.commit()
    return list(db.query(ExtensionRelease).order_by(ExtensionRelease.id.desc()).all())


class ExtensionReleasePayload(BaseModel):
    version: Optional[str] = Field(None, max_length=32, description="Defaults to the current manifest version")
    title: Optional[str] = Field(None, max_length=256)
    notes: Optional[str] = Field(None, description="One note per line")
    is_major: Optional[bool] = None


@router.get("/releases")
async def get_extension_releases(request: Request, db: Session = Depends(get_db)):
    """What's-new feed: every remembered release, newest first, with per-user
    read receipts folded in when the caller is authenticated. Accepts the same
    credentials as /api/me (session cookie, 24h JWT, or the long-lived DB
    session token the popup stores). Anonymous callers get read=False so the
    popup can still notify (dismissal stays local until signed in)."""
    releases = sync_extension_releases(db)
    me = None
    try:
        me = await _extension_current_user(request, db)
    except HTTPException:
        pass
    read_map: Dict[int, datetime] = {}
    if me is not None:
        for rr in db.query(ExtensionReleaseRead).filter(ExtensionReleaseRead.user_id == me.public_id).all():
            read_map[rr.release_id] = rr.read_at
    out = []
    for r in releases:
        read_at = read_map.get(r.id)
        out.append({
            "id": r.id,
            "version": r.version,
            "title": r.title,
            "notes": r.notes,
            "is_major": r.is_major,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "read": read_at is not None,
            "read_at": read_at.isoformat() if read_at else None,
        })
    return {
        "status": "success",
        "latest_version": releases[0].version if releases else None,
        "releases": out,
    }


@router.post("/releases/{release_id}/read")
async def ack_extension_release(release_id: int, request: Request, db: Session = Depends(get_db)):
    """Per-user read receipt (idempotent): the popup acks a What's-new card."""
    me = await _extension_current_user(request, db)
    if not db.query(ExtensionRelease).filter(ExtensionRelease.id == release_id).first():
        raise HTTPException(status_code=404, detail="Unknown release")
    existing = db.query(ExtensionReleaseRead).filter(
        ExtensionReleaseRead.release_id == release_id,
        ExtensionReleaseRead.user_id == me.public_id,
    ).first()
    if not existing:
        db.add(ExtensionReleaseRead(release_id=release_id, user_id=me.public_id))
        db.commit()
    return {"status": "success", "release_id": release_id}


@router.post("/releases")
async def publish_extension_release(payload: ExtensionReleasePayload, request: Request, db: Session = Depends(get_db)):
    """Admin: annotate an auto-synced release (or register an unremembered
    version) with human release notes before/after it reaches users."""
    require_admin(request, db)
    version = (payload.version or "").strip() or get_current_manifest().get("version", "")
    if not version:
        raise HTTPException(status_code=422, detail="version required")
    row = db.query(ExtensionRelease).filter(ExtensionRelease.version == version).first()
    if not row:
        row = ExtensionRelease(
            version=version,
            title=payload.title or f"Helpotron Extension v{version}",
            notes=payload.notes or "",
            is_major=payload.is_major if payload.is_major is not None else True,
        )
        db.add(row)
    else:
        if payload.title is not None:
            row.title = payload.title
        if payload.notes is not None:
            row.notes = payload.notes
        if payload.is_major is not None:
            row.is_major = payload.is_major
    db.commit()
    db.refresh(row)
    return {"status": "success", "release": {"id": row.id, "version": row.version, "title": row.title, "is_major": row.is_major}}


# ─── Public legal/doc pages (CWS launch prep 09-03) ─────────────────────────
# The Chrome Web Store dashboard requires a privacy-policy URL, and reviewers
# click /extension-guide from the /version payload. Both are served
# server-side (no JS, no sign-in) so the reviewer always sees real content.
_DOC_ROOT = BASE_DIR.parent if (BASE_DIR.parent / "PRIVACY_POLICY.md").exists() else BASE_DIR

_DOC_STYLE = (
    "body{font-family:system-ui,-apple-system,sans-serif;max-width:820px;"
    "margin:32px auto;padding:0 20px;line-height:1.55;color:#1a1a1a}"
    "h1,h2{border-bottom:1px solid #ddd;padding-bottom:6px}"
    "code{background:#f2f2f2;padding:1px 5px;border-radius:4px}"
    "a{color:#0b5c66}li{margin:4px 0}"
)


def _render_markdown_page(title: str, md_text: str) -> HTMLResponse:
    """Ultra-light server-side markdown render (headings/bullets/paragraphs)
    — just enough for legal and guide documents; no JS dependency."""
    lines = []
    for line in html.escape(md_text).split("\n"):
        if line.strip() == "":
            continue
        if line.startswith("# "):
            lines.append(f"<h1>{line[2:]}</h1>")
        elif line.startswith("## "):
            lines.append(f"<h2>{line[3:]}</h2>")
        elif line.startswith("- "):
            lines.append(f"<li>{line[2:]}</li>")
        else:
            lines.append(f"<p>{line}</p>")
    return HTMLResponse(
        f"<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{title}</title><style>{_DOC_STYLE}</style></head>"
        f"<body>{''.join(lines)}</body></html>"
    )


@public_router.get("/privacy-policy")
async def privacy_policy_page():
    """CWS privacy-policy URL — renders PRIVACY_POLICY.md for anyone, no auth."""
    path = _DOC_ROOT / "PRIVACY_POLICY.md"
    return _render_markdown_page(
        "Helpotron Privacy Policy",
        path.read_text(encoding="utf-8") if path.exists() else "Privacy policy not found.",
    )


@public_router.get("/extension-guide")
async def extension_guide_page():
    """Setup guide advertised by /version — renders EXTENSION_SETUP_GUIDE.md."""
    path = _DOC_ROOT / "EXTENSION_SETUP_GUIDE.md"
    return _render_markdown_page(
        "Helpotron Extension Setup Guide",
        path.read_text(encoding="utf-8") if path.exists() else "Setup guide not found.",
    )


# ─── Mini chatbox: extension popup ↔ agent pipeline (08-28 task) ─────────────
# The popup's chatbox talks to the SAME agent pipeline the web chat uses
# (intent resolution -> LLM reply / action execution -> durable
# AgentChatMessage rows), on the 'extensions' surface. Two deliberate
# differences vs /api/agent/chat (routes_overlord.send_chat_message):
#   * auth goes through security.get_current_user, which accepts the
#     extension's long-lived bearer credential (session_token) as well as the
#     24h JWT and the session cookie — the web chat route only takes JWT/
#     cookie, so the extension's session_token would 401 there.
#   * surface node is 'extensions': the persona / instructions configured
#     under settings['ai']['hierarchy']['extensions'] (agent_prompt.py
#     HIERARCHY_NODES) are injected; the My Agent identity never leaks in.
# Thread key: thread_id (None/0 = the main agent conversation) is shared
# with the web chat, so the popup shows exactly what the web chat shows.


class ChatViewport(BaseModel):
    width: int = Field(..., ge=1, le=20_000, description="captured tab viewport width, CSS px")
    height: int = Field(..., ge=1, le=20_000, description="captured tab viewport height, CSS px")


class ChatTabRef(BaseModel):
    """One tab inside the turn's jurisdiction (09-08).

    Sent alongside `images` in the SAME order, so frame N is tab N. Without it a
    multi-tab turn hands the model several screenshots with nothing to say which
    is which, and the reply talks about "the page" as if there were one.
    """

    title: str = Field("", max_length=300)
    url: str = Field("", max_length=2_000)
    captured: bool = Field(True, description="False when this tab's frame could not be taken")


def _tab_ref_label(tab: "ChatTabRef") -> str:
    """Short human label for one jurisdiction tab.

    Title first because that is what the user recognises; host as the fallback
    and as the qualifier, since two tabs on the same site often share a title.
    """
    title = (tab.title or "").strip()
    host = ""
    raw = (tab.url or "").strip()
    if raw:
        try:
            host = urlparse(raw).hostname or ""
        except Exception:
            host = ""
    if title and host:
        return f'"{title}" ({host})'
    if title:
        return f'"{title}"'
    return host or "unnamed tab"


class ExtensionChatRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5_000)
    thread_id: Optional[int] = Field(None, description="chat thread (None/0 = the main agent conversation)")
    # agent mode (09-01): all additive — existing payloads stay valid.
    # images: JPEG screen frames (base64, data-URI allowed); agent_mode turns
    # on screen-state context + the ```control``` block contract; viewport is
    # the captured tab's CSS viewport so control coordinates can be clamped.
    images: List[str] = Field(default_factory=list, description="captured JPEG frames (base64)")
    agent_mode: bool = Field(False, description="agent-mode screen-control chat")
    educational_mode: Optional[bool] = Field(None, description="when False, disables strict study-only restrictions")
    permission_mode: Optional[str] = Field(None, description="manual | auto | yolo permission mode")
    seescreen: Optional[bool] = Field(None, description="true if the extension's 'See screen' toggle is ON")
    execute: Optional[bool] = Field(None, description="true if the extension's 'Execute' toggle is ON")
    viewport: Optional[ChatViewport] = Field(None, description="captured tab viewport size")
    tabs: List[ChatTabRef] = Field(
        default_factory=list,
        max_length=16,
        description="jurisdiction tabs, in the same order as images",
    )


class VisionRequest(BaseModel):
    image_b64: str = Field(..., min_length=8, max_length=16_000_000, description="JPEG (or PNG) frame, base64")
    prompt: Optional[str] = Field(None, max_length=2_000, description="optional custom analysis instruction")
    width: Optional[int] = Field(None, ge=1, le=20_000)
    height: Optional[int] = Field(None, ge=1, le=20_000)


class ExtensionApprovalResponseRequest(BaseModel):
    """09-07: the approval card's answer to a pending approval request
    (the `approval_request` object an agent_chat response carried).

    decision: allow | deny | neutral ('message' is accepted as an alias for
    neutral; the legacy web vocabulary approve/reject also works).
    req_id is required (reqId camelCase alias accepted; permission_id is a
    second alias — the same pending-permission id).
    """
    req_id: Optional[str] = Field(None, description="pending approval id (the approval_request.req_id the card received)")
    reqId: Optional[str] = Field(None, description="camelCase alias for req_id (extension protocol spelling)")
    permission_id: Optional[str] = Field(None, description="alias for req_id — the perm_ id, same pending permission")
    decision: str = Field(..., description="allow | deny | neutral (message/media accepted; approve/reject aliases too)")
    text: Optional[str] = Field(None, description="user feedback text — REQUIRED for neutral; optional for allow/deny")
    comment: Optional[str] = Field(None, description="alias for text (legacy web spelling)")
    auto_add: bool = Field(False, description="allow + persist the action type into the user's auto-approved actions")
    autoAdd: Optional[bool] = Field(None, description="camelCase alias for auto_add")


async def _extension_current_user(request: Request, db: Session):
    """Authenticated user for extension requests — session cookie, 24h JWT,
    or the long-lived DB-backed session token the extension sends."""
    from .database import User
    from .security import get_current_user

    current = await get_current_user(request)
    return db.query(User).filter(User.id == current.id).first() or current


def _user_ai_cfg(user) -> Dict[str, Any]:
    """The user's 'ai' settings block, guarded for dict-ness (lookups only)."""
    settings = dict(user.settings or {}) if isinstance(user.settings, dict) else {}
    ai = settings.get("ai")
    return ai if isinstance(ai, dict) else {}


def _user_effort_score(user) -> int:
    """The user's ai.effortScore coerced to 1..1000 (09-02; default 500)."""
    return parse_effort_score(_user_ai_cfg(user).get("effortScore"))


# ─── agent mode (09-01): screen vision + control contract ─────────────────────
# One token per frame analyzed (mirrors the plain_answer 1-token charge);
# charged only on successful analysis, never on the fail-closed path.
SCREEN_VISION_CHARGE = 1.0

# The route-scoped instruction block appended when agent_mode is true. It
# deliberately avoids the keyword strings _regex_fallback_intent dispatches
# on (scrape/canvas/submit/humanize/rubric/flashcard/remember) so an LLM
# failure can never turn a screen-control chat into a phantom work action,
# and keeps braces/backticks so the deterministic math quick-path can never
# mis-fire on screen coordinates present in the analysis. Wording resolves
# the upstream JSON contract's 'no markdown' line: the control fence is DATA
# inside the reply string, not emitted markdown, and the screen is real.
AGENT_MODE_DIRECTIVE = (
    "[TELE-OPERATION MODE — extension agent (09-01). The bracketed lines that "
    "start with [Screen state at] are REAL, LIVE descriptions of the user's "
    "browser tab, captured right now by the extension — you genuinely see that "
    "screen, and you can genuinely act on it. Answer the user normally (normally "
    "choose \"plain_answer\"); your outer reply is still the strict JSON envelope "
    "and your answer goes in the \"reply\" value. "
    "WHEN the user asks you to interact with, search, click, type, fill, scroll, or do anything on the screen "
    "(e.g. 'type in my search bar...', 'click on...', 'search for...', 'solve and type...'): "
    "You MUST emit concrete actions to do it! Append to the END of the \"reply\" value — inside that same "
    "JSON string, after your brief conversational prose — one fenced ```control``` block holding an "
    "ORDERED JSON ARRAY: [ {\"op\": ...}, ... ] (a bare array, nothing wrapped). "
    "For example, to type a query into a search bar: move to the search bar coordinates, click on it, type the query text, and send an Enter key. "
    "The app strips that block and executes it via browser debugger: it is DATA, not free-form "
    "markdown, so it does not violate the envelope's no-markdown rule. "
    "ALLOWED OPS (only these): "
    "{\"op\":\"move\",\"x\":0,\"y\":0}; "
    "{\"op\":\"click\",\"x\":0,\"y\":0,\"button\":\"left\"|\"right\"}; "
    "{\"op\":\"dblclick\",\"x\":0,\"y\":0}; "
    "{\"op\":\"drag\",\"fromX\":0,\"fromY\":0,\"toX\":0,\"toY\":0}; "
    "{\"op\":\"type\",\"text\":\"...\"}; "
    "{\"op\":\"key\",\"key\":\"Enter\"|\"Escape\"|\"Tab\"|\"Backspace\"|\"ArrowLeft\"|\"ArrowRight\"|\"ArrowUp\"|\"ArrowDown\"|\"Home\"|\"End\"|\"Delete\"|\"PageUp\"|\"PageDown\",\"modifiers\":[\"ctrl\"|\"shift\"|\"alt\"]}; "
    "{\"op\":\"scroll\",\"x\":0,\"y\":0,\"deltaX\":0,\"deltaY\":0}. "
    "Coordinates are CSS pixel offsets inside the tab viewport (each [Screen "
    "state] line gives its W×H; if exact coordinates are estimated from the screen description, pick reasonable coordinates for the visible UI element, e.g. center of the search bar). "
    "ACTING RULES: one screen task per message, "
    "minimal steps, never more than 15 actions in one task (09-02 cap; the "
    "extension's stop button and per-action permission prompts are live, so "
    "the user can halt after any action — keep each batch small and wait for the "
    "user's confirmation between tasks); "
    # 09-08 (operator): nothing is hard-blocked. The user's permission mode is
    # the only gate — manual asks before every batch, auto asks for risky work,
    # yolo asks for nothing. Refusing a field class the user explicitly asked
    # you to fill is the app second-guessing its own owner on their own screen.
    "say in the reply text what you are about to do before anything destructive "
    "or anything involving credentials, so the user can stop you; "
    "only act on what the screen state shows. "
    # 09-10 (operator): the agent kept re-clicking the same miss. Accuracy is a
    # contract, not a hope — aim from the freshest element list, and never
    # repeat an identical click when the screen did not change.
    "ACCURACY RULES: click the EXACT centre coordinate the freshest INTERACTIVE "
    "ELEMENTS list gives for the target (name (role) at x=, y=) — never re-estimate "
    "a coordinate the list already gives you; if the target is absent from the list, "
    "use the nearest labelled element, never a blind guess. To type into a field, "
    "click that field's centre FIRST to focus it, THEN type. After every action the "
    "next [Screen state at] line shows the result — READ it before deciding the next "
    "action. If the screen did not change, the click missed or the element moved: do "
    "NOT emit the same click x/y twice in a row — take fresh coordinates from the new "
    "screen state, try keyboard navigation (Tab/Enter), or scroll the target into view "
    "first. Never repeat an identical action more than twice: if two attempts at the "
    "same target fail, STOP and say what you see so the user can help."
)


@router.post("/vision")
async def extension_vision(payload: VisionRequest, request: Request, db: Session = Depends(get_db)):
    """agent mode (09-01/09-02): describe the current screen from one frame.

    Auth: same _extension_current_user mechanism as agent_chat. The model is
    resolved from the user's ai.effortScore (1..1000) by resolve_vision_model
    into one of the four spec'd vision models (cheapest -> most expensive);
    the resolution is returned as model_tier/effort_score in every response.
    Metering mirrors agent_chat: the same token-balance gate, then 1 token
    per call on success. Model failures NEVER 500 — they return 200 with the
    'analysis unavailable' style text (fail closed); a malformed/oversized
    image is a client error. The prompt is safety-screened (moderation.py);
    a hit is refused (fail-closed) and queued for the admin moderation queue.
    """
    user = await _extension_current_user(request, db)
    from .security import is_admin_user

    is_admin = bool(getattr(user, "is_admin", False)) or is_admin_user(user)
    effort_score = _user_effort_score(user)
    model_id, model_tier, _clamped = resolve_vision_model(effort_score)

    if not is_admin and user.plan != "elite":
        tok_bal = float((user.settings or {}).get("token_balance", 0) or 0)
        if tok_bal <= 0:
            return {
                "status": "insufficient_tokens",
                "analysis": "⚠️ Insufficient tokens — ask the operator to grant you tokens to use vision.",
                "model": model_id,
                "model_tier": model_tier,
                "effort_score": effort_score,
                "token_balance": tok_bal,
            }

    _, _, img_err = validate_image_b64(payload.image_b64)
    if img_err:
        raise HTTPException(status_code=400, detail=f"invalid image: {img_err}")

    # Safety screen (operator 09-08): record only, never refuse. Nothing is
    # denied at the prompt level — the flag lands in the admin moderation
    # queue and the instruction still reaches the model, which applies its
    # own policy and decides how to answer.
    from .moderation import flag_content, screen_content

    vision_prompt = payload.prompt or ""
    flagged, reason, risk = screen_content(vision_prompt)
    if flagged:
        flag_content(
            db,
            content_type="vision_prompt",
            content_ref=f"vision:{getattr(user, 'public_id', 'unknown')}",
            user_public_id=user.public_id,
            text=vision_prompt,
            reason=reason,
            risk_score=risk,
        )
        logger.info("extension vision prompt flagged (not blocked): %s", reason)

    try:
        analysis = await analyze_screen_image(
            payload.image_b64,
            prompt=vision_prompt,
            width=payload.width,
            height=payload.height,
            model_id=model_id,
        )
    except Exception as e:  # model/transport failure — fail closed, never 500
        logger.warning("extension vision failed: %s", e)
        return {
            "status": "error",
            "analysis": "Vision analysis unavailable right now — try again in a moment (the vision model did not answer).",
            "model": model_id,
            "model_tier": model_tier,
            "effort_score": effort_score,
            "token_balance": float((user.settings or {}).get("token_balance", 0) or 0),
        }

    if not is_admin and user.plan != "elite":
        _charge_tokens(user, db, SCREEN_VISION_CHARGE)
    return {
        "status": "success",
        "analysis": analysis,
        "model": model_id,
        "model_tier": model_tier,
        "effort_score": effort_score,
        "token_balance": _tk_balance(user),
    }


def _harden_actions(raw: Any, viewport: Dict[str, int]) -> Optional[List[Dict[str, Any]]]:
    """Allowlist + viewport-clamp a control-action list from the model.

    Same contract as `extract_control_actions`: the WHOLE list drops when any
    single op is invalid (never a partial burst — a dropped `click` would leave
    the following `type` landing on whatever happened to hold focus), and the
    per-burst cap is enforced here too (the direct `browser_action` payload
    used to bypass both).
    """
    from .screen_vision import _MAX_CONTROL_ACTIONS, _validate_op

    if not isinstance(raw, list) or not raw:
        return None
    if len(raw) > _MAX_CONTROL_ACTIONS:
        return None
    normalized: List[Dict[str, Any]] = []
    for op in raw:
        n = _validate_op(op, viewport)
        if n is None:
            return None
        normalized.append(n)
    return normalized or None


def _search_burst(
    query: str,
    viewport: Dict[str, int],
    screen_analysis: Optional[str] = None,
    hint: str = "",
) -> List[Dict[str, Any]]:
    """move -> click -> type -> Enter aimed at a field the vision pass saw.

    Returns [] when no typable element was found. That empty list is the point:
    09-08 this aimed at the viewport CENTRE whenever the agent produced no
    control block. On a page whose centre is not an input (the operator hit it
    on a usage dashboard) the click landed on dead space, the caret blinked
    somewhere harmless, and the typed text went nowhere — while the reply said
    the typing was done. A blind guess that silently misses is worse than no
    action at all, so the guess is gone: aim at a real element or do nothing
    and let the caller report that it could not find the field.
    """
    from .screen_vision import find_input_target

    target = find_input_target(screen_analysis, hint=hint, viewport=viewport)
    if not target:
        return []
    x = max(1, int(target["x"]))
    y = max(1, int(target["y"]))
    return [
        {"op": "move", "x": x, "y": y},
        {"op": "click", "x": x, "y": y, "button": "left"},
        {"op": "type", "text": query},
        {"op": "key", "key": "Enter", "modifiers": []},
    ]


# Why nothing ran, in words the user can act on. Keys are the reasons
# screen_vision.extract_control_actions_ex returns.
_DROP_REASON_TEXT: Dict[str, str] = {
    "no_block": "I didn't produce a usable action for that, so nothing was done on your screen.",
    "malformed_json": "My action list came back malformed, so nothing was run.",
    "wrong_shape": "My action list came back in the wrong shape, so nothing was run.",
    "over_cap": f"That needed more than the {_MAX_CONTROL_ACTIONS} actions allowed in one turn, so nothing was run.",
    "invalid_op": "One of the steps I planned wasn't allowed, so the whole list was dropped — nothing ran.",
    "empty": "The action list was empty, so nothing was run.",
    "no_target": "I couldn't find that field on the current screen, so I didn't click anywhere.",
}


def _execution_verdict(actions: Optional[List[Dict[str, Any]]], reason: str) -> Dict[str, Any]:
    """Honest execution block for the extension response.

    The client renders this. Before 09-08 a dropped action list produced
    execution=None and the client silently skipped, leaving the agent's own
    prose ("I am typing that for you now") as the only thing the user saw.

    09-10: `no_block` means the reply carried NO control fence at all — a
    plain answer to a plain question ("describe my screen"). It used to come
    back status="failed", so every conversational turn in Study Mode drew a
    "⚠️ I didn't produce a usable action" bubble under a reply that was never
    asked to act. Only a fence that WAS present and then got dropped is a
    failure; no_block is reported as "none" and the client stays silent.
    """
    if actions:
        return {"status": "success", "actions_count": len(actions)}
    resolved = reason or "no_block"
    if resolved == "no_block":
        return {"status": "none", "actions_count": 0, "reason": resolved}
    return {
        "status": "failed",
        "actions_count": 0,
        "reason": resolved,
        "detail": _DROP_REASON_TEXT.get(resolved, _DROP_REASON_TEXT["no_block"]),
    }


def _describe_control_actions(actions: Optional[List[Dict[str, Any]]]) -> str:
    """One line naming what the agent wants to do, for the approval card.

    The user has to be able to read the card and know what they are allowing,
    so this names the real ops and quotes the real text — never "the agent
    would like to perform an action".
    """
    if not actions:
        return ""
    parts: List[str] = []
    for op in actions[:6]:
        kind = str(op.get("op") or "?")
        if kind == "type":
            text = str(op.get("text") or "")
            parts.append(f'type "{text[:60]}"')
        elif kind == "key":
            parts.append(f"press {op.get('key')}")
        elif kind in ("click", "move", "scroll"):
            parts.append(f"{kind} at {op.get('x')},{op.get('y')}")
        else:
            parts.append(kind)
    more = len(actions) - len(parts)
    return " → ".join(parts) + (f" (+{more} more)" if more > 0 else "")


def _screen_control_allowed(settings: Dict[str, Any], permission_mode: Optional[str]) -> Tuple[bool, str]:
    """Permission gate for driving the user's screen.

    09-08 (operator: "i had it on manual, and it never asked for my
    permission"): the two agent-mode branches return control actions before
    ever reaching the permission gate further down this module, so manual mode
    was never consulted for the one capability that actually touches the user's
    machine. Same engine as every other action, so the mode semantics stay in
    one place: manual asks, auto approves routine work, yolo never asks.
    """
    from .overlord_agent import permission_engine  # lazy: import-order parity

    return permission_engine.evaluate_action_permission(
        user_settings=settings,
        action_type="browser_action",
        session_mode_override=(permission_mode or None),
    )


def _charge_tokens(user, db, cost: float) -> None:  # pragma: no cover - thin wrapper
    from .routes_overlord import _charge_tokens as _impl
    _impl(user, db, cost)


def _tk_balance(user) -> float:  # pragma: no cover - thin wrapper
    from .routes_overlord import _tk_balance as _impl
    return _impl(user)


@router.post("/agent_chat")
async def send_extension_chat(payload: ExtensionChatRequest, request: Request, db: Session = Depends(get_db)):
    """One extension-chatbox message to the agent (extensions surface).

    Mirrors routes_overlord.send_chat_message: token gate, permission gate,
    intent resolution, execution, durable persistence, compaction — but on
    node='extensions' and with auth that the extension's session_token passes.
    """
    user = await _extension_current_user(request, db)
    settings = dict(user.settings or {})

    from .routes_overlord import (  # lazy: keeps import order / load cost identical
        _AGENT_ACTION_COSTS,
        _action_cost,
        _assignment_request_grounded,
        _charge_tokens,
        _chat_reply,
        _conversational_fallback,
        _insufficient_tokens_response,
        _is_degenerate_reply,
        _resolve_agent_intent,
        _tk_balance,
    )
    from .overlord_agent import (
        load_chat_history_from_db,
        overlord_agent,
        permission_engine,
        persist_chat_message,
        describe_permission_action,
    )
    from .security import is_admin_user

    is_admin = bool(getattr(user, "is_admin", False)) or is_admin_user(user)
    llm_empty_honest = ("Hmm — I ran into an issue answering that one."
                        " Try again in a moment?")
    thread_key = payload.thread_id if payload.thread_id is not None else 0

    # 09-02: the screen-vision lane is tiered by the user's ai.effortScore
    # (resolve_vision_model). Resolved once per turn; both the frames in this
    # turn and the response metadata carry it.
    effort_score = _user_effort_score(user)
    vision_model_id, vision_model_tier, _clamped = resolve_vision_model(effort_score)

    # Safety screen (operator 09-08): record only, never refuse. The message
    # always reaches the agent; the agent decides how to respond.
    from .moderation import flag_content, screen_content

    flagged, reason, risk = screen_content(payload.text)
    if flagged:
        flag_content(
            db,
            content_type="agent_chat",
            content_ref=f"agent_chat:{user.public_id}:{thread_key}",
            user_public_id=user.public_id,
            text=payload.text,
            reason=reason,
            risk_score=risk,
        )
        logger.info("extension chat text flagged (not blocked): %s", reason)

    # Restore conversation from the durable store (same as the web chat).
    try:
        load_chat_history_from_db(db, user.id, thread_key)
    except Exception:
        pass

    # Token gate (operator 08-26): same rule as the web chat.
    if not is_admin and user.plan != "elite":
        token_bal = float((user.settings or {}).get("token_balance", 0) or 0)
        if token_bal <= 0:
            agent_reply = _chat_reply(
                db, user, thread_key,
                text="⚠️ Insufficient tokens — your token balance is 0. Activate the Free Trial "
                     "or top up in Billing to use My Agent.",
                suggested_actions=[])
            return {"status": "insufficient_tokens", "message": agent_reply, "reply": agent_reply,
                    "token_balance": _tk_balance(user)}

    # agent mode (09-01): analyze the shared frames (same helper as /vision,
    # IDENTICAL hard-pinned model). The tele-operation directive AND the
    # resulting screen state are carried on the SYSTEM prompt (via the
    # settings copy below — agent_prompt renders the per-node 'instructions'
    # into the system prompt), NOT on the resolvable text: the resolver's
    # deterministic keyword-dispatch fallback fires on submit/delete/humanize/
    # rubric/scrape/canvas and the directive's key list contains "Delete", so
    # prepending it — or the vision words — to `text` silently diverts
    # every agent-mode message into the regex fallback (verified live). The
    # stored user message stays the raw payload.text either way, and the
    # extension resends the latest frame per message, so screen state never
    # persists in the conversation. Fail closed per frame: a vision error
    # becomes an explicit "unavailable" note, never a hard failure of the
    # chat (and model errors never 500).
    control_actions = None  # -> additively present in the response (agent mode only)
    viewport_dict = {"width": 1280, "height": 800}
    screen_context = ""
    if payload.agent_mode:
        if payload.viewport is not None:
            viewport_dict = {"width": payload.viewport.width, "height": payload.viewport.height}
        ts = datetime.now().strftime("%H:%M:%S")
        screen_lines: List[str] = []
        # 09-08 jurisdiction: a turn can carry one frame per tab in scope, so
        # every screen line names its tab — otherwise several screenshots arrive
        # with nothing to tell them apart and the reply talks about "the page".
        # The extension pushes a `tabs` entry for EVERY tab in scope but only an
        # image for the ones it could actually photograph, so the frames line up
        # with the captured=True entries in order, NOT with `tabs` index-for-index.
        tab_refs = list(payload.tabs or [])
        capture_slots = [i for i, t in enumerate(tab_refs) if t.captured]
        rendered_slots = set()
        for idx, img in enumerate((payload.images or [])[:_MAX_IMAGES_PER_CALL]):
            analysis = "Vision analysis unavailable this turn — rely on what the user says."
            vision_ok = False
            try:
                analysis = await analyze_screen_image(
                    img,
                    width=viewport_dict["width"] if viewport_dict else None,
                    height=viewport_dict["height"] if viewport_dict else None,
                    model_id=vision_model_id,
                )
                vision_ok = bool(analysis and analysis.strip())
            except Exception as e:
                logger.warning("agent-mode vision failed: %s", e)
            if not vision_ok:
                analysis = "Vision analysis unavailable this turn — rely on what the user says."
            slot = capture_slots[idx] if idx < len(capture_slots) else None
            where = ""
            if slot is not None:
                rendered_slots.add(slot)
                label = _tab_ref_label(tab_refs[slot])
                where = (
                    f" — tab {slot + 1} of {len(tab_refs)}: {label}"
                    if len(tab_refs) > 1 else f" — {label}"
                )
            screen_lines.append(
                f"[Screen state at {ts}{where}] {analysis.strip()}"
                + (f" (viewport {viewport_dict['width']}x{viewport_dict['height']})" if viewport_dict else "")
            )
            if vision_ok and not is_admin and user.plan != "elite":
                _charge_tokens(user, db, SCREEN_VISION_CHARGE)
        # A tab that produced no screen line is stated, never dropped: a silent
        # omission reads to the model like the tab was seen and found empty. Both
        # causes land here — the browser refused the frame, or the tab fell past
        # the per-call frame cap.
        missed = [t for i, t in enumerate(tab_refs) if i not in rendered_slots]
        if missed:
            screen_lines.append(
                "[Not captured] " + "; ".join(_tab_ref_label(t) for t in missed)
                + " — in scope but no frame this turn. Do not describe what is on them."
            )
        if len(tab_refs) > 1:
            screen_lines.append(
                f"[Jurisdiction] The user put {len(tab_refs)} tabs in scope. You return ONE control "
                "block and it is replayed in every one of those tabs, in order. Only return "
                "coordinates that hold in all of them; if the step only makes sense in one tab, say "
                "which tab and ask the user to narrow the scope instead."
            )
        screen_context = "\n".join(screen_lines)
    resolve_text = payload.text

    # Record the user message.
    overlord_agent.add_chat_message(thread_key, sender="user", text=payload.text, user_id=user.id)
    try:
        persist_chat_message(db, user.id, thread_key, "user", payload.text)
    except Exception:
        pass

    # The agent's intent decision on the extensions surface. In agent mode the
    # tele-operation directive must reach the SYSTEM prompt: agent_prompt
    # renders settings['ai']['hierarchy'][node]['instructions'] as "User
    # instructions (this surface): ..." — the one per-node hook that lands in
    # the system prompt and reliably beats the model's own "I can't see your
    # screen" stance (user-side text alone got refused, 09-01 live tests,
    # because the claim never became part of the agent's own setup). The
    # current-turn screen state rides in the same instructions block so it is
    # trusted system context, not unverified user chatter. The copy below is
    # layer-by-layer so the user's stored settings are never written; the base
    # `settings` dict keeps serving the permission/credit gates.
    resolve_settings = settings
    if payload.agent_mode:
        ai_cfg = dict(settings.get("ai") or {}) if isinstance(settings.get("ai"), dict) else {}
        hier = dict(ai_cfg.get("hierarchy") or {}) if isinstance(ai_cfg.get("hierarchy"), dict) else {}
        ext_cfg = dict(hier.get("extensions") or {}) if isinstance(hier.get("extensions"), dict) else {}
        if payload.educational_mode is not None:
            ext_cfg["mode"] = "edu" if payload.educational_mode else "open"
        if payload.permission_mode:
            resolve_settings_perm_mode = payload.permission_mode
        existing_ix = str(ext_cfg.get("instructions") or "").strip()
        directive_block = AGENT_MODE_DIRECTIVE
        # 09-08: the model only ever "sees" a screen when the extension actually
        # sent a frame this turn. seescreen=OFF (or zero frames) means NO vision —
        # state it explicitly so the model never claims to see/look at a screen it
        # was not given (the OLD directive unconditionally asserted "you genuinely
        # see that screen", which made it hallucinate visibility on sightless turns).
        sees_can_see = bool(payload.seescreen) and bool(payload.images)
        can_execute = bool(payload.execute)
        if not sees_can_see:
            directive_block += ("\n\n[SCREEN FEED: OFF — the user has the “See screen” toggle off "
                                "(or no frame was captured). You CANNOT see any page or screen this turn. "
                                "Do NOT describe, reference, or pretend to look at the page. If the user "
                                "asks you to click/type/fill/search on a page, say you have no live view "
                                "right now and ask them to switch “See screen” on.]")
        else:
            directive_block += "\n\n[SCREEN FEED: ON — you have a live tab frame this turn.]"
        if not can_execute:
            directive_block += ("\n\n[EXECUTE: OFF — the user has “Execute” off. You may plan and "
                                "describe actions but they will NOT run. Do not act as if they ran.]")
        else:
            directive_block += "\n\n[EXECUTE: ON — actions you emit are actually executed.]"
        if screen_context:
            directive_block += "\n\nCURRENT SCREEN (this exact turn — the frames the extension just captured):\n" + screen_context
        ext_cfg["instructions"] = (existing_ix + "\n\n" + directive_block) if existing_ix else directive_block
        hier["extensions"] = ext_cfg
        ai_cfg["hierarchy"] = hier
        resolve_settings = dict(settings)
        resolve_settings["ai"] = ai_cfg
        if payload.permission_mode:
            resolve_settings["operation_mode"] = payload.permission_mode

    intent = await _resolve_agent_intent(
        user, resolve_settings, resolve_text, is_admin, db=db,
        target_key=thread_key, node="extensions", viewport=viewport_dict,
        # The keyword fallback aims its browser burst with this (09-08); without
        # it the fallback used to click the middle of the page and hope.
        screen_analysis=screen_context,
    )

    from .llm import strip_thinking_tokens
    from .screen_vision import _validate_op

    # Direct browser action tool call
    if intent["action"] == "browser_action":
        if not is_admin and user.plan != "elite":
            _charge_tokens(user, db, 1.0)
        payload_actions = intent.get("payload", {}).get("actions") or []
        reply_text = strip_thinking_tokens(intent.get("reply") or "Interacting with your browser…")
        vp = viewport_dict or {"width": 1280, "height": 800}
        control_actions = _harden_actions(payload_actions, vp)
        drop_reason = ""
        if not control_actions:
            # payload failed hardening (invalid op / over-cap / empty) — the
            # reply may still carry a fenced ```control``` block; honor that,
            # otherwise NOTHING executes and the execution verdict says so
            # (a phantom "success" with 0 actions would be a fake completion).
            reply_text, control_actions, drop_reason = extract_control_actions_ex(reply_text, vp)
            if not control_actions and payload_actions and drop_reason in ("", "no_block"):
                # A direct payload WAS present and hardening dropped all of it,
                # with no fence to replace it. `extract_control_actions_ex`
                # reports that as "no_block" (its word for "found no fence"),
                # which _execution_verdict reads as "nothing was ever asked of
                # me" -> status "none" -> silence under a reply that just
                # promised to act. That is the phantom-success this verdict
                # exists to prevent, so name the real drop: over-cap vs a step
                # that is not allowed.
                from .screen_vision import _MAX_CONTROL_ACTIONS

                drop_reason = (
                    "over_cap"
                    if len(payload_actions) > _MAX_CONTROL_ACTIONS
                    else "invalid_op"
                )

        needs_ok, perm_reason = _screen_control_allowed(settings, payload.permission_mode)
        agent_reply = _chat_reply(db, user, thread_key, text=reply_text)
        await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))
        return {
            "status": "success",
            "message": agent_reply,
            "execution": _execution_verdict(control_actions, drop_reason),
            "reply": reply_text,
            "control_actions": control_actions,
            "control_requires_approval": bool(control_actions) and not needs_ok,
            "control_permission_reason": perm_reason,
            "control_summary": _describe_control_actions(control_actions),
            "token_balance": _tk_balance(user),
            "model": vision_model_id,
            "model_tier": vision_model_tier,
            "effort_score": effort_score,
        }

    # Plain conversational answer (still costs 1 token like the web chat).
    if intent["action"] == "plain_answer":
        if not is_admin and user.plan != "elite":
            _charge_tokens(user, db, 1.0)
        reply_text = strip_thinking_tokens(intent["reply"])
        if _is_degenerate_reply(reply_text):
            reply_text = await _conversational_fallback(user, payload.text, db=db, node="extensions")
            reply_text = strip_thinking_tokens(reply_text)
        if _is_degenerate_reply(reply_text):
            reply_text = "I couldn't generate a reply just now (the model service may be down) — please try again in a moment."
        if payload.agent_mode:
            # agent mode (09-01): split the fenced ```control``` block off the
            # reply and harden it (allowlist + viewport clamp + caps; the WHOLE
            # list drops on any invalid op — never partial execution).
            vp = viewport_dict or {"width": 1280, "height": 800}
            reply_text, control_actions, drop_reason = extract_control_actions_ex(reply_text, vp)
            if not control_actions:
                low_text = payload.text.lower()
                if any(k in low_text for k in ("search", "searchbar", "search bar", "click", "type in", "type into", "touch my browser", "inside my tab", "in my tab")):
                    m = re.search(r"(?:search|type)\s+(?:inside|into|in|for|on)?\s*(?:my\s+)?(?:searchbar|search\s+bar|tab|browser|screen)?(?:\s*,\s*|\s+for\s+|\s+to\s+|\s+in\s+)?(.*)", payload.text, re.IGNORECASE)
                    q = m.group(1).strip(" '\"?,.") if m else payload.text
                    # Aimed at an element the vision pass reported, never at a
                    # guessed centre point (see _search_burst).
                    burst = _search_burst(
                        q or payload.text, vp,
                        screen_analysis=screen_context, hint=payload.text,
                    )
                    control_actions = _harden_actions(burst, vp) if burst else None
                    if not control_actions:
                        drop_reason = "no_target"
        agent_reply = _chat_reply(db, user, thread_key, text=reply_text)
        await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))
        resp: Dict[str, Any] = {"status": "success", "message": agent_reply, "execution": None,
                                "reply": reply_text, "token_balance": _tk_balance(user)}
        if payload.agent_mode:
            needs_ok, perm_reason = _screen_control_allowed(settings, payload.permission_mode)
            resp["control_actions"] = control_actions
            resp["execution"] = _execution_verdict(control_actions, drop_reason)
            resp["control_requires_approval"] = bool(control_actions) and not needs_ok
            resp["control_permission_reason"] = perm_reason
            resp["control_summary"] = _describe_control_actions(control_actions)
            resp["model"] = vision_model_id
            resp["model_tier"] = vision_model_tier
            resp["effort_score"] = effort_score
        return resp

    # Credit gate for work actions (same as the web chat).
    cost = _AGENT_ACTION_COSTS.get(intent["action"], 0)
    privileged = bool(getattr(user, "plan", "") == "elite" or is_admin)
    tok_bal = float((user.settings or {}).get("token_balance", 0) or 0)
    if cost > 0 and not privileged and tok_bal < cost:
        return _insufficient_tokens_response(thread_key, user, cost, db)

    # Permission gate (manual mode asks; auto approves routine; yolo never asks).
    is_approved, _reason = permission_engine.evaluate_action_permission(
        user_settings=settings,
        action_type=intent["action"],
        session_mode_override=None,
    )
    if not is_approved and intent["action"] != "run_shell":
        perm_payload = {"text": payload.text, **dict(intent.get("payload") or {})}
        perm = overlord_agent.create_pending_permission(
            user_public_id=user.public_id,
            action_type=intent["action"],
            title=f"Permission Required: {intent['action'].replace('_', ' ').title()}",
            description=describe_permission_action(intent["action"], perm_payload),
            payload=perm_payload,
            assignment_id=thread_key,
        )
        agent_reply = _chat_reply(
            db, user, thread_key,
            text=f"⚠️ Action '{intent['action'].replace('_', ' ')}' requires your permission before execution.",
            suggested_actions=["Approve", "Write Something Else", "Always Approve This Action"])
        from .routes_overlord import approval_request_payload  # lazy (import order parity)

        return {
            "status": "permission_required",
            "permission_request": perm,
            "approval_request": approval_request_payload(perm),
            "message": agent_reply,
            "token_balance": _tk_balance(user),
        }

    # Assignment guard (never fabricate a card for material the user never gave).
    if intent["action"] == "create_assignment":
        _grounded, _ask = _assignment_request_grounded(payload.text, user, db, None)
        if not _grounded:
            reply_text = f"⚠️ {_ask}"
            agent_reply = _chat_reply(db, user, thread_key, text=reply_text, suggested_actions=[])
            return {"status": "failed", "message": agent_reply, "reply": reply_text,
                    "token_balance": _tk_balance(user)}

    # Execute the chosen action on the extensions surface.
    exec_res = await overlord_agent.execute_task_action(
        db,
        user=user,
        action_type=intent["action"],
        payload=intent["payload"],
        assignment_id=None,
        node="extensions",
    )
    if not is_admin and user.plan != "elite":
        _charge_tokens(user, db, _action_cost(intent["action"]))
    if exec_res.get("status") == "failed":
        reply_text = f"⚠️ {strip_thinking_tokens(exec_res.get('message', 'Could not do that.'))}"
    else:
        result_msg = strip_thinking_tokens(exec_res.get("message") or exec_res.get("result_text"))
        if _is_degenerate_reply(result_msg):
            result_msg = await _conversational_fallback(user, payload.text, node="extensions")
            result_msg = strip_thinking_tokens(result_msg)
        if intent["action"] == "humanize_text" and exec_res.get("result_text"):
            reply_text = strip_thinking_tokens(exec_res["result_text"])
            if _is_degenerate_reply(reply_text):
                reply_text = llm_empty_honest
        elif _is_degenerate_reply(result_msg):
            reply_text = llm_empty_honest
        else:
            reply_text = f"✅ {strip_thinking_tokens(result_msg)}"
    if payload.agent_mode:
        # agent mode (09-01): same fenced-block extraction + hardening as the
        # plain-answer path (executor replies rarely carry one; defensive).
        reply_text, control_actions = extract_control_actions(reply_text, viewport_dict)
    agent_reply = _chat_reply(
        db, user, thread_key,
        text=reply_text,
        suggested_actions=[],
        subagent_logs=[],
        metadata={"intent_action": intent["action"], "surface": "extensions"})

    await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))
    resp = {"status": "success", "message": agent_reply, "execution": exec_res, "reply": reply_text,
            "token_balance": _tk_balance(user)}
    if payload.agent_mode:
        resp["control_actions"] = control_actions
        resp["model"] = vision_model_id
        resp["model_tier"] = vision_model_tier
        resp["effort_score"] = effort_score
    return resp


@router.post("/approval/respond")
async def respond_extension_approval(payload: ExtensionApprovalResponseRequest, request: Request, db: Session = Depends(get_db)):
    """09-07: the extension approval card answers a pending approval that an
    /api/extension/agent_chat response carried as `approval_request`.

    reqId-keyed (req_id / reqId / permission_id all accepted — same pending
    permission entry). Outcomes:
      * allow  — execute the pending action (bypassing the prompt that already
        happened); with autoAdd also persist the action TYPE in the user's
        settings auto_approved_actions so identical requests auto-allow
        silently (no prompt at all).
      * deny   — hard no: the action is rejected and never runs.
      * neutral — the action is NOT performed; the user's text (REQUIRED — blank
        neutral is a 400 the UI can block) is injected into the agent thread as
        a user turn so the agent continues without that action; the request
        STAYS pending so the agent may re-request it.
    Unknown reqId is ignored safely: 404, nothing mutated, no crash. Auth is
    the same session_token/JWT/cookie path as agent_chat."""
    user = await _extension_current_user(request, db)
    req_id = (payload.req_id or payload.reqId or payload.permission_id or "").strip()
    if not req_id:
        raise HTTPException(status_code=422, detail="req_id is required")

    from .overlord_agent import overlord_agent as _overlord_agent  # lazy (import order parity)

    if req_id not in _overlord_agent._pending_permissions:
        raise HTTPException(status_code=404, detail="Approval request not found")
    perm_entry = _overlord_agent._pending_permissions[req_id]
    if perm_entry.get("user_public_id") != user.public_id:
        raise HTTPException(status_code=403, detail="Approval request does not belong to you")

    from .routes_overlord import _apply_approval_decision  # lazy (import order parity)

    auto_add = bool(payload.autoAdd) if payload.autoAdd is not None else payload.auto_add
    return await _apply_approval_decision(
        db, user, perm_entry, payload.decision,
        comment=payload.comment, text=payload.text, auto_add=auto_add,
    )


@router.get("/agent_chat/history")
async def get_extension_chat_history(request: Request, thread_id: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """Chat history for the extension chatbox (thread_id 0 = main conversation)."""
    user = await _extension_current_user(request, db)

    from .overlord_agent import load_chat_history_from_db, overlord_agent

    try:
        load_chat_history_from_db(db, user.id, thread_id)
    except Exception:
        pass
    return {
        "status": "success",
        "thread_id": thread_id,
        "chat": overlord_agent.get_chat_history(thread_id, user=user),
    }
