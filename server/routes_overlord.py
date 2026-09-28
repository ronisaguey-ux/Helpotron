"""FastAPI routes for Overlord Main Agent, Assignment Cards, 3 Operation Modes, and Permission System."""
from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import logging
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from .agent_files import delete_agent_file, list_agent_files, save_agent_file
from .agent_memory import append_memory, delete_memory, load_memory, replace_memory
from .agent_prompt import agent_persona_block, agent_system_prompt
from .llm import strip_thinking_tokens  # noqa: F401 — reply plumbing strips every LLM text
from .database import AgentChatMessage, AgentChatThread, Assignment, CreditTransaction, StudyMaterial, UniversalDumpItem, User, get_db
from .overlord_agent import READONLY_ACTION_TYPES, agent_display_name, overlord_agent, permission_engine, describe_permission_action

router = APIRouter(prefix="/api", tags=["overlord_and_cards"])

# Sub-routers for endpoints that used to be registered in server/main.py.
#
# main.py is skip-worktree'd — it carries a local dev-login bypass the owner
# keeps out of the repository — and git refuses to stage ANY change to that file,
# so a route registered there exists only on this machine and is missing from a
# fresh clone. Registering from this tracked router fixes that: prefixes compose,
# so "/trash" here resolves to /api/trash.
from .routes_billing import router as _billing_router  # noqa: E402
from .routes_trash import router as _trash_router      # noqa: E402

router.include_router(_billing_router)
router.include_router(_trash_router)



# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class TaskRequest(BaseModel):
    assignment_id: Optional[int] = None
    action_type: str = Field(..., description="analyze_rubric | draft_section | humanize_text | submit_assignment | custom")
    title: str = "Sub-Agent Task Execution"
    description: str = ""
    payload: Dict[str, Any] = {}
    session_mode_override: Optional[str] = None  # manual | auto | yolo


class ChatMessageRequest(BaseModel):
    assignment_id: int = 0  # 0 = generic chat (no assignment bubble); server treats 0/None as no assignment
    text: str
    action_type: Optional[str] = None
    session_mode_override: Optional[str] = None
    thread_id: Optional[int] = None  # chat thread (0/none = legacy single conversation)
    # Resume a paused reply (owner 2026-09-18). When set, the partial text the
    # user already saw is handed back to the model to continue from, and NO user
    # message is recorded — the paused turn is one turn, not two. Without this,
    # resuming would have to be faked by sending the half-finished answer as a
    # giant synthetic user message, which would then live in the thread forever
    # and be re-read on every later turn.
    continue_from: Optional[str] = Field(None, max_length=20000)


class ThreadCreateRequest(BaseModel):
    title: Optional[str] = None


class ThreadRenameRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    pinned: Optional[bool] = None


class PermissionResponseRequest(BaseModel):
    permission_id: str
    decision: str = Field(
        ...,
        description=(
            "approve | reject | always_approve | write_something_else | neutral "
            "(aliases accepted: allow=approve, deny=reject, message=neutral). "
            "neutral: action NOT performed, text routed back to the agent as "
            "feedback, request stays pending."
        ),
    )
    comment: Optional[str] = None
    replacement_text: Optional[str] = None
    text: Optional[str] = Field(None, description="user feedback text — REQUIRED for decision=neutral")
    auto_add: bool = Field(False, description="approve + persist the action type into the user's auto-approved actions store")


class ModeUpdateRequest(BaseModel):
    mode: str = Field(..., description="manual | auto | yolo")
    is_session_override: bool = False


class AutoApprovedRuleRequest(BaseModel):
    rule: str


def _is_degenerate_reply(text: str) -> bool:
    """True when a reply carries no substance: empty, or punctuation/emoji-
    only (a lone '👍' has NO word characters)."""
    t = (text or "").strip()
    return (not t) or (re.fullmatch(r"[\W_]+", t, re.UNICODE) is not None)


# ─── Helper to extract user ───────────────────────────────────────────────────

def _get_current_user(request: Request, db: Session) -> User:
    """Authenticated user lookup (remediation BATCH-11): identity comes only
    from a valid Bearer token or session cookie — the X-Public-ID header is
    never an identity and no user is auto-selected from the DB."""
    from .routes_features import get_current_authenticated_user
    return get_current_authenticated_user(request, db)
# Bubble vocabulary normalization (operator 09-01): the dump classifier and
# scrape scanner store granular subjects ("Earth Science", "Chemistry",
# "Physics", "Astronomy") that the dashboard bubble grid's fixed vocabulary
# cannot match — those cards surfaced only in the "all" bubble. Natural-science
# granular subjects map onto the default "Biology & Life Sciences" bubble label;
# the honest stored value is preserved on the card in subject_detail.
_SCIENCE_BUBBLE_LABEL = "Biology & Life Sciences"
_SCIENCE_BUBBLE_MAP = {
    "biology": _SCIENCE_BUBBLE_LABEL,
    "biochemistry": _SCIENCE_BUBBLE_LABEL,
    "earth science": _SCIENCE_BUBBLE_LABEL,
    "earth and space science": _SCIENCE_BUBBLE_LABEL,
    "space science": _SCIENCE_BUBBLE_LABEL,
    "physical science": _SCIENCE_BUBBLE_LABEL,
    "life science": _SCIENCE_BUBBLE_LABEL,
    "general science": _SCIENCE_BUBBLE_LABEL,
    "environmental science": _SCIENCE_BUBBLE_LABEL,
    "marine science": _SCIENCE_BUBBLE_LABEL,
    "geology": _SCIENCE_BUBBLE_LABEL,
    "geoscience": _SCIENCE_BUBBLE_LABEL,
    "chemistry": _SCIENCE_BUBBLE_LABEL,
    "physics": _SCIENCE_BUBBLE_LABEL,
    "astronomy": _SCIENCE_BUBBLE_LABEL,
}
# Single-word families also match prefixed variants ("Chemistry Honors",
# "AP Chemistry", "Physics 1").
_SCIENCE_PREFIXES = ("chemistry", "physics", "astronomy", "geology",
                     "geoscience", "biology", "biochemistry", "science")


def _bubble_vocab_subject(subject: str) -> str:
    """Map a granular subject onto the dashboard's default bubble vocabulary.

    Already-vocabulary and non-science subjects pass through untouched;
    natural-science granular values map to "Biology & Life Sciences". Callers
    keep the original stored value in subject_detail — never lose data."""
    if not subject:
        return ""
    low = subject.strip().lower()
    if low in _SCIENCE_BUBBLE_MAP:
        return _SCIENCE_BUBBLE_MAP[low]
    for prefix in _SCIENCE_PREFIXES:
        if low.startswith(prefix + " ") or low.startswith(prefix + "-") or low.startswith("ap " + prefix):
            return _SCIENCE_BUBBLE_LABEL
    return subject


@router.get("/assignments/cards")
async def get_assignment_cards(request: Request, db: Session = Depends(get_db)):
    """Returns assignments formatted as collapsed dashboard cards with essential metadata."""
    user = _get_current_user(request, db)
    assignments = db.query(Assignment).filter(Assignment.user_id == user.id).order_by(Assignment.created_at.desc()).all()

    cards = []
    for a in assignments:
        progress = a.progress or {}
        # Status normalization
        raw_status = a.status or "not_started"
        if raw_status in ("tracked", "pending"):
            status_label = "Not Started"
        elif raw_status in ("in_progress", "transcribed"):
            status_label = "In Progress"
        elif raw_status == "materials_ready":
            status_label = "Humanizing"
        elif raw_status in ("draft_ready", "draft_risky"):
            status_label = "Ready for Review"
        elif raw_status == "completed":
            status_label = "Submitted"
        else:
            status_label = raw_status.replace("_", " ").title()

        # Honest fields (operator 08-27): real creators write progress keys
        # under "course"/"teacher_name"/"ai_score"; the old "subject"/
        # "course_code" fallbacks fabricated "GEN-101"/"Prof. Academic". Never
        # invent values — missing data is an empty/null field, the UI renders
        # "—" / "Not checked".
        card = {
            "id": a.id,
            "name": a.title,
            "subject": "",
            "class_code": progress.get("course_code") or "",
            "teacher_name": progress.get("teacher_name") or "",
            "estimated_time": progress.get("estimated_time") or "",
            "status": status_label,
            "due_date": a.due_date or "No Deadline",
            "score_ai": progress.get("ai_score"),
            "detector_risk": progress.get("detector_risk"),
        }

        # Subject routing (operator 09-01): manual-route/manual-create paths
        # stored no subject at all — backfill from the assignment title with the
        # same deterministic classifier the extension scrape flow uses (title
        # keywords, never an LLM call).
        raw_subject = progress.get("subject") or progress.get("course") or ""
        if not raw_subject:
            from .main import _classify_subject as _scrape_classify
            card["subject"], fallback_code = _scrape_classify(a.title)
            if not card["class_code"]:
                card["class_code"] = fallback_code or ""
        else:
            card["subject"] = raw_subject

        # Bubble vocabulary (operator 09-01): granular natural-science subjects
        # ("Earth Science", "Chemistry") match no default bubble title — normalize
        # the routed label so the card lands in its subject bubble (not only
        # "all"); the stored granular value stays available in subject_detail.
        bubble_subject = _bubble_vocab_subject(card["subject"])
        if bubble_subject != card["subject"]:
            card["subject_detail"] = card["subject"]
            card["subject"] = bubble_subject

        cards.append(card)

    return {"status": "success", "cards": cards}


def _assignment_materials(db, assignment_id: int) -> list:
    """Saved StudyMaterial rows for an assignment, newest first (08-27: the
    generated study guides/flashcards need a real access point in the UI)."""
    rows = (db.query(StudyMaterial)
            .filter(StudyMaterial.assignment_id == assignment_id)
            .order_by(StudyMaterial.id.desc()).all())
    return [{
        "id": m.id, "kind": m.kind, "content": m.content, "model_used": m.model_used,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    } for m in rows]


def _assignment_dump_lookup(db, user, assignment) -> Optional[UniversalDumpItem]:
    """The REAL UniversalDumpItem row behind an assignment bubble (operator
    08-28): progress.dump_file_id first (auto-route), then a matched/finalized
    dump linked via matched_assignment_id. None when the assignment was created
    by hand — never invent a dump identity. Shared by the full-view route (the
    provenance block) and the chat assignment-context builder."""
    progress = assignment.progress or {}
    dump_row = None
    dump_file_id = progress.get("dump_file_id")
    if dump_file_id:
        dump_row = db.query(UniversalDumpItem).filter(
            UniversalDumpItem.id == dump_file_id, UniversalDumpItem.user_id == user.id
        ).first()
    if dump_row is None:
        dump_row = (
            db.query(UniversalDumpItem)
            .filter(
                UniversalDumpItem.matched_assignment_id == assignment.id,
                UniversalDumpItem.user_id == user.id,
            )
            .order_by(UniversalDumpItem.id.desc())
            .first()
        )
    return dump_row


def _dump_info_dict(dump_row: Optional[UniversalDumpItem]) -> Optional[dict]:
    """Stable dump_info dict for the full-view payload (None when no dump row)."""
    if dump_row is None:
        return None
    return {
        "id": dump_row.id,
        "file_name": dump_row.file_name,
        "file_type": dump_row.file_type,
        "status": dump_row.status,
        "requested_action": dump_row.requested_action,
        "auto_match_confidence": dump_row.auto_match_confidence,
        "overlord_notes": dump_row.overlord_notes,
        "created_at": dump_row.created_at.isoformat() if dump_row.created_at else None,
    }


def _agent_assignment_context(db, user, assignment: Assignment) -> str:
    """Assignment-bubble grounding block for the chat system prompt (operator
    08-28): the subagent team previously had NO idea which assignment it was
    talking about — the prompt carried nothing about the bubble. Real metadata
    (name, subject, class_code, teacher_name, status) + the originating dump's
    identity + a short excerpt (cap 1500 chars) of the extracted dump text, so
    "question 3" has the actual sheet behind it. "" never — returns the block,
    callers append it additively (guards/tails untouched)."""
    progress = assignment.progress or {}
    dump_row = _assignment_dump_lookup(db, user, assignment)
    excerpt = ""
    if dump_row is not None:
        excerpt = str(dump_row.extracted_text or "").strip()
    if not excerpt:
        excerpt = str(assignment.prompt or "").strip()
    lines = [
        "ASSIGNMENT CONTEXT (this chat is the bubble for this REAL assignment — the user says \"question 3\" etc. refers to THIS material):",
        f"Name: {assignment.title or '(untitled)'}",
        f"Subject: {progress.get('subject') or progress.get('course') or '(unknown)'}",
        f"Class code: {progress.get('course_code') or '(unknown)'}",
        f"Teacher: {progress.get('teacher_name') or '(unknown)'}",
        f"Status: {assignment.status or '(unknown)'}",
    ]
    if dump_row is not None:
        lines.append(
            f"Dump source file: {dump_row.file_name or '(unknown)'} "
            f"({dump_row.file_type or 'file'}, status {dump_row.status or 'unknown'})"
        )
    if excerpt:
        lines.append("EXTRACTED CONTENT (start of the real material this assignment is built from):")
        lines.append(excerpt[:1500])
    return "\n".join(lines) + "\n\n"


@router.get("/assignment/{assignment_id}/full-view")
async def get_assignment_full_view(assignment_id: int, request: Request, db: Session = Depends(get_db)):
    """Returns comprehensive full-page assignment details: prompt, rubric, attachments, subagent progress."""
    user = _get_current_user(request, db)
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id, Assignment.user_id == user.id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    progress = assignment.progress or {}
    chat_history = overlord_agent.get_chat_history(assignment_id, user=user)

    # Provenance (operator 08-28): the real UniversalDumpItem row that created
    # this bubble (auto-route writes progress.dump_file_id; matched/finalized
    # dumps are linked via matched_assignment_id). None when the assignment was
    # created by hand — never invent a dump identity. (Shared lookup helper
    # _assignment_dump_lookup — same logic the chat context uses.)
    dump_row = _assignment_dump_lookup(db, user, assignment)
    dump_info = _dump_info_dict(dump_row)

    return {
        "status": "success",
        "assignment": {
            "id": assignment.id,
            "title": assignment.title,
            "prompt": assignment.prompt or "",
            "due_date": assignment.due_date,
            "status": assignment.status,
            "rubric": progress.get("rubric"),
            "attached_files": progress.get("attached_files") or [],
            "subagent_progress": progress.get("subagent_steps") or [],
            # Honest metadata (operator 08-28): real values written by the
            # creator/engine only — empty string when genuinely missing.
            "subject": progress.get("subject") or progress.get("course") or "",
            "class_code": progress.get("course_code") or "",
            "teacher_name": progress.get("teacher_name") or "",
            # Completed work from Assignment Dump "do it" finalize (operator 08-26).
            "do_it_work": progress.get("do_it_work"),
            # Team-direction first draft + real AI-detector verdicts. The
            # working-draft card renders these; without them it falls back to a
            # placeholder "88%" and "PASSED STEALTH" no matter what (09-06).
            "first_draft": progress.get("first_draft"),
            "ai_score": progress.get("ai_score"),
            "detector_risk": progress.get("detector_risk"),
            "detector_passed": progress.get("detector_passed"),
            "detector_details": progress.get("detector_details"),
            "detector_scored_chars": progress.get("detector_scored_chars"),
            "detector_at": progress.get("detector_at"),
            "dump_info": dump_info,
        },
        "materials": _assignment_materials(db, assignment_id),
        "chat_history": chat_history,
    }


@router.get("/assignment/{assignment_id}/launch-doc-payload")
async def get_assignment_launch_doc_payload(assignment_id: int, request: Request, db: Session = Depends(get_db)):
    """Returns cleaned, formatted text payload ready for assistive typing into Google Docs."""
    user = _get_current_user(request, db)
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id, Assignment.user_id == user.id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    progress = assignment.progress or {}
    do_it_work = progress.get("do_it_work")
    materials = _assignment_materials(db, assignment_id)

    text_to_type = do_it_work or ""
    if not text_to_type and materials:
        for m in materials:
            content = m.get("content_text") or m.get("content") or ""
            if content:
                text_to_type = content
                break
    if not text_to_type:
        text_to_type = assignment.prompt or ""

    word_count = len(text_to_type.split())
    return {
        "status": "success",
        "assignment_id": assignment.id,
        "title": assignment.title,
        "text": text_to_type,
        "word_count": word_count,
        "estimated_minutes_at_65wpm": max(1, round(word_count / 65.0)),
        "subject": progress.get("subject") or progress.get("course") or "",
    }


class LaunchToDocRequest(BaseModel):
    """A launch request. Everything is optional: the server owns the defaults, so
    an extension that sends nothing but an assignment id still gets a full plan."""
    assignment_id: Optional[int] = None
    preset_id: Optional[str] = Field(None, max_length=40)
    text: Optional[str] = Field(None, max_length=200_000)
    tab_id: Optional[int] = None
    overrides: Optional[Dict[str, Any]] = None


def _resolve_launch_text(payload: "LaunchToDocRequest", user, db) -> tuple:
    """Resolve the text a launch will type: the assignment's do_it_work, else the
    first material with content, else the prompt. Shared by the plan and stream
    endpoints so both agree on WHAT gets typed; only the HOW (plan vs stream) differs."""
    title: Optional[str] = None
    text = ""
    subject = ""
    assignment_id = payload.assignment_id
    if assignment_id:
        assignment = (
            db.query(Assignment)
            .filter(Assignment.id == assignment_id, Assignment.user_id == user.id)
            .first()
        )
        if not assignment:
            raise HTTPException(404, "Assignment not found")
        progress = assignment.progress or {}
        text_to_type = progress.get("do_it_work") or ""
        if not text_to_type:
            for m in _assignment_materials(db, assignment_id):
                content = m.get("content_text") or m.get("content") or ""
                if content:
                    text_to_type = content
                    break
        if not text_to_type:
            text_to_type = assignment.prompt or ""
        title = assignment.title
        text = text_to_type
        subject = progress.get("subject") or progress.get("course") or ""
    return title, text, subject, assignment_id


@router.get("/launch-to-doc/config")
async def get_launch_to_doc_config(request: Request, db: Session = Depends(get_db)):
    """The Launch to Doc UI contract: cadence presets, copy and typing defaults.

    Served rather than hardcoded in the extension so the panel's menu and the
    engine's config can never disagree about what "Academic" means, and so either
    can be changed without shipping a new extension build through review.
    """
    _get_current_user(request, db)
    from .launch_to_doc import build_launch_config

    return build_launch_config()


@router.post("/launch-to-doc/launch")
async def post_launch_to_doc_launch(
    payload: LaunchToDocRequest, request: Request, db: Session = Depends(get_db)
):
    """Mark an assignment as LAUNCHED — the hand-off, not the typing.

    Owner 2026-09-19: *"the launch to doc button isnt supposed to start streaming
    text automatically, ur just supposed to click launch to doc, then in the
    extension u see the launched assignment"*.

    So this is the whole website-side action: it records WHICH assignment is
    being worked on and with what text, and stops there. Nothing is typed, no
    browser is driven, no stream starts. The extension reads the record (see
    `GET /launch-to-doc/launched`) and presents the assignment as ready to type,
    which keeps the typing itself an explicit, user-started act inside the
    extension.
    """
    user = _get_current_user(request, db)
    if not payload.assignment_id:
        raise HTTPException(400, "An assignment is required to launch to a doc.")

    title, text, subject, assignment_id = _resolve_launch_text(payload, user, db)

    settings = dict(user.settings or {})
    settings["launch_to_doc"] = {
        "assignment_id": assignment_id,
        "title": title or "",
        "subject": subject or "",
        "preset_id": payload.preset_id or "",
        # The resolved text is stored so the extension types exactly what the
        # website showed, with no second resolution that could disagree.
        "text": text or "",
        "launched_at": datetime.now(timezone.utc).isoformat(),
    }
    user.settings = settings
    # Settings is a JSON blob: an ORM-cached shallow write is skipped, so this
    # goes through the same core UPDATE the rest of the settings paths use.
    from .overlord_agent import _persist_user_settings
    _persist_user_settings(db, user, settings)

    return {
        "status": "success",
        "assignment_id": assignment_id,
        "title": title or "",
        "message": (
            f"“{title or 'This assignment'}” is ready in the extension — open Helpotron "
            f"there and press Start when you want it typed."
        ),
    }


@router.get("/launch-to-doc/launched")
async def get_launch_to_doc_launched(request: Request, db: Session = Depends(get_db)):
    """The assignment the website last launched, for the extension to present.

    Returns `launched: null` when nothing has been launched — the extension then
    falls back to its normal assignment picker rather than showing stale state.
    """
    user = _get_current_user(request, db)
    record = (dict(user.settings or {})).get("launch_to_doc") or None
    if not isinstance(record, dict) or not record.get("assignment_id"):
        return {"status": "success", "launched": None}
    return {"status": "success", "launched": record}


@router.post("/launch-to-doc/plan")
async def post_launch_to_doc_plan(
    payload: LaunchToDocRequest, request: Request, db: Session = Depends(get_db)
):
    """The complete launch plan, which the extension applies mechanically.

    All decision-making lives here — which preset, what cadence, where the draft
    goes, and a clamped typing config. The extension resolves the tab, focuses it
    and dispatches the stream; it holds no policy of its own, so tuning this
    behaviour is a server deploy rather than an extension release.
    """
    user = _get_current_user(request, db)
    from .launch_to_doc import build_launch_plan

    title, text, subject, assignment_id = _resolve_launch_text(payload, user, db)

    return build_launch_plan(
        title=title,
        text=text,
        subject=subject,
        assignment_id=assignment_id,
        preset_id=payload.preset_id,
        text_override=payload.text,
        tab_id=payload.tab_id,
        overrides=payload.overrides,
    )


@router.post("/launch-to-doc/stream")
async def post_launch_to_doc_stream(
    payload: LaunchToDocRequest, request: Request, db: Session = Depends(get_db)
):
    """The server-driven action stream: the plan PLUS the primitive action list.

    The extension plays the stream verbatim through its fixed executor; it holds
    no cadence or humanization policy of its own. Tuning those is a server deploy.
    """
    user = _get_current_user(request, db)
    from .launch_to_doc import build_launch_plan
    from .action_stream import (
        ACTION_STREAM_VERSION,
        build_action_stream,
        validate_action_stream,
    )

    title, text, subject, assignment_id = _resolve_launch_text(payload, user, db)

    plan = build_launch_plan(
        title=title,
        text=text,
        subject=subject,
        assignment_id=assignment_id,
        preset_id=payload.preset_id,
        text_override=payload.text,
        tab_id=payload.tab_id,
        overrides=payload.overrides,
    )

    typing = plan["typing"]
    actions = build_action_stream(
        plan["text"],
        speed=typing["speed"],
        typo_rate=typing["typo_rate"],
        natural_pauses=typing["natural_pauses"],
        jitter=typing["jitter"],
        false_start_rate=typing["false_start_rate"],
    )
    ok, err = validate_action_stream(actions)
    if not ok:
        raise HTTPException(500, f"action stream did not validate: {err}")

    plan["action_stream"] = {
        "stream_version": ACTION_STREAM_VERSION,
        "actions": actions,
    }
    return plan


# ─── Chat threads (operator 08-26) ──────────────────────────────────────────
@router.get("/agent/threads")
async def list_chat_threads(request: Request, db: Session = Depends(get_db)):
    """All conversation threads for the user, newest first — pinned chats on
    top, most recently active first within each group (operator 08-27).
    `last_message_at` is the real timestamp of the newest agent_chat_messages
    row for the thread; thread.updated_at is the fallback for empty threads."""
    user = _get_current_user(request, db)
    threads = (
        db.query(AgentChatThread)
        .filter(AgentChatThread.user_id == user.id)
        .all()
    )
    # Bulk last-message lookup: message target keys are u{uid}:{tid} (scoped,
    # current) or {tid} (legacy unscoped rows load_chat_history_from_db reads).
    scoped_last: Dict[int, datetime] = {}
    bare_last: Dict[int, datetime] = {}
    if threads:
        keys = [f"u{user.id}:{t.id}" for t in threads] + [str(t.id) for t in threads]
        rows = (
            db.query(AgentChatMessage.target_key, func.max(AgentChatMessage.created_at))
            .filter(
                AgentChatMessage.user_id == user.id,
                AgentChatMessage.target_key.in_(keys),
            )
            .group_by(AgentChatMessage.target_key)
            .all()
        )
        for key, ts in rows:
            if key.startswith(f"u{user.id}:"):
                scoped_last[int(key.split(":", 1)[1])] = ts
            elif key.isdigit():
                bare_last[int(key)] = ts
    last_at = {**bare_last, **scoped_last}

    out = []
    for t in threads:
        ts = last_at.get(t.id) or t.updated_at
        out.append({
            "id": t.id,
            "title": t.title,
            "pinned": bool(t.pinned),
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "last_message_at": ts.isoformat() if ts else None,
        })

    # The current conversation (key 0) is a regular chat too — no special
    # "Main chat" entry (operator 08-27). It has no agent_chat_threads row;
    # its title/pin live in user.settings and its messages under key u{uid}:0.
    settings = dict(user.settings or {})
    cur_ts = None
    mrow = (
        db.query(func.max(AgentChatMessage.created_at))
        .filter(
            AgentChatMessage.user_id == user.id,
            AgentChatMessage.target_key.in_([f"u{user.id}:0", "0"]),
        )
        .scalar()
    )
    if mrow:
        cur_ts = mrow
    out.append({
        "id": 0,
        "title": str(settings.get("current_chat_title") or "current chat")[:120],
        "pinned": bool(settings.get("current_chat_pinned", False)),
        "created_at": None,
        "updated_at": cur_ts.isoformat() if cur_ts else None,
        "last_message_at": cur_ts.isoformat() if cur_ts else None,
    })

    # Pinned first, most recently active first within each group. ISO strings
    # order chronologically, so a stable two-pass sort does it: newest first,
    # then pin state — pin state wins but keeps the recency order per group.
    out.sort(key=lambda x: x["last_message_at"] or x["updated_at"] or "", reverse=True)
    out.sort(key=lambda x: not x["pinned"])
    return {"status": "success", "threads": out}


@router.post("/agent/threads")
async def create_chat_thread(payload: ThreadCreateRequest, request: Request, db: Session = Depends(get_db)):
    user = _get_current_user(request, db)
    t = AgentChatThread(user_id=user.id, title=(payload.title or "New chat").strip()[:120] or "New chat")
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"status": "success", "thread": {"id": t.id, "title": t.title}, "chat": overlord_agent.get_chat_history(t.id, user=user)}


@router.patch("/agent/threads/{thread_id}")
async def rename_chat_thread(thread_id: int, payload: ThreadRenameRequest, request: Request, db: Session = Depends(get_db)):
    user = _get_current_user(request, db)
    # id 0 = the current conversation: no thread row — title/pin live in
    # user.settings so they persist like any other thread (operator 08-27).
    if thread_id == 0:
        settings = dict(user.settings or {})
        if payload.title is not None:
            settings["current_chat_title"] = payload.title.strip()[:120] or "current chat"
        if payload.pinned is not None:
            settings["current_chat_pinned"] = bool(payload.pinned)
        user.settings = settings
        db.commit()
        return {"status": "success", "thread": {
            "id": 0,
            "title": str(settings.get("current_chat_title") or "current chat"),
            "pinned": bool(settings.get("current_chat_pinned", False)),
        }}
    t = db.query(AgentChatThread).filter(AgentChatThread.id == thread_id, AgentChatThread.user_id == user.id).first()
    if not t:
        raise HTTPException(404, "Thread not found")
    if payload.title is not None:
        t.title = payload.title.strip()[:120] or "New chat"
    if payload.pinned is not None:
        t.pinned = payload.pinned
    t.updated_at = datetime.now()
    db.commit()
    return {"status": "success", "thread": {"id": t.id, "title": t.title, "pinned": bool(t.pinned)}}


@router.delete("/agent/threads/{thread_id}")
async def delete_chat_thread(thread_id: int, request: Request, db: Session = Depends(get_db)):
    """Delete one chat thread and all of its messages (owner or admin only,
    operator 08-27). The in-memory cache entry for the conversation is dropped
    so the deleted thread can never resurrect on the next server restart."""
    user = _get_current_user(request, db)
    from .security import is_admin_user
    is_admin = bool(getattr(user, "is_admin", False)) or is_admin_user(user)
    # id 0 = the current conversation: deletable like any other chat (operator
    # 08-27) — drop its cache, its key-0 messages and its settings title/pin.
    if thread_id == 0:
        try:
            overlord_agent.forget_chat_history(0, user.id)
        except Exception:
            pass
        try:
            db.query(AgentChatMessage).filter(
                AgentChatMessage.user_id == user.id,
                AgentChatMessage.target_key.in_([f"u{user.id}:0", "0"]),
            ).delete(synchronize_session=False)
            settings = dict(user.settings or {})
            settings.pop("current_chat_title", None)
            settings.pop("current_chat_pinned", None)
            user.settings = settings
            db.commit()
        except Exception:
            db.rollback()
            pass
        return {"ok": True}
    t = db.query(AgentChatThread).filter(AgentChatThread.id == thread_id).first()
    if not t:
        raise HTTPException(404, "Thread not found")
    if t.user_id != user.id:
        raise HTTPException(403, "You can only delete your own chats")

    # In-memory conversation history (keyed u{user_id}:{thread_id}) — remove
    # before the DB rows so a concurrent GET can't reseed from stale rows.
    try:
        overlord_agent.forget_chat_history(thread_id, t.user_id)
    except Exception:
        pass

    # Persistent messages: AgentChatMessage has no FK to the thread (it stores
    # a scoped target_key string), so delete both the scoped key and the legacy
    # unscoped rows that load_chat_history_from_db also reads.
    try:
        db.query(AgentChatMessage).filter(
            AgentChatMessage.user_id == t.user_id,
            AgentChatMessage.target_key.in_([f"u{t.user_id}:{thread_id}", str(thread_id)]),
        ).delete(synchronize_session=False)
    except Exception:
        db.rollback()  # keep the thread delete valid even if message cleanup fails
    db.delete(t)
    db.commit()
    return {"ok": True}


# ─── 2. Operation Modes & Permissions ─────────────────────────────────────────

@router.get("/agent/mode")
async def get_operation_mode(request: Request, db: Session = Depends(get_db)):
    """Returns user's configured operation mode (manual, auto, yolo)."""
    user = _get_current_user(request, db)
    settings = user.settings or {}
    return {
        "operation_mode": settings.get("operation_mode", "auto"),
        "yolo_warning": "YOLO mode executes all actions without confirmation. Use at your own risk. The system will not ask for permission.",
        "auto_approved_actions": settings.get("auto_approved_actions", ["humanize", "analyze_rubric", "draft_section"]),
    }


@router.post("/agent/mode")
async def set_operation_mode(payload: ModeUpdateRequest, request: Request, db: Session = Depends(get_db)):
    """Updates user operation mode or sets session mode override."""
    user = _get_current_user(request, db)
    settings = dict(user.settings or {})
    settings["operation_mode"] = payload.mode.lower()
    user.settings = settings
    db.commit()
    return {
        "status": "success",
        "operation_mode": payload.mode.lower(),
        "is_session_override": payload.is_session_override,
    }


@router.get("/agent/permissions/pending")
async def get_pending_permissions(request: Request, db: Session = Depends(get_db)):
    """Fetches list of pending permission prompts waiting for user confirmation."""
    user = _get_current_user(request, db)
    pending = overlord_agent.get_pending_permissions(user.public_id)
    return {"status": "success", "count": len(pending), "pending": pending}


def approval_request_payload(perm: Dict[str, Any]) -> Dict[str, str]:
    """09-07: the popup/popout approval-card payload — req_id/title/summary.
    The extension card renders these and echoes `req_id` back as reqId."""
    return {"req_id": perm["id"], "title": perm["title"], "summary": perm["description"]}


async def _apply_approval_decision(
    db: Session,
    user: User,
    perm_entry: Dict[str, Any],
    decision: str,
    comment: Optional[str] = None,
    replacement_text: Optional[str] = None,
    text: Optional[str] = None,
    auto_add: bool = False,
) -> Dict[str, Any]:
    """Shared approval-decision core (web + extension surfaces — 09-05 pass).

    Decisions (extension vocabulary with stable server equivalents):
    'allow'/'approve' → execute the pending action; 'deny'/'reject' → hard no;
    'neutral'/'message' → do NOT execute, route the user's text back to the
    agent as a follow-up instruction while the request STAYS pending (the
    agent may re-request it or continue the plan without it); neutral WITHOUT
    text is a client error (400) — there is nothing useful to send; unknown/
    stale requests are 404 (never crash, never mutate). auto_add (allow only)
    also persists the action TYPE into the user's settings
    auto_approved_actions list, so the next identical request auto-allows
    silently (the permission engine consults that store first, in any mode).
    """
    decision = (decision or "").strip().lower()

    # Extension protocol aliases -> server vocabulary.
    if decision in ("allow", "approve"):
        decision = "approve"
    elif decision in ("deny", "reject"):
        decision = "reject"
    elif decision == "message":
        decision = "neutral"

    assignment_id = perm_entry.get("assignment_id")

    if decision == "neutral":
        feedback = (text or "").strip() or (comment or "").strip()
        if not feedback:
            raise HTTPException(
                status_code=400,
                detail="A neutral decision requires text (what the agent should do instead).",
            )
        # Action NOT performed; request stays pending (not a hard no).
        if assignment_id:
            overlord_agent.add_chat_message(
                assignment_id, sender="user", text=feedback, user_id=user.id)
            overlord_agent.add_chat_message(
                assignment_id, sender="overlord",
                text=(
                    f"ℹ️ Action '{perm_entry['action_type']}' is still pending approval "
                    f"(no decision — the request remains open). Your message was passed "
                    f"to the agent as feedback."
                ),
                user_id=user.id,
            )
        return {
            "status": "neutral",
            "decision": "neutral",
            "message": feedback,
            "permission_id": perm_entry["id"],
            "request_status": "still_pending",
        }

    if decision == "write_something_else":
        perm_entry["status"] = "cancelled"
        replacement = (replacement_text or comment or "Cancelled in favor of alternative instructions.").strip()
        if assignment_id:
            overlord_agent.add_chat_message(
                assignment_id,
                sender="user",
                text=replacement, user_id=user.id)
            overlord_agent.add_chat_message(
                assignment_id,
                sender="overlord",
                text=f"Understood. Pending action '{perm_entry['action_type']}' cancelled. Processing your new instruction: {replacement}", user_id=user.id)
        return {"status": "cancelled", "decision": "write_something_else", "message": replacement}

    if decision == "reject":
        perm_entry["status"] = "rejected"
        reject_note = (comment or "").strip() or "Declined by user."
        if assignment_id:
            overlord_agent.add_chat_message(
                assignment_id,
                sender="overlord",
                text=f"❌ Action '{perm_entry['action_type']}' rejected by user. Note: {reject_note}", user_id=user.id)
        return {"status": "rejected", "decision": "reject", "note": reject_note}

    if decision in ("always_approve", "approve"):
        if decision == "always_approve" or auto_add:
            # Persist the action TYPE into the user's auto-approved store
            # (settings JSON, same field the permission engine reads first)
            # so the next identical request auto-allows silently.
            settings = dict(user.settings or {})
            auto_list = set(settings.get("auto_approved_actions", []))
            auto_list.add(perm_entry["action_type"])
            settings["auto_approved_actions"] = list(auto_list)
            user.settings = settings
            db.commit()
            # persist_chat_message path not needed — this is settings, not chat.

        # Execute approved action (with optional user instructions/comments merged in)
        perm_entry["status"] = "approved"
        action_payload = dict(perm_entry["payload"])
        if (comment or "").strip():
            action_payload["user_instruction"] = comment.strip()

        # Admission control (owner 2026-09-17): under load the task QUEUES rather
        # than failing or fighting for CPU. Budget is 80% RAM / 85% CPU, measured
        # machine-wide. No timeout — a task must never be dropped for taking long.
        from .resource_guard import run_with_budget as _budgeted
        from .priority import priority_for_action as _prio
        exec_res = await _budgeted(lambda: overlord_agent.execute_task_action(
            db,
            user=user,
            action_type=perm_entry["action_type"],
            payload=action_payload,
            assignment_id=assignment_id,
        ),
            process=_prio(perm_entry["action_type"]))
        if assignment_id and (comment or "").strip():
            overlord_agent.add_chat_message(
                assignment_id,
                sender="user",
                text=f"Approval Note: {comment.strip()}", user_id=user.id)
        ret = {
            "status": "success",
            "decision": decision,
            "execution_result": exec_res,
            "comment": comment or None,
        }
        if auto_add:
            ret["auto_added"] = True
            ret["auto_approved_actions"] = user.settings.get("auto_approved_actions", [])
        return ret

    raise HTTPException(status_code=400, detail=f"Unknown approval decision: '{decision}'")


@router.post("/agent/permission/respond")
async def respond_to_permission(payload: PermissionResponseRequest, request: Request, db: Session = Depends(get_db)):
    """Handles user approval decision: approve (allow), reject (deny),
    always_approve, write_something_else, or neutral (09-07: action NOT
    performed, text routed back to the agent as feedback, request stays
    pending). allow + auto_add also stores the action type in the user's
    auto-approved settings so the next request skips the prompt."""
    user = _get_current_user(request, db)
    perm_entry = overlord_agent._pending_permissions.get(payload.permission_id)
    if not perm_entry:
        raise HTTPException(404, "Permission request not found")
    if perm_entry.get("user_public_id") != user.public_id:
        raise HTTPException(403, "Permission request does not belong to you")
    return await _apply_approval_decision(
        db, user, perm_entry, payload.decision,
        comment=payload.comment, replacement_text=payload.replacement_text,
        text=payload.text, auto_add=payload.auto_add,
    )


# ─── 3. Auto-Approved Actions Rule Manager ────────────────────────────────────

@router.get("/agent/permissions/rules")
async def list_auto_approved_rules(request: Request, db: Session = Depends(get_db)):
    """Returns list of auto-approved rules for the user."""
    user = _get_current_user(request, db)
    settings = user.settings or {}
    return {"status": "success", "rules": settings.get("auto_approved_actions", ["humanize", "analyze_rubric"])}


@router.post("/agent/permissions/rules")
async def add_auto_approved_rule(payload: AutoApprovedRuleRequest, request: Request, db: Session = Depends(get_db)):
    """Adds a custom rule to auto-approved actions."""
    user = _get_current_user(request, db)
    settings = dict(user.settings or {})
    rules = set(settings.get("auto_approved_actions", []))
    rules.add(payload.rule.strip())
    settings["auto_approved_actions"] = list(rules)
    user.settings = settings
    db.commit()
    return {"status": "success", "rules": list(rules)}


@router.post("/agent/permissions/rules/delete")
async def delete_auto_approved_rule_payload(payload: AutoApprovedRuleRequest, request: Request, db: Session = Depends(get_db)):
    """Removes a custom rule from auto-approved actions using structured JSON payload."""
    user = _get_current_user(request, db)
    settings = dict(user.settings or {})
    target_rule = payload.rule.strip()
    rules = [r for r in settings.get("auto_approved_actions", []) if r != target_rule]
    settings["auto_approved_actions"] = rules
    user.settings = settings
    db.commit()
    return {"status": "success", "rules": rules}


@router.delete("/agent/permissions/rules/{rule}")
async def remove_auto_approved_rule(rule: str, request: Request, db: Session = Depends(get_db)):
    """Removes a custom rule from auto-approved actions."""
    user = _get_current_user(request, db)
    settings = dict(user.settings or {})
    rules = [r for r in settings.get("auto_approved_actions", []) if r != rule]
    settings["auto_approved_actions"] = rules
    user.settings = settings
    db.commit()
    return {"status": "success", "rules": rules}


# ─── 3.5. Personal Agent: permanent memory, files, compaction, avatars ────────

class MemoryAppendRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class MemoryReplaceRequest(BaseModel):
    entries: List[Dict[str, Any]]


@router.get("/agent/memory")
async def get_agent_memory(request: Request, db: Session = Depends(get_db)):
    """The user's permanent memory — the agent always reads this."""
    user = _get_current_user(request, db)
    return {"status": "success", "entries": load_memory(user.public_id)}


@router.post("/agent/memory")
async def post_agent_memory(payload: MemoryAppendRequest, request: Request, db: Session = Depends(get_db)):
    """Append one memory entry."""
    user = _get_current_user(request, db)
    entry = append_memory(user.public_id, payload.text)
    return {"status": "success", "entry": entry, "entries": load_memory(user.public_id)}


@router.put("/agent/memory")
async def put_agent_memory(payload: MemoryReplaceRequest, request: Request, db: Session = Depends(get_db)):
    """Replace the full memory (used when the agent edits it itself)."""
    user = _get_current_user(request, db)
    entries = replace_memory(user.public_id, payload.entries)
    return {"status": "success", "entries": entries}


@router.delete("/agent/memory/{entry_id}")
async def delete_agent_memory(entry_id: str, request: Request, db: Session = Depends(get_db)):
    """Delete one memory entry."""
    user = _get_current_user(request, db)
    removed = delete_memory(user.public_id, entry_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Memory entry not found")
    return {"status": "success", "entries": load_memory(user.public_id)}


@router.post("/agent/upload-file")
async def upload_agent_file_endpoint(
    request: Request,
    file: UploadFile = File(...),
    kind: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    user = _get_current_user(request, db)
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    try:
        saved = await save_agent_file(user, file.filename or "upload.bin", kind or "skill", content, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "success", "file": saved, "files": list_agent_files(user.id)}


@router.get("/agent/files")
async def list_agent_files_route(request: Request, db: Session = Depends(get_db)):
    """List the current user's agent files (fix: client hits this on chat load)."""
    user = _get_current_user(request, db)
    return {"status": "success", "files": list_agent_files(user.id)}


@router.get("/agent/files/{file_id}")
async def read_agent_file_route(file_id: int, request: Request, db: Session = Depends(get_db)):
    """One file's content (operator 08-26: users can read back skills/rules/etc.)."""
    from .database import AgentFile
    from pathlib import Path as _P
    user = _get_current_user(request, db)
    row = db.query(AgentFile).filter(AgentFile.id == file_id, AgentFile.user_id == user.id).first()
    if not row:
        raise HTTPException(404, "File not found")
    try:
        from .agent_files import _AGENT_FILES_DIR  # same storage as upload
        p = _P(_AGENT_FILES_DIR) / row.disk_name
        if not p.exists():
            raise FileNotFoundError
        content = p.read_text(encoding="utf-8", errors="replace")[:100_000]
    except Exception:
        content = "(binary or unreadable — name/size only)"
    return {"status": "success", "file": {
        "id": row.id, "file_name": row.file_name, "kind": row.kind,
        "size_bytes": row.size_bytes, "content": content,
    }}


@router.delete("/agent/files/{file_id}")
async def delete_agent_file_route(file_id: int, request: Request, db: Session = Depends(get_db)):
    """Delete one agent file (DB row + disk)."""
    user = _get_current_user(request, db)
    if not delete_agent_file(user.id, file_id):
        raise HTTPException(status_code=404, detail="File not found")
    return {"status": "success", "files": list_agent_files(user.id)}


@router.post("/agent/chat/compact")
async def compact_agent_chat(request: Request, db: Session = Depends(get_db)):
    """Summarize + trim the agent's chat history (auto-compaction trigger)."""
    user = _get_current_user(request, db)
    result = await overlord_agent.compact_chat_history(user=user)
    return {"status": "ok", "message": result or "Chat history compacted."}


@router.post("/uploads/avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    kind: Optional[str] = Form(None),
    subject: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Avatar upload for the user, the agent, or a subject (PNG/JPG only)."""
    user = _get_current_user(request, db)
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar too large (max 5 MB).")
    # Trust the bytes, not the client-supplied Content-Type: the file lands in a
    # statically served directory, so a mislabelled payload must not be stored.
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = "png"
    elif content.startswith(b"\xff\xd8\xff"):
        ext = "jpg"
    else:
        raise HTTPException(status_code=400, detail="Only PNG or JPG images are accepted.")
    _AVATAR_DIR = Path(__file__).resolve().parent.parent / "uploads" / "avatars"
    _AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    disk_name = f"{uuid.uuid4().hex}.{ext}"
    (_AVATAR_DIR / disk_name).write_bytes(content)
    url = f"/uploads/avatars/{disk_name}"

    # A user avatar has to LAND on the account, or the upload is a file on disk
    # that nothing ever renders (owner 2026-09-21 — this endpoint and its client
    # helper both existed, neither was called, so uploading a picture did nothing).
    # Agent and subject avatars are left alone: they are chosen in their own
    # surfaces, which already know what they belong to.
    if (kind or "user") == "user":
        locked = db.query(User).filter(User.id == user.id).with_for_update().first() or user
        settings_now = dict(locked.settings or {})
        prof = dict(settings_now.get("profile") or {})
        prof["avatar_url"] = url
        settings_now["profile"] = prof
        locked.settings = settings_now
        db.commit()

    return {
        "status": "ok",
        "url": url,
        "kind": kind or "user",
        "subject": subject,
    }


# ─── 4. Overlord Chat & Sub-Agent Task Dispatch ────────────────────────────────

@router.get("/agent/chat/{assignment_id}")
async def get_chat(assignment_id: int, request: Request, db: Session = Depends(get_db)):
    """Fetches chat conversation history with Overlord / Sub-Agent team for an
    assignment. 08-27: key 0 is the legacy single conversation (no Assignment
    row — a 404 there blanked the chat on every refresh); restore it from the
    durable store and return it like any other thread."""
    user = _get_current_user(request, db)
    if assignment_id != 0:
        assignment = db.query(Assignment).filter(
            Assignment.id == assignment_id, Assignment.user_id == user.id
        ).first()
        if not assignment:
            # 08-27: chat threads live in agent_chat_threads, not assignments —
            # a thread id that isn't an Assignment row (the common case!) must
            # still serve its history. Only give a 404 when the id is neither
            # the user's assignment NOR the user's thread (IDOR-safe: both
            # checks are scoped to the authenticated user).
            thread = db.query(AgentChatThread).filter(
                AgentChatThread.id == assignment_id, AgentChatThread.user_id == user.id
            ).first()
            if not thread:
                raise HTTPException(status_code=404, detail="Assignment not found")
    try:
        from .overlord_agent import load_chat_history_from_db
        load_chat_history_from_db(db, user.id, assignment_id)
    except Exception:
        pass
    return {"status": "success", "chat": overlord_agent.get_chat_history(assignment_id, user=user)}


# ─── 4.5. LLM-first agent intent (one agent, does anything) ──────────────────

# ── HUMANIZE AS A TOOL (owner 2026-09-28) ──────────────────────────────────────
# *"just add humanization as a tool to the agents system prompt, and guide them into
# using the tool, rules nk make it better, things to watch out for, etc"*.
#
# The `humanize_text` action existed and was advertised in the action table, but with a
# four-word spec ("str to humanize") an agent had no idea WHEN it was appropriate or what
# it does to the text. The guide below is the difference between a tool that is listed
# and a tool that gets used correctly.
HUMANIZE_TOOL_GUIDE = """HUMANIZING TEXT (the `humanize_text` action)

WHAT IT IS: rewrites a draft so it reads like a person wrote it, rather than like a model
wrote it. Use it on prose the user will hand in or send.

WHEN TO USE IT:
- The user asks for something to sound less formal / more natural / more human.
- You have just drafted essay or assignment prose and are about to present it.
- The user says the writing "sounds like AI" or "sounds robotic".

WHEN NOT TO USE IT:
- Code, formulas, data, citations or reference lists. It rewrites PROSE and will damage
  anything where the exact characters matter.
- Short answers, chat replies and your own explanation of what you did. Rewriting a
  two-line reply wastes a queue slot — this is one of the heaviest actions helpotron runs.
- Text the user pasted as a QUOTATION to be analysed. Rewriting a quotation falsifies it.

RULES WHEN YOU DO USE IT:
1. PASS THE FULL DRAFT in `text`. Chunks rewritten separately lose their transitions and
   will not read as one piece.
2. NEVER CHANGE THE FACTS, and this is enforced, not just asked for. A rewrite that invents
   a quotation, a date, a number or a name is DISCARDED and you get the original back.
   If you need to add a source, find it first (use `web_search`) — never let the rewrite
   supply one.
3. QUOTATIONS ARE SACRED. Whatever is inside quote marks must come out identical. A
   rewrite that alters or adds a quotation is refused.
4. DO NOT PARAPHRASE A QUOTATION YOU HAVE NOT VERIFIED. If you are about to write a famous
   line, confirm the wording and its source first; unverified famous quotations are the
   most common way a draft gets something wrong.
5. CHECK THE RETURN. The result carries `result_text` and a `human_confidence_score`. If
   `result_text` is unchanged from what you sent, the guard rejected the rewrite — report
   that honestly rather than claiming you improved the text.
6. IT IS SLOW AND HEAVY. Tell the user it is running rather than presenting it as instant.

WATCH OUT FOR:
- A rewrite that comes back MUCH longer than the input is a warning sign, not a bonus. The
  measured failure mode is a paragraph growing 77 -> 155 words while inventing quotations.
- Style changes are fine. Any change to a name, date, number or quotation is not.
"""

_AGENT_ACTIONS = {
    "create_assignment": {"title": "str", "prompt": "str", "due_date": "str", "course": "str"},
    "delete_assignment": {"assignment_id": "int"},
    "read_assignment": {"assignment_id": "int"},
    "edit_assignment": {"assignment_id": "int", "updates": "dict with optional keys title, due_date (ISO string), prompt, status (one of: tracked, not_started, in_progress, completed, submitted, graded, paused), progress — progress MUST be a JSON object of {section: state} e.g. {\"section 2\": \"done\"}, NEVER a string or list"},
    "change_settings": {"settings": "dict — valid keys: effort_score (int 1-1000), agent_name (str), personality (str), instructions (str), operation_mode (manual|auto|yolo), auto_approved_actions (list of action names), school_name, major, goal, theme (str), accent (str), density (str), animation (str), background (str), uiStyle/ui_style (str), font_size (small|medium|large), font_scale/fontScale (int 1-100), custom_color (str), language (str), timezone (str), compact_mode (bool), reducedMotion/reduced_motion, highContrast/high_contrast, largeText/large_text, dyslexiaFriendly/dyslexia_friendly, screenReader/screen_reader (bool)"},
    "generate_flashcards": {"title": "str", "prompt": "str — the topic/subject or source text to build the deck from", "count": "int optional (1-100, default 20)"},
    "humanize_text": {"text": "str to humanize"},
    "analyze_rubric": {"prompt": "str", "rubric": "str"},
    "draft_section": {"section_name": "str"},
    "submit_assignment": {"assignment_id": "int"},
    "message_assignment_team": {"assignment_id": "int", "instruction": "str"},
    "run_sandbox_script": {"script": "str", "language": "python"},
    "run_shell": {"command": "str — ONE tiny SAFE command (no ;, |, &, `, $, <, >): for math use python3 -c \"import math;print(<expr>)\"; for date/time use the exact python date one-liner. The command is generated BY YOU (never taken from the user text) and must only compute or print a fact."},
    # Owner 2026-09-18: "allow it for any of the helpotron agents, so whenever it
    # needs it can browse the web for extra context or to solve stuff". A real
    # live-web lookup with citable sources, billed through the same OpenRouter
    # channel every other call uses. Available on EVERY surface because it lives
    # in this shared table.
    "web_search": {"query": "str — what to look up on the live web. Ask a specific, self-contained question (e.g. \"when is the 2026 AP Calculus AB exam\" or \"current UK prime minister\"), not a keyword soup. Use it whenever the answer depends on something current, factual, or outside your training — news, prices, schedules, releases, people's current roles, a specific document or page. Do NOT use it for maths, coding, or anything you can already answer reliably."},
    "remember": {"text": "str fact/preference to store permanently"},
    "forget_memory": {"entry_id": "str or text snippet to forget"},
    # 08-31 (Bob, My Agent full-capability): read-only access to the rest of
    # the website so the agent can help with anything on it — wallet, library,
    # referrals, Data Lake entries, and progress. All cost 0 (reads).
    "get_wallet": {"": "no payload — returns token balance, credits, micro-credits and plan"},
    "list_library": {"assignment_id": "int optional — only materials for this assignment; omit for all", "limit": "int optional (1-50, default 10)"},
    "list_dumps": {"subject": "str optional — only dumps filed under this subject, e.g. \"Biology\"; omit for all", "assignment_id": "int optional — only dumps routed to this assignment", "limit": "int optional (1-50, default 10)"},
    "list_referrals": {"": "no payload — returns the user's referral codes and their redemption status"},
    "list_datalake_entries": {"limit": "int optional (1-20, default 5)"},
    "get_progress": {"": "no payload — returns assignment status counts and next due dates"},
    # ── 09-01 (Bob, full-capability: "tool calls to do EVERYTHING") ─────────
    "see_settings": {"": "no payload — read-only dump of ALL user settings (secrets masked). Prefer select_settings for one section"},
    "select_settings": {"section": "str — one of: appearance | display | accessibility | ai | goals | notifications | localization (returns that settings section and opens the Settings page)"},
    "see_config": {"": "no payload — plan, credits, token balance, micro-credits, plan-gated features and usage limits"},
    "choose_assignment_direction": {"assignment_id": "int", "direction": "str — one of: do_it_for_me | study_guide | quiz | flashcards | summary | custom; the per-assignment subagent team then ACTUALLY does the work", "custom_text": "str optional — what the direction should be when direction=custom"},
    "mark_assignment_done": {"assignment_id": "int — moves the bubble to completed"},
    "archive_assignment": {"assignment_id": "int — moves the bubble to archived (history)"},
    "export_assignment_data": {"assignment_id": "int optional — export this bubble (omit + no bubble to export everything)", "bubble": "str optional — assign/ bubble title substring filter; returns a summary plus a real download URL"},
    "request_feature": {"text": "str — the feature/improvement request; logged in the Data Lake for the team"},
}

# ─── Extension-surface scrape tool (operator 08-28) ─────────────────────────
# The browser extension popup hosts the REAL tab-scraper: the capture runs in
# the user's browser (content.js -> background.js -> /api/agent/start control
# session -> POST /api/assignments save). The server-side agent cannot fetch
# a Canvas page itself, so this surface declares the tool the model CALLS so
# the popup drives the actual scrape. Payload contract mirrors the extension
# chatbox's "scrapeWithInstruction" message: {instruction}.
SCRAPE_ACTION_SPEC = {
    "instruction": "str — what to collect / any constraint, e.g. \"only the rubric\", "
                   "\"focus on the main prompt lines\"; empty string = the whole page",
}

BROWSER_ACTION_SPEC = {
    "actions": "list of concrete browser control operations: [{\"op\":\"move\",\"x\":int,\"y\":int}, {\"op\":\"click\",\"x\":int,\"y\":int,\"button\":\"left\"|\"right\"}, {\"op\":\"dblclick\",\"x\":int,\"y\":int}, {\"op\":\"type\",\"text\":\"string\"}, {\"op\":\"key\",\"key\":\"Enter|Escape|Tab|Backspace|ArrowDown|ArrowUp\",\"modifiers\":[\"ctrl\"|\"shift\"]}, {\"op\":\"scroll\",\"x\":int,\"y\":int,\"deltaX\":int,\"deltaY\":int}, {\"op\":\"drag\",\"fromX\":int,\"fromY\":int,\"toX\":int,\"toY\":int}]",
    "reply": "str — concise message to the user explaining what you are doing on their screen"
}

# Credit gate (operator 08-26): actions that do work have to be affordable even
# before execution. Costs follow credits.py TASK_COSTS semantics; 0 = free
# (plain answers, settings/read/no-op actions are never gated).
_AGENT_ACTION_COSTS = {
    "create_assignment": 5,        # assignment_solve
    "edit_assignment": 5,          # assignment_solve
    "delete_assignment": 1,        # agent_session
    "generate_flashcards": 5,      # assignment_solve
    "humanize_text": 3,            # humanizer_draft
    "analyze_rubric": 3,           # code_analysis
    "draft_section": 5,            # assignment_solve
    "submit_assignment": 5,        # assignment_solve
    "message_assignment_team": 5,  # assignment_solve
    "run_sandbox_script": 10,      # subagent_browser
    "run_shell": 3,                # code_analysis
    "web_search": 1,               # live web lookup; real cost is measured, not flat
    "scrape_assignment": 1,        # prompt-only trigger; the extension does the work
    "browser_action": 1,          # extension direct screen control
    "read_assignment": 0, "change_settings": 0,
    "remember": 0, "forget_memory": 0, "plain_answer": 0,
    "get_wallet": 0, "list_library": 0, "list_referrals": 0, "list_dumps": 0,
    "list_datalake_entries": 0, "get_progress": 0,
    # 09-01 (Bob, full-capability): reads are free; the direction dispatch is
    # real team work (assignment_solve); lifecycle flips are cheap; feature
    # requests cost a token's worth (they are logged, not free).
    "see_settings": 0, "select_settings": 0, "see_config": 0,
    "export_assignment_data": 0,
    "choose_assignment_direction": 5,   # assignment_solve
    "mark_assignment_done": 1,          # agent_session
    "archive_assignment": 1,            # agent_session
    "request_feature": 1,               # agent_session
    "admin_lookup_user": 0, "admin_adjust_credits": 0, "admin_system_status": 0,
}

# ─── Shell-query detection (operator 08-26): math / date / time questions are
# answered from REAL sandboxed computation output, never from memory and never
# with a clarifying question when the query is self-contained. The SERVER
# (deterministic regex) picks the safe command for the common forms; the
# classifier may also emit run_shell for wordy forms. Never take raw user text
# as a command. ─────────────────────────────────────────────────────────────

_MATH_FUNC = re.compile(r"\b(?:sqrt|sin|cos|tan|asin|acos|atan|log10|ln|exp|abs|round|floor|ceil|factorial|pow)\b")
_MATH_OP = re.compile(r"\d\s*[+\-*/÷×^%]\s*\d")
_PHONEISH = re.compile(r"\d{3}[\s\-]\d{3,4}[\s\-]\d{3,4}")
_DATE_PAT = re.compile(
    r"\b(today'?s\s+date|what\s+day\s+is\s+it|current\s+date|current\s+day|what\s+is\s+today'?s|what\s+is\s+the\s+date|what'?s\s+today|day\s+is\s+it|its?\s+date\s+is|date\s+is\s+the)\b",
    re.IGNORECASE,
)
_TIME_PAT = re.compile(r"\b(what\s+time\s+is\s+it|current\s+time|what'?s\s+the\s+time)\b", re.IGNORECASE)
_WORD_OPS = [
    (re.compile(r"\s+(multiplied\s+by|times|x|×)\s+", re.IGNORECASE), "*"),
    (re.compile(r"\s+(plus|added\s+to)\s+", re.IGNORECASE), "+"),
    (re.compile(r"\s+(minus|less\s+than|subtracted\s+by)\s+", re.IGNORECASE), "-"),
    (re.compile(r"\s+(divided\s+by|over)\s+", re.IGNORECASE), "/"),
    (re.compile(r"\s+(to\s+the\s+power\s+of)\s+", re.IGNORECASE), "**"),
]
_SQRT_OF = re.compile(r"\b(square\s+root\s+of|sqrt\s+of)\b\s*([0-9.)]+)", re.IGNORECASE)


def _extract_math_expression(text: str) -> str:
    """Return a safe math expression if the message is (or is essentially) a
    computation, else ''. Conservative: requires a digit-operator-digit /
    math-function pattern and no stray prose beyond known prefixes."""
    if not text:
        return ""
    t = (text or "").strip().lower()
    m = _SQRT_OF.search(t)
    if m:
        return f"sqrt({m.group(2)})"
    for pat, op in _WORD_OPS:
        t = pat.sub(f" {op} ", t)
    t = re.sub(r"^(?:what\s+is|whats|what'?s|calculate|compute|solve|how\s+much\s+is|answer|result|result\s*of|how\s+(?:to|do\s+(?:i|you|we))\s+solve)\s*[:=]?\s*", "", t)
    t = t.rstrip("?.! ").strip()
    if _PHONEISH.search(t):
        return ""  # phone numbers contain dashes/digits — not math
    t = t.replace("×", "*").replace("÷", "/").replace("^", "**")
    t = re.sub(r"(?<=\d)\s*x\s*(?=\d)", "*", t)
    if not re.search(r"\d", t):
        return ""
    if not (re.search(r"\d\s*[+\-*/%]\s*\d", t) or _MATH_FUNC.search(t)):
        return ""
    if not re.fullmatch(r"[0-9\s.+\-*/(),%_a-z]+", t):
        return ""
    # 09-06: the char-class above also matches ordinary prose that merely
    # CONTAINS a sum ("search inside my tab, how to solve 1+1"), which used to
    # be compiled into `print(search inside my tab, how to solve 1+1)` — a
    # guaranteed SyntaxError that surfaced as "I couldn't run that computation
    # safely" AND stole the turn from `browser_action`. Every alphabetic word
    # that survives must now be a real math token; anything else is prose.
    if _stray_math_words(t):
        return ""
    return t


# Words that may legitimately appear inside a compiled math expression.
_MATH_WORDS = frozenset({
    "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "log10", "log", "ln",
    "exp", "abs", "round", "floor", "ceil", "factorial", "pow", "pi", "e",
    "mod", "x",
})


def _stray_math_words(expr: str) -> bool:
    """True when `expr` still holds an alphabetic word that is not a math token
    (i.e. it is prose, not a computation)."""
    return any(w not in _MATH_WORDS for w in re.findall(r"[a-z_]+", expr))


# `solve 1+x=2`, `2x+3=11`, `x/4 = 3` — a single-unknown LINEAR equation. Solved
# deterministically in the sandbox by evaluating the residual at x=0 and x=1
# (f(x)=lhs-rhs is affine, so x = -f(0)/(f(1)-f(0))); no arithmetic is ever done
# in prompt text.
_LINEAR_EQ_PREFIX = re.compile(
    r"^(?:please\s+)?(?:can\s+you\s+)?(?:solve|find|work\s+out|compute|calculate)?\s*"
    r"(?:for\s+x)?\s*[:=]?\s*",
    re.IGNORECASE,
)


def _extract_linear_equation(text: str) -> str:
    """Return `lhs|rhs` for a solvable single-unknown linear equation, else ''."""
    if not text:
        return ""
    t = (text or "").strip().lower().rstrip("?.! ").strip()
    t = _LINEAR_EQ_PREFIX.sub("", t, count=1).strip()
    if t.count("=") != 1:
        return ""
    lhs, rhs = (side.strip() for side in t.split("="))
    if not lhs or not rhs:
        return ""
    sides = []
    for side in (lhs, rhs):
        side = side.replace("×", "*").replace("÷", "/").replace("^", "**")
        # implicit multiplication: 2x -> 2*x, )x -> )*x, x( -> x*(
        side = re.sub(r"(?<=[0-9)])\s*x", "*x", side)
        side = re.sub(r"x\s*(?=[0-9(])", "x*", side)
        if not re.fullmatch(r"[0-9\s.+\-*/()x]+", side):
            return ""
        sides.append(side)
    joined = "".join(sides)
    if "x" not in joined or not re.search(r"\d", joined):
        return ""
    return f"{sides[0]}|{sides[1]}"


def _build_linear_equation_command(pair: str) -> str:
    """python3 one-liner that solves the linear equation and prints `x = <v>`.

    09-07: the integer-ness test is `round(r, 9) == r`, NOT `abs(...)<1e-9` —
    `_validated_argv._SHELL_META` rejects any `<`/`>` in the command (they are
    shell redirection metachars), so the old generator produced a command that
    could never pass validation and the executor answered every linear equation
    with "I couldn't run that computation safely" (observed live: solve 1+x=2).
    """
    lhs, rhs = pair.split("|", 1)
    code = (
        "import math;"
        f"f=lambda x: ({lhs})-({rhs});"
        "a=f(1)-f(0);"
        "print('No unique solution.') if a==0 else "
        "print('x = ' + (lambda r: str(int(round(r))) if round(r,9)==r "
        "else str(round(r,10)))(-f(0)/a))"
    )
    return f'python3 -c "{code}"'


_MATH_FUNC_RENAME = re.compile(r"\b(sqrt|sin|cos|tan|asin|acos|atan|log10|ln|exp|abs|round|floor|ceil|factorial|pow)\b")


def _build_math_command(expr: str) -> str:
    """Tiny deterministic python one-liner: `python3 -c "import math;print(<expr>)"`."""
    e = re.sub(r"\be\b", "math.e", expr)
    e = re.sub(r"\bpi\b", "math.pi", e)
    e = re.sub(r"\bln\b", "math.log", e)
    e = _MATH_FUNC_RENAME.sub(r"math.\1", e)
    code = f"import math;print({e})"
    return f'python3 -c "{code}"'


def _insufficient_tokens_response(target_key, user, required, db=None) -> Dict[str, Any]:
    """Non-upgraded user without token budget: friendly refusal, action NOT run.
    Tokens = usage; credits = discounts (operator 08-26)."""
    reply = (
        "⚠️ Insufficient tokens — your token balance is 0. Activate the Free Trial "
        "or top up in Billing to use My Agent."
    )
    msg = overlord_agent.add_chat_message(target_key, sender="overlord", text=reply, user_id=user.id)
    if db is not None:  # 08-27: refusals persist too, so the reloaded chat matches
        try:
            from .overlord_agent import persist_chat_message
            persist_chat_message(db, user.id, target_key, "overlord", reply)
        except Exception:
            pass
    return {
        "status": "insufficient_tokens",
        "message": msg,
        "reply": reply,
        "token_balance": _tk_balance(user),
        "payload": {"required": required, "available": _tk_balance(user)},
    }


_DATE_CODE = (
    "import datetime as dt;d=dt.date.today();"
    "print('Today is ' + d.strftime('%A, %B') + ' ' + str(d.day) + ', ' + str(d.year) + '.')"
)
_TIME_CODE = (
    "import datetime as dt;d=dt.datetime.now();"
    "print('The time is ' + d.strftime('%H:%M:%S %Z') + ' on ' + d.strftime('%A, %B %d, %Y') + '.')"
)


_BROWSER_INTENT_PAT = re.compile(
    r"\b(search|searchbar|search\s+bar|tab|tabs|screen|click|press|type\s+in|type\s+into|type\s+on|browse|browser|page|pages|open|scroll|goto|navigate|look\s+at|see\s+my|canvas|doc|docs|google\s+docs)\b",
    re.IGNORECASE,
)


def _extract_shell_query(text: str) -> str:
    """If the message is a self-contained math/date/time query, return the safe
    server-generated command; else ''.
    Browser/extension-oriented instructions are NEVER intercepted as quick-path shell commands.
    """
    if not text:
        return ""
    if _BROWSER_INTENT_PAT.search(text):
        return ""
    if _TIME_PAT.search(text):
        return f'python3 -c "{_TIME_CODE}"'
    if _DATE_PAT.search(text):
        return f'python3 -c "{_DATE_CODE}"'
    expr = _extract_math_expression(text)
    if expr:
        return _build_math_command(expr)
    eq = _extract_linear_equation(text)
    if eq:
        return _build_linear_equation_command(eq)
    return ""


_ACTION_COSTS = {
    "run_shell": 2, "calculate": 2,
    "humanize_text": 3, "analyze_rubric": 3, "draft_section": 5,
    "generate_flashcards": 5, "generate_practice_test": 5, "generate_study_guide": 5,
    "web_search": 1,
}


def _action_cost(action: str) -> float:
    # Single source of truth: _AGENT_ACTION_COSTS (gate + charge stay identical).
    return float(_AGENT_ACTION_COSTS.get(action, 2))


def _charge_tokens(user, db, cost: float) -> None:
    """Deduct from the user's token budget (settings.token_balance) after work ran.
    Credits are untouched (they are the discount currency).

    Two things this has to get right, and the previous hand-rolled body got both wrong:

    * THE LEDGER ROW. It moved the JSON balance and committed while writing no
      CreditTransaction row at all, so every agent action was charged with no audit
      trail. Refunds could not be computed and the balance could not be reconciled
      from the ledger — the two silently disagreed.
    * THE ROW LOCK. `settings` is a JSON blob, so this is a read-modify-write that
      cannot be expressed as one atomic UPDATE. Unlocked, two concurrent charges read
      the same balance and both debit it, overdrawing the account while both report
      success. `credits.charge()` already takes the lock for exactly this reason.

    The balance is allowed to go NEGATIVE rather than being clamped at zero. The work
    has already run, so the cost is real; clamping silently moved the shortfall onto
    the platform. A negative balance is honest and self-blocks the account until a
    top-up, which matches the documented overdraft rule for post-hoc settlement.
    """
    user_id = user.id if hasattr(user, "id") else user
    from .credits import is_unmetered, debit_tokens_atomic
    row = db.query(User).filter(User.id == user_id).first()
    if row is None:
        return
    if is_unmetered(row):
        return
    # One statement, so two concurrent charges cannot both debit the balance they read.
    # The previous body read the balance into Python and wrote it back, which lost a
    # debit whenever two charges overlapped — measured: two 400-token debits against
    # 1000 left 600, with both callers reporting success.
    new_bal = debit_tokens_atomic(db, user_id, cost, allow_negative=True)
    db.add(CreditTransaction(
        user_id=user_id,
        delta=-float(cost),
        reason="agent_action",
    ))
    db.commit()
    if hasattr(user, "settings"):
        try:
            db.refresh(user)
        except Exception:
            s = dict(getattr(user, "settings", None) or {})
            s["token_balance"] = new_bal
            user.settings = s


def _charge_usage(user, db, action: str, since_id: Optional[int] = None) -> float:
    """Charge an agent action for what it ACTUALLY cost (owner 2026-09-17).

    Owner: "Convert everything, no flat prices, and change it to 100 tokens=cent".

    The flat per-action table is gone as a PRICE. An action is charged its
    measured cost converted at 100 tokens per cent, so expensive work (a browser
    run, a vision frame) costs what it really consumed and cheap work costs
    proportionally little. The only floor is the 1-token minimum every metered
    process carries (1/100 cent) — that is a rounding floor, not a price list.

    `_AGENT_ACTION_COSTS` is retained purely as an ELIGIBILITY hint for the
    pre-flight gate (0 = the action does no billable work, so it needs no
    balance); it is never charged.
    """
    measured_tokens = 1
    if since_id is not None:
        try:
            from .credits import usage_cents_since, calculate_task_token_cost
            user_id = user.id if hasattr(user, "id") else user
            cents = usage_cents_since(db, user_id, since_id)
            measured_tokens = calculate_task_token_cost(cents / 100.0)
        except Exception as e:
            logger.warning("usage measurement failed for %s: %s", action, e)

    cost = float(measured_tokens)
    if cost > 0:
        _charge_tokens(user, db, cost)
    return cost


def _tk_balance(user) -> float:
    """Current remaining token balance — resend with chat responses so the UI
    can update live without a refresh (operator 08-27)."""
    return float((user.settings or {}).get("token_balance", 0) or 0)


async def _conversational_fallback(user, text: str, db: Session = None, node: str = "my_agent", assignment_context: Optional[str] = None, humanizer_ctx: Optional[dict] = None) -> str:
    """When an action executed silently, give a genuine answer to the user's
    question instead of a canned 'Task completed.' (operator 08-26).

    08-28 fix: this was the ONE fluent-answer generator with NO identity —
    a conversationally-natural reply produced with a generic 'you are the
    user's personal agent' prompt, which is exactly why a user-set identity
    (personality/instructions/memory/files) appeared to "never apply" when
    a degenerate reply landed here. It now uses the canonical prompt, node-
    scoped (operator 08-28: assignment_team bubbles get that surface's own
    config, never My Agent's), plus the assignment grounding when present.
    """
    from .llm import call_llm
    settings = dict(user.settings or {})
    effort = resolve_agent_effort(settings)

    try:
        raw = await call_llm(
            system_prompt=(
                agent_system_prompt(user, node=node, ctx=humanizer_ctx)
                + (assignment_context or "")
                + "The user sent a message and no specific tool action applied. "
                  "Answer helpfully and briefly: acknowledge what you can (or can't "
                  "yet) do, and ask a clarifying question if needed. Keep it under "
                  "90 words; plain text only. Stay in character per the identity above."
            ),
            user_prompt=(text or "")[:2000],
            temperature=0.4,
            max_tokens=300,
            effort_score=effort,
            db=db, user_id=user.public_id,
        )
        from .llm import strip_thinking_tokens
        return strip_thinking_tokens((raw or "").strip()[:1000])
    except Exception as err:
        logger.error("conversational fallback LLM failed: %s", err)
        return ""


async def _apply_detection_standard(settings: Dict[str, Any], user, text: str, node: str,
                                    humanizer_ctx: Optional[dict], db) -> str:
    """AI Detection Standard gate (operator 08-31): when the standard is on for
    this chat (scoped global/subject/assignment), score the reply with the
    enabled detectors and rewrite it until it meets the min-human% rate —
    best-effort, capped at 2 rewrites, and it never breaks the chat."""
    from .humanize_skill import ensure_human_standard
    try:
        final, _attempts = await ensure_human_standard(
            text, settings, node=node, ctx=humanizer_ctx, db=db, user_id=user.public_id,
        )
        return final or text
    except Exception:
        return text


def _safe_json_extract(text: str) -> Optional[Dict[str, Any]]:
    """Tolerant JSON parse: strips markdown fences, finds the first balanced object."""
    from .llm import strip_thinking_tokens
    t = strip_thinking_tokens(text or "")
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t).strip()
    for start in [i for i, ch in enumerate(t) if ch == "{"]:
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(t)):
            ch = t[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(t[start : i + 1])
                    except (json.JSONDecodeError, ValueError):
                        break
    return None


def _regex_fallback_intent(
    text: str,
    node: str = "my_agent",
    viewport: Optional[Dict[str, int]] = None,
    screen_analysis: Optional[str] = None,
) -> Dict[str, Any]:
    """Old keyword dispatch — only used when the LLM JSON contract fails.

    `screen_analysis` is the vision pass for this turn, when there is one. It is
    what lets the browser burst aim at a field that actually exists instead of
    guessing (see the search branch).
    """
    shell_cmd = _extract_shell_query(text)
    if shell_cmd:
        return {"action": "run_shell", "payload": {"command": shell_cmd}, "reply": "Computing…"}
    lower = text.lower()
    if node == "extensions" and any(k in lower for k in ("search", "searchbar", "search bar", "click", "type in", "type on", "touch my browser", "use my browser", "inside my tab", "in my tab")):
        m = re.search(r"(?:search|type)\s+(?:inside|into|in|for|on)?\s*(?:my\s+)?(?:searchbar|search\s+bar|tab|browser|screen)?(?:\s*,\s*|\s+for\s+|\s+to\s+|\s+in\s+)?(.*)", text, re.IGNORECASE)
        q = m.group(1).strip(" '\"?,.") if m else text
        # 09-07: the burst coordinates were hard-coded (480, 320), which lands
        # outside a small captured frame; derive them from the real viewport.
        # 09-08: deriving them from the viewport was still a guess — the CENTRE
        # of the page is only a text field by luck. On a usage dashboard the
        # operator watched a caret blink on dead space while the reply claimed
        # the search had been typed. Aim at an element the vision pass actually
        # reported; when there is none, say so instead of clicking at random.
        # (Same rule as routes_extension._search_burst — the whole list still
        # passes through _harden_actions for clamping before execution.)
        from .screen_vision import find_input_target

        vp = viewport or {"width": 1280, "height": 800}
        target = find_input_target(screen_analysis, hint=text, viewport=vp)
        if not target:
            return {
                "action": "plain_answer",
                "payload": {},
                "reply": (
                    "I couldn't find that field on the current screen, so I didn't "
                    "click anywhere. Open the page with the search box in view and "
                    "ask me again."
                ),
            }
        x = max(1, int(target["x"]))
        y = max(1, int(target["y"]))
        return {
            "action": "browser_action",
            "payload": {
                "actions": [
                    {"op": "move", "x": x, "y": y},
                    {"op": "click", "x": x, "y": y, "button": "left"},
                    {"op": "type", "text": q or text},
                    {"op": "key", "key": "Enter", "modifiers": []}
                ]
            },
            "reply": f"Searching for \"{q or text}\" on your screen now…"
        }
    if node == "extensions" and any(k in lower for k in ("scrape", "canvas", "capture this page")):
        return {"action": "scrape_assignment",
                "payload": {"instruction": text},
                "reply": "On it — scraping your tab now…"}
    if any(k in lower for k in ("remember", "memorize", "remember that", "note that", "keep in mind")):
        return {"action": "remember", "payload": {"text": text}, "reply": "Noted — stored in my permanent memory."}
    if "forget" in lower and any(k in lower for k in ("memory", "remember")):
        return {"action": "forget_memory", "payload": {"text": text}, "reply": "Working on forgetting that."}
    if "humanize" in lower or "ai check" in lower:
        return {"action": "humanize_text", "payload": {"text": text}, "reply": "Humanizing your text…"}
    if "rubric" in lower:
        return {"action": "analyze_rubric", "payload": {"prompt": text}, "reply": "Analyzing the rubric…"}
    if "submit" in lower:
        return {"action": "submit_assignment", "payload": {"assignment_id": None}, "reply": "Submitting…"}
    if "flashcard" in lower:
        # 08-27: pass the user's message as the source prompt so the executor
        # can seed real generation (previously an empty cards stub).
        return {"action": "generate_flashcards", "payload": {"title": "Flashcards", "prompt": text},
                "reply": "Generating flashcards…"}
    if "due date" in lower or "change the due" in lower or "edit" in lower and "assignment" in lower:
        return {"action": "edit_assignment", "payload": {"updates": {}}, "reply": "Editing the assignment…"}
    # Catch-all: unmatched text is a QUESTION, not a work order. Answer it
    # conversationally — never phantom-run draft_section and claim "Done."
    # (08-27: LLM intent failure dropped every unknown message onto an
    # invisible draft_section execution; users saw "✅ Done." for questions).
    return {"action": "plain_answer", "payload": {}, "reply": ""}


# ─── Assignment grounding guard (operator 08-28) ──────────────────────────
# The LLM once converted "complete a worksheet" (no assignment ever given)
# into a FABRICATED create_assignment card + "ok" — the bubble showed
# in_progress with no subagent activity. This guard refuses to create an
# assignment card unless the request is grounded in REAL material: content
# pasted in the message, a real topic behind the ask, loaded agent files, or
# an existing assignment card that has content. Otherwise the agent asks for
# the actual assignment instead of making one up.

_WORK_NOUNS = r"assignment|worksheet|sheet|homework|paper|packet|coursework|task|lab|project|essay"
_ASK_BOILERPLATE = frozenset("""
complete finish do solve write work start help you please my me the a an this that these those
it with for on in to and or of is are was were i we they not will can could would need
""".split())
_ASK_CONTENT_MSG = (
    "I can't get started on that yet — you haven't sent the actual assignment. "
    "Paste the worksheet text, attach a file, or point me at the existing assignment "
    "card, and I'll do it from the real material."
)


def _assignment_request_grounded(text: str, user: User, db: Session,
                                 assignment_id: Optional[int] = None) -> tuple[bool, str]:
    """True when the agent may create/start an assignment card for this request."""
    t = " ".join((text or "").split())
    low = t.lower()
    # Explicit card creation ("make me a new card for Latin") is always fine —
    # the user is asking for the card itself, not for work on one they never gave.
    if re.search(r"\b(create|add|make|new)\b.{0,40}\b(assignment|card)\b", low):
        return True, ""
    # Only guard requests that ask for WORK over an assignment document.
    if not re.search(rf"\b(complete|finish|do|solve|write|work|start|help)\b.{{0,40}}\b({_WORK_NOUNS})\b", low):
        return True, ""
    # 1) the user pasted actual material (beyond a short request)
    words = re.findall(r"[a-z0-9]+", low)
    if len(t) >= 60 and len(words) >= 15:
        return True, ""
    # 2) a real topic behind the ask (e.g. "worksheet on the civil war map")
    content = [w for w in words if len(w) > 2 and w not in _ASK_BOILERPLATE]
    if len(content) >= 2:
        return True, ""
    # 3) files loaded into the agent
    try:
        from .agent_files import agent_files_summary
        fs = agent_files_summary(user.id) or ""
        if fs and "(none loaded)" not in fs:
            return True, ""
    except Exception:
        pass
    # 4) pointing at an existing card that has real content
    if assignment_id:
        a = db.query(Assignment).filter_by(id=assignment_id, user_id=user.id).first()
        if a and a.prompt and len(a.prompt.strip()) >= 60:
            return True, ""
    return False, _ASK_CONTENT_MSG


# ─── Pure-greeting detection (operator 08-28; BUG: "yo" -> study refusal) ──
# "yo", "hey how are you", "thanks" — messages with NO content ask. These were
# gated by the educational-mode school-only rule ("that isn't part of
# studying") because the LLM treated them as off-topic. Deterministic quick
# path: pure greetings/thanks get a warm ack — never a refusal, no LLM round.

_GREETING_PHRASES = frozenset({
    "hi", "hiya", "hey", "heyo", "hi there", "hey there", "hi hi", "hello",
    "hello there", "howdy", "hola", "yo", "yo yo", "sup", "wassup",
    "whats up", "what's up", "what is up", "whats good", "what's good",
    "what is good", "hows it going", "how's it going", "how is it going",
    "hows everything", "how's everything", "how are you", "how are u",
    "how r u", "how you doing", "how are you doing", "how are you today",
    "how are ya", "good morning", "good afternoon", "good evening",
    "good night", "morning", "afternoon", "evening", "night",
})
_THANKS_PHRASES = frozenset({"thanks", "thank you", "thank u", "ty", "thx", "thnx"})
_GREETING_WORDS = _GREETING_PHRASES | _THANKS_PHRASES | {
    "you", "u", "it", "going", "doing", "today", "there", "good", "great",
    "fine", "perfect", "nice", "day", "bro", "dude", "friend", "guys",
    "yall", "all", "hows", "how's", "how", "are", "what",
}


def _normalize_chat_text(text: str) -> str:
    t = (text or "").strip().lower()
    # Emoji/symbols and punctuation -> spaces, collapse whitespace.
    t = re.sub(r"[\U0001F300-\U0001FAFF☀-➿←-⇿⬀-⯿]+", " ", t)
    t = re.sub(r"[^\w\s']+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _pure_greeting_reply(text: str) -> str:
    """Warm ack for messages that are ONLY a greeting / thanks / small talk.
    Returns '' when the message carries real content (fall through to the
    normal pipeline). Never mentions scope, never refuses."""
    t = _normalize_chat_text(text)
    if not t or len(t) > 40:
        return ""
    if t in _THANKS_PHRASES:
        return "You're welcome! What's next — assignment, flashcards, or a quiz?"
    if t in _GREETING_PHRASES:
        return "Hey! Good to see you. What are you studying or working on today?"
    words = t.split()
    if len(words) <= 4 and all(w in _GREETING_WORDS for w in words):
        # e.g. "hey yo hows it going", "yo sup", "hi how are you today"
        if any(w in ("hey", "hi", "yo", "hello", "sup", "howdy",
                     "hows", "how's", "how", "what") for w in words):
            return "Hey! Good to see you. What are you studying or working on today?"
    return ""


async def _resolve_agent_intent(
    user: User,
    settings: Dict[str, Any],
    text: str,
    is_admin: bool,
    db: Session = None,
    target_key=None,
    node: str = "my_agent",
    assignment_context: Optional[str] = None,
    humanizer_ctx: Optional[dict] = None,
    viewport: Optional[Dict[str, int]] = None,
    screen_analysis: Optional[str] = None,
    images: Optional[List[str]] = None,
    model_override: Optional[str] = None,
    vision_only: bool = False,
    **kwargs: Any,
) -> Dict[str, Any]:
    """LLM decides which action the agent should take — strict JSON contract.

    The model sees the surface's identity + personality + instructions, its
    memory, the files loaded into it, and the exact tool catalogue. It must
    reply with {"action", "payload", "reply"}. Any failure falls back to the
    keyword dispatcher so chat never breaks.

    08-28 (operator): node-scoped. node="my_agent" (default) injects the
    user's canonical config; an assignment-bubble chat passes node=
    "assignment_team" + the real assignment context block (name/subject/
    class/teacher/status/dump excerpt) so the team knows WHAT sheet it is
    working on. Both are additive — the guards/contract below are untouched.
    """
    from .llm import call_llm

    agent_name = agent_display_name(user)
    # personality / instructions / memory / loaded files are assembled ONCE
    # by agent_prompt.agent_system_prompt below (08-28) — no private copies
    # that could drift or drop config.

    # Deterministic quick-path (operator 08-26): self-contained math/date/time
    # questions MUST be computed for real — never left to model memory or a
    # clarifying question. The safe command is server-built, not user text.
    shell_cmd = _extract_shell_query(text)
    if shell_cmd:
        return {"action": "run_shell", "payload": {"command": shell_cmd}, "reply": "Computing…"}

    # Deterministic greeting quick-path (operator 08-28): a PURE greeting /
    # thanks / small talk must never be gated into a study-scope refusal (the
    # LLM used to turn "yo" into "that isn't part of studying"). Warm short
    # ack, educational-mode carve-out is in the prompt block below too.
    greet_reply = _pure_greeting_reply(text)
    if greet_reply:
        return {"action": "plain_answer", "payload": {}, "reply": greet_reply}


    actions = dict(_AGENT_ACTIONS)
    if node == "extensions":
        # The extension surface owns the REAL browser tools (screen control + tab scraping)
        actions["browser_action"] = BROWSER_ACTION_SPEC
        actions["scrape_assignment"] = SCRAPE_ACTION_SPEC
    if is_admin:
        actions.update({
            "admin_lookup_user": {"query": "public_id or name substring"},
            "admin_adjust_credits": {"public_id": "str", "delta": "float"},
            "admin_system_status": {},
        })

    action_spec = "\n".join(f"- {name}: {json.dumps(spec)}" for name, spec in sorted(actions.items()))

    # Operator 08-28: canonical identity/memory/files prompt — the ONLY
    # assembler of the user's custom agent config (personality/identity,
    # user instructions, permanent memory, FULL content of loaded agent
    # files). Its gated educational block and today's-date paragraph live
    # inside it; everything below (action contract, run-shell rule,
    # never-refuse rule, assignment guard) is appended AFTER the identity
    # block so identity/memory/files can never be lost or re-ordered out.
    # Node-scoped: assignment bubbles use the assignment_team surface config
    # (or none at all) — never My Agent's — plus the real assignment context.
    system_prompt = agent_system_prompt(user, settings, node=node, ctx=humanizer_ctx)
    if assignment_context:
        system_prompt += assignment_context
    system_prompt += (
        f"AVAILABLE ACTIONS (choose exactly one):\n{action_spec}\n\n"
        f"{HUMANIZE_TOOL_GUIDE}\n\n"
        f"OPERATION MODE RULE (Bob 09-01 — the user's mode is "
        f"'{str(settings.get('operation_mode', 'auto')).upper()}' and it is binding):\n"
        f"- MANUAL: EVERY work tool call must end with the suffix `_ask_permissions` "
        f"(e.g. \"change_settings_ask_permissions\", \"submit_assignment_ask_permissions\"). "
        f"Never run a work action bare in manual mode.\n"
        f"- AUTO: you run every tool call automatically, but you MUST ask permission on "
        f"RISKY actions — irreversible or account-affecting ones: delete_assignment, "
        f"submit_assignment, archive_assignment, mark_assignment_done, change_settings, "
        f"request_feature, and anything touching purchases, credits or money. For those "
        f"append the suffix `_ask_permissions`; everything else runs directly.\n"
        f"- YOLO: never ask — run every tool call directly, no suffix ever.\n"
        f"Pure reads and reversible computes NEVER take the suffix in any mode: "
        f"see_settings, select_settings, see_config, export_assignment_data, get_wallet, "
        f"list_library, list_dumps, list_referrals, list_datalake_entries, get_progress, read_assignment, "
        f"run_shell.\n\n"
    )
    # Owner 2026-09-18: the tool exists, but a model will not reach for it
    # unless it is told when to. Stated as a rule, like the maths rule below.
    search_rule = (
        f'WHEN TO SEARCH THE WEB: you have "action": "web_search" — a real live-web lookup that '
        f'returns an answer WITH citable sources. Use it WHENEVER the answer depends on something '
        f'you cannot reliably know: anything current (news, prices, schedules, exam dates, release '
        f'versions, who currently holds a role), a specific page or document the user names, or any '
        f'fact you are unsure of. Put a specific, self-contained question in "query" — not keyword '
        f'soup. When it returns sources, use them and name them instead of stating facts bare. '
        f'Do NOT use it for maths, code, or anything you already know reliably — and NEVER invent '
        f'a fact or a source in place of searching. It only reads, so it NEVER takes a permission '
        f'suffix in any mode.\n\n'
    )
    math_rule = (
        f'For math/calculation/date/time questions where the user asks to compute or calculate, use '
        f'"action": "run_shell" — UNLESS the user is asking to search, type, click, or interact with their '
        f'browser/tab/screen (e.g. "search inside my tab, how to solve 1+1"), in which case you MUST use '
        f'"action": "browser_action"!\n\n'
        if node == "extensions"
        else f'For ANY math/calculation/date/time or "check/prove/compute" question, always use '
        f'"action": "run_shell" — you pick a tiny SAFE python3 one-liner (or the date one-liner) '
        f'for the payload; NEVER answer such a question from memory. '
        f'Never ask a clarifying question for a self-contained computation — compute it.\n\n'
    )
    system_prompt += math_rule + search_rule + (
        f'NEVER REFUSE OR DOWNGRADE A REQUEST (operator 08-26): if the user asks for any kind of '
        f'content — an essay, an outline, research, a summary, analysis, ideas, full assignment work — '
        f'YOU PRODUCE IT, completely, right now. No "I can\'t generate...", no "I can provide a brief '
        f'overview", no "what specific aspects would you like", no deferring. If the request is '
        f'under-specified, pick reasonable defaults and deliver the complete finished thing.\n\n'
        f'ASSIGNMENT GUARD (operator 08-28): "never refuse" never means fabricating an assignment. '
        f'If the user asks you to complete, do, or help with a worksheet/assignment/paper you were '
        f'NEVER given — nothing pasted in the message, no attached or loaded file, no existing '
        f'assignment card with real content — never use "create_assignment" and never claim you '
        f'started that work. Reply with "plain_answer" asking them to send the actual assignment '
        f'(paste the text, attach a file, or point at an existing card). Only start assignment work '
        f'grounded in real material.\n\n'
        f"Reply STRICTLY as a single JSON object, no markdown, no extra text: "
        f'{{"action": "<action name>", "payload": {{...}}, "reply": "<your answer>"}}. '
        f'If the user is just talking or asking a question, use "action": "plain_answer" and put the COMPLETE answer in "reply" (it may be long — essays/guides can run several thousand words).'
    )
    if node == "extensions":
        system_prompt += (
            "\nTOOL REALITY (browser extension surface & screen control):\n"
            "You are operating inside the Helpotron extension popup, connected directly to the user's active browser tab.\n"
            "You have REAL tools to control and interact with their browser:\n"
            "1. `browser_action`: You can physically move the mouse cursor, click elements/buttons/searchbars, double click, drag, type text into inputs/searchbars, press keys (like Enter, Tab, Escape, Backspace), and scroll on the user's active webpage!\n"
            "   Whenever the user asks you to interact with their browser (e.g. 'search in my searchbar...', 'search inside my tab...', 'type ... into search', 'click the button', 'fill out the form', 'solve and enter'):\n"
            "   Choose the action `browser_action`!\n"
            "   CRITICAL: Whenever the user asks to search or type into their browser/tab/screen, even if the query mentions math, calculation, date or time (e.g. 'search inside my tab, how to solve 1+1'), ALWAYS choose `browser_action` — NEVER choose `run_shell`!\n"
            "   In payload, provide `actions`: an ordered array of operations (e.g. move to search bar -> click search bar -> type query -> key Enter), and in `reply` explain what you are doing on their screen.\n"
            "   Example for searching or typing in searchbar: {\"action\": \"browser_action\", \"payload\": {\"actions\": [{\"op\": \"move\", \"x\": 480, \"y\": 320}, {\"op\": \"click\", \"x\": 480, \"y\": 320, \"button\": \"left\"}, {\"op\": \"type\", \"text\": \"how to solve 1+x=2\"}, {\"op\": \"key\", \"key\": \"Enter\", \"modifiers\": []}]}, \"reply\": \"Searching in your search bar for 'how to solve 1+x=2'…\"}\n"
            "   NEVER refuse browser requests with 'I don't have a tool to search' or 'I cannot use your browser' — you HAVE the `browser_action` tool!\n"
            "2. `scrape_assignment`: When the user asks you to scrape, capture, or collect the assignment on their tab (Canvas or school page), choose `scrape_assignment`.\n"
        )
    # Conversation memory (operator 08-26): the LLM previously saw ONLY the
    # current message. 08-27 bugfix: the loop walked the history from the
    # OLDEST end and stopped after 10 turns, and load_chat_history_from_db
    # seeded the cache with the OLDEST 40 rows — so the model's "conversation
    # so far" was dominated by PRIOR sessions' task orders (e.g. yesterday's
    # "write a 500-word essay about bananas") and it re-ran them instead of
    # answering the new message. Scope the turns to the SAME DAY as the new
    # message and take the NEWEST ones only (oldest → newest order so the
    # block ends at the immediately prior turn).
    history_full = overlord_agent.get_chat_history(target_key, user=user)
    prior_turns = history_full[:-1]
    cur_ts = history_full[-1].get("timestamp") if history_full else None
    try:
        _cur_day = datetime.fromisoformat(str(cur_ts).replace("Z", "+00:00")).replace(tzinfo=None).date()
    except (ValueError, TypeError):
        _cur_day = datetime.now().date()  # undated message: same-day filter off
    conv_parts = []
    for m in reversed(prior_turns):
        ts = m.get("timestamp")
        try:
            m_day = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).replace(tzinfo=None).date()
        except (ValueError, TypeError):
            m_day = _cur_day  # legacy rows without a usable date: keep in the turn
        if m_day != _cur_day:
            continue  # prior day's task payloads never leak into today's reply
        sender = "User" if m.get("sender") == "user" else agent_name
        body = str(m.get("text") or "").strip()
        if not body:
            continue
        conv_parts.append(f"{sender}: {body[:800]}")
        if len(conv_parts) >= 10:
            break
    conv_parts.reverse()  # chronological — the newest prior turn is last
    history_block = "\n".join(conv_parts) or ""
    user_prompt = (
        (f"CONVERSATION SO FAR (most recent last):\n{history_block}\n\n" if history_block else "")
        + f"User said: {text[:3000]}"
    )
    effort = resolve_agent_effort(settings)

    raw = ""
    try:
          raw = await call_llm(
              system_prompt=system_prompt,
              user_prompt=user_prompt,
              temperature=0.2,
              max_tokens=2400,
              response_format="json_object",
              effort_score=effort,
              db=db, user_id=user.public_id,
              images=images,
              # The extension surface pins its model to the VISION ladder and
              # refuses text-only fallbacks; every other surface leaves this None
              # and routes through the normal text ladder.
              model=model_override,
              vision_only=vision_only,
          )
    except Exception as err:
        logger.error("agent intent LLM failed: %s", err)
        raw = ""

    parsed = _safe_json_extract(raw) if raw else None
    action_name = ""
    force_permission = False
    if parsed and isinstance(parsed.get("action"), str):
        action_name = parsed["action"].strip()
        # 09-01 (Bob, mode rule): a `_ask_permissions` suffix means the model
        # explicitly asks the user — strip it, accept the base action, and the
        # permission gate below takes the approval path even if the engine
        # would have auto-approved.
        if action_name.endswith("_ask_permissions"):
            force_permission = True
            action_name = action_name[: -len("_ask_permissions")].strip()
        lower_txt = text.lower().strip()
        if lower_txt.startswith("submit") or "submit assignment" in lower_txt:
            action_name = "submit_assignment"
    if parsed and action_name in actions:
        return {
            "action": action_name,
            "force_permission": force_permission,
            "payload": parsed.get("payload") if isinstance(parsed.get("payload"), dict) else {},
            "reply": str(parsed.get("reply") or f"Done — {action_name.replace('_', ' ')}."),
        }
    if parsed and parsed.get("action") == "plain_answer":
        lower = text.lower()
        scrape_ask = node == "extensions" and any(
            k in lower for k in ("scrape", "canvas", "capture the page", "collect this page"))
        if "submit" in lower or "delete" in lower or "humanize" in lower or "rubric" in lower or scrape_ask:
            return _regex_fallback_intent(text, node, viewport, screen_analysis)
        return {"action": "plain_answer", "payload": {}, "reply": str(parsed.get("reply") or text)}
    # LLM failed or chose an unknown action — fall back to keyword dispatch
    return _regex_fallback_intent(text, node, viewport, screen_analysis)


def _chat_reply(db, user, thread_key, text, **kw) -> Dict[str, Any]:
    """Record one agent reply in the in-memory history AND the durable store
    (operator 08-27 fix: only the user's messages were persisted before, so
    every agent reply vanished on reload/restart). Also bumps the thread's
    updated_at so the history list reorders correctly."""
    msg = overlord_agent.add_chat_message(
        thread_key, sender="overlord", text=text, user_id=user.id, **kw)
    try:
        from .overlord_agent import persist_chat_message
        persist_chat_message(db, user.id, thread_key, "overlord", text)
    except Exception:
        pass
    try:
        if thread_key:
            th = db.query(AgentChatThread).filter(
                AgentChatThread.id == thread_key, AgentChatThread.user_id == user.id
            ).first()
            if th:
                th.updated_at = datetime.now()
                db.commit()
    except Exception:
        pass
    return msg


def resolve_agent_effort(settings: dict, ctx: Optional[dict] = None) -> int:
    """The user's effort, on the 1..1000 scale the router bands.

    Precedence matters and was wrong: `settings["ai"]["effortScore"]` is what the
    UI sliders actually write (both the web dial and the extension sliders), while
    the top-level `settings["effort_score"]` is a LEGACY key that nothing updates
    any more. Reading the legacy key first meant a stale number silently beat the
    live slider — measured 2026-09-18 on the operator account: top-level
    `effort_score` was 6 (i.e. level 6 -> DeepSeek V4.1 Flash) while the slider sat
    at level 1 (`ai.effortScore` 100 -> the cheap tier). Dragging the slider
    changed the badge and nothing else.

    Accepts a bare level (<=10) or a full score; parse_effort_score scales levels
    up so the router's bands line up with the labels the UI shows.

    `default_effort_level` is a DB COLUMN, not a settings key, and must never be
    consulted here — it defaults to 5 (a level) and reading it as a score would
    pin every user to level 1.
    """
    from .screen_vision import parse_effort_score
    from .humanize_skill import _scoped_value

    # A subject or assignment may override effort. Checked BEFORE the global
    # candidates so a subject set to a cheaper model is not silently outvoted by
    # the account-wide slider (owner 2026-09-21: per-area settings override the
    # global default).
    if ctx:
        scoped_effort = _scoped_value(settings, "ai.effortScore", ctx)
        if scoped_effort is None:
            scoped_effort = _scoped_value(settings, "effort_score", ctx)
        if scoped_effort is not None:
            try:
                return parse_effort_score(scoped_effort)
            except Exception:
                pass

    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    for candidate in (
        ai.get("effortScore"),
        ai.get("effort_score"),
        settings.get("effort_score"),
    ):
        if candidate is not None:
            try:
                return parse_effort_score(candidate)
            except Exception:
                continue
    return 500


def _build_agent_chat_prompt(user, payload: ChatMessageRequest, db: Session) -> Dict[str, Any]:
    settings = dict(user.settings or {})
    thread_key = payload.thread_id if payload.thread_id is not None else payload.assignment_id
    bubble_assignment_id = (payload.assignment_id
                            if payload.thread_id is None
                            and payload.assignment_id not in (None, 0)
                            else None)
    agent_node = "assignment_team" if bubble_assignment_id else "my_agent"
    assignment_ctx = ""
    # The SURFACE is always a scope, even with no assignment in play. Building this
    # only inside the `if bubble_assignment_id` branch left it None on My Agent, so a
    # `place: "my_agent"` override had no context to match against and was silently
    # inert — the control would save, the server would store it, and nothing would
    # ever consult it. The assignment/subject dimensions are added on top when known.
    humanizer_ctx = {"place": agent_node}
    if bubble_assignment_id:
        try:
            _assign_row = db.query(Assignment).filter(
                Assignment.id == bubble_assignment_id, Assignment.user_id == user.id
            ).first()
            if _assign_row is not None:
                assignment_ctx = _agent_assignment_context(db, user, _assign_row)
                _prog = _assign_row.progress or {}
                humanizer_ctx = {
                    "assignment": _assign_row.title,
                    "subject": _prog.get("subject") or _prog.get("course") or "",
                    # The surface is scoped too, so My Agent / the extension can
                    # carry their own overrides (owner 2026-09-21).
                    "place": agent_node,
                }
                humanizer_ctx = {k: v for k, v in humanizer_ctx.items() if v}
                if not humanizer_ctx:
                    humanizer_ctx = None
        except Exception:
            assignment_ctx = ""
            humanizer_ctx = {"place": agent_node}
    try:
        from .overlord_agent import load_chat_history_from_db
        load_chat_history_from_db(db, user.id, thread_key)
    except Exception:
        pass

    system_prompt = agent_system_prompt(user, settings, node=agent_node, ctx=humanizer_ctx)
    if assignment_ctx:
        system_prompt += "\n" + assignment_ctx

    return {
        "settings": settings,
        "thread_key": thread_key,
        "bubble_assignment_id": bubble_assignment_id,
        "agent_node": agent_node,
        "assignment_ctx": assignment_ctx,
        "humanizer_ctx": humanizer_ctx,
        "system_prompt": system_prompt,
    }


@router.post("/agent/chat/stream")
async def stream_chat_message(payload: ChatMessageRequest, request: Request, db: Session = Depends(get_db)):
    """Streaming chat endpoint: live reasoning and tokens with seamless fallback to non-streaming."""
    user = _get_current_user(request, db)
    from .ratelimit import check_costly
    check_costly("agent_turn", request, user)

    ctx = _build_agent_chat_prompt(user, payload, db)
    settings = ctx["settings"]
    thread_key = ctx["thread_key"]
    agent_node = ctx["agent_node"]
    humanizer_ctx = ctx["humanizer_ctx"]
    system_prompt = ctx["system_prompt"]

    # Token check — the same canonical gate the other agent paths use. It reads
    # `is_unmetered` internally, so the OPERATOR passes and a paid tier does not;
    # the old `plan != "elite"` exemption let a subscriber start work on an empty
    # balance. No deduction happens here (owner 2026-09-17: charge after, measured).
    from .credits import has_usage_balance as _has_usage_balance
    if not _has_usage_balance(user):
        async def _insufficient_stream():
            msg = "⚠️ Insufficient tokens — your token balance is 0. Activate the Free Trial or top up in Billing to use My Agent."
            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
        return StreamingResponse(_insufficient_stream(), media_type="text/event-stream")

    # If the message appears to be a tool/action or shell compute:
    shell_cmd = _extract_shell_query(payload.text)
    if shell_cmd or payload.text.strip().startswith("/"):
        async def _actions_stream():
            yield f"data: {json.dumps({'type': 'unavailable', 'reason': 'actions'})}\n\n"
        return StreamingResponse(_actions_stream(), media_type="text/event-stream")

    # Record user message — UNLESS this is a resume. A paused reply is still one
    # turn: writing a user message for the resume would split it in two and put
    # the half-finished answer into the thread as a giant synthetic prompt that
    # every later turn then re-reads.
    resuming = bool((payload.continue_from or "").strip())
    if not resuming:
        user_msg = overlord_agent.add_chat_message(thread_key, sender="user", text=payload.text, user_id=user.id)
        try:
            from .overlord_agent import persist_chat_message
            persist_chat_message(db, user.id, thread_key, "user", payload.text)
        except Exception:
            pass

    # Was `default_effort_level * 100`: that is a DB COLUMN defaulting to 5 (a
    # LEVEL), so this path ran the whole agent chat at score 500 — level 5 —
    # regardless of the slider. Same resolver as every other agent path now.
    effort_score = resolve_agent_effort(settings)

    if resuming:
        # Ask for the remainder only. Without the "do not repeat" instruction a
        # model restarts the answer, so the user sees the whole thing twice.
        user_prompt = (
            "Your previous answer was interrupted before it finished. Continue it from "
            "exactly where it stops.\n\n"
            "Rules:\n"
            "- Do not repeat, restate, summarise or re-introduce anything already written.\n"
            "- Do not write a preamble, apology, or the words \"continuing from where I left off\".\n"
            "- Output ONLY the remaining text, matching the style and formatting of the part below.\n\n"
            "Answer so far:\n"
            f"{(payload.continue_from or '').strip()}"
        )
    else:
        user_prompt = payload.text

    # Metering watermark (owner 2026-09-17): everything this turn consumes — the
    # streamed LLM call, the detection standard, the humanizer pass — is summed
    # after the answer completes and charged as one MEASURED cost. Take it before
    # any work starts; a watermark is a position in the ledger, not a lock.
    try:
        from .credits import ledger_watermark
        _usage_mark = ledger_watermark(db, user.id)
    except Exception:
        _usage_mark = None

    async def event_generator():
        from .llm import stream_llm
        full_reply = ""
        stream_failed = False
        try:
            async for chunk in stream_llm(
                user_prompt=user_prompt,
                system_prompt=system_prompt,
                effort="auto",
                effort_score=effort_score,
                user_id=str(user.id),
                db=db,
            ):
                if chunk.get("type") == "fallback":
                    stream_failed = True
                    break
                elif chunk.get("type") == "reasoning":
                    yield f"data: {json.dumps({'type': 'reasoning', 'delta': chunk['text']})}\n\n"
                elif chunk.get("type") == "content":
                    full_reply += chunk["text"]
                    yield f"data: {json.dumps({'type': 'delta', 'delta': chunk['text']})}\n\n"
        except Exception as err:
            logger.warning("stream_chat_message exception: %s", err)
            stream_failed = True

        # 09-07: the assembled stream is an LLM return path like any other —
        # strip thinking/deliberation before it is persisted or sent in the
        # done frame (live deltas streamed as-is; the durable reply is clean).
        from .llm import strip_thinking_tokens as _strip
        full_reply = _strip(full_reply)
        if stream_failed or not full_reply.strip():
            yield f"data: {json.dumps({'type': 'unavailable', 'reason': 'actions'})}\n\n"
            return

        # Deduct tokens and persist final reply
        #
        # 09-18: this was a flat 1 token, and it exempted `elite` — which is a
        # metered tier. Only the OPERATOR account is unmetered, so that guard let
        # every subscriber consume unbounded upstream spend for 1 token per answer.
        # The turn now costs what it measured: the LLM's own reported charge, at
        # 100 tokens per cent. charge_actual_usage() applies the operator exemption
        # itself via is_unmetered(), so no plan check belongs here.
        if _usage_mark is not None:
            try:
                from .credits import charge_actual_usage
                charge_actual_usage(
                    user, "agent_chat_stream", db, since_id=_usage_mark,
                    pre_charged=0,  # nothing was guessed up front
                    reason=f"usage:chat_stream:{user.id}:{_usage_mark}",
                    # The watermark names the window, so a re-entered settlement of
                    # the SAME window bills once. Two genuinely concurrent turns can
                    # share a watermark and would settle once — an undercharge, which
                    # is the safe direction to be wrong in.
                    idempotency_key=f"usage:chat_stream:{user.id}:{_usage_mark}",
                )
            except Exception as usage_error:
                db.rollback()
                logger.error("chat stream usage charge failed: %s", usage_error)

        # AI Detection Standard
        if full_reply and not full_reply.startswith(("⚠️", "✅", "❌")):
            full_reply = await _apply_detection_standard(
                settings, user, full_reply, node=agent_node, humanizer_ctx=humanizer_ctx, db=db,
            )

        _chat_reply(db, user, thread_key, text=full_reply)
        await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))

        # Post-charge balance rides the done frame so the top-bar widget
        # updates live after streamed chats (same contract as the non-stream
        # reply's token_balance, operator 08-27).
        yield f"data: {json.dumps({'type': 'done', 'reply': full_reply, 'token_balance': _tk_balance(user)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/agent/chat")
async def send_chat_message(payload: ChatMessageRequest, request: Request, db: Session = Depends(get_db)):
    """One agent, any request: the LLM picks the action, the pipeline executes it."""
    user = _get_current_user(request, db)
    # Rate-limit AFTER the account is known — the bucket must be per-account, and
    # a dependency would run before this and could only see the IP (which behind
    # cloudflared is one shared address). Limit is deliberately 60/min: the
    # extension loop legitimately runs up to 40 rounds, so a tighter cap would
    # break a working task, which is worse than no cap.
    from .ratelimit import check_costly
    check_costly("agent_turn", request, user)
    from .security import is_admin_user
    is_admin = bool(getattr(user, "is_admin", False)) or is_admin_user(user)

    # Metering watermark (owner 2026-09-17): everything this user consumes from
    # here to the end of the request — the intent LLM, the action's own calls, the
    # detectors, the humanizer — is summed and charged as one measured cost.
    try:
        from .credits import ledger_watermark
        _usage_mark = ledger_watermark(db, user.id)
    except Exception:
        _usage_mark = None

    ctx = _build_agent_chat_prompt(user, payload, db)
    settings = ctx["settings"]
    thread_key = ctx["thread_key"]
    bubble_assignment_id = ctx["bubble_assignment_id"]
    agent_node = ctx["agent_node"]
    assignment_ctx = ctx["assignment_ctx"]
    humanizer_ctx = ctx["humanizer_ctx"]
    system_prompt = ctx["system_prompt"]

    # Token gate (operator 08-26): nothing runs until the operator grants tokens.
    # Credits remain for discounts; token_balance is the usage budget.
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

    # Record user message
    user_msg = overlord_agent.add_chat_message(thread_key, sender="user", text=payload.text, user_id=user.id)
    try:
        from .overlord_agent import persist_chat_message
        persist_chat_message(db, user.id, thread_key, "user", payload.text)
    except Exception:
        pass
    # Auto-title a new thread from its first user message (operator 08-26).
    # The current conversation (key 0) titles the same way, unless the user
    # already renamed it (operator 08-27: it is a regular chat, not "Main chat").
    try:
        if payload.thread_id:
            th = db.query(AgentChatThread).filter(
                AgentChatThread.id == payload.thread_id, AgentChatThread.user_id == user.id
            ).first()
            if th:
                th.updated_at = datetime.now()
                if th.title == "New chat":
                    th.title = payload.text.strip().replace("\n", " ")[:60] or "New chat"
                db.commit()
        elif not thread_key:
            settings = dict(user.settings or {})
            if "current_chat_title" not in settings:
                settings["current_chat_title"] = payload.text.strip().replace("\n", " ")[:60] or "current chat"
                user.settings = settings
                db.commit()
    except Exception:
        pass

    # 1. LLM decides the intent via OpenRouter (strict JSON contract, regex fallback)
    intent = await _resolve_agent_intent(
        user, settings, payload.text, is_admin, db=db, target_key=thread_key,
        node=agent_node, assignment_context=assignment_ctx, humanizer_ctx=humanizer_ctx,
    )

    # 2. Plain conversational answer — no action needed (still costs tokens: every
    #    LLM reply is paid from the usage budget — operator 08-26).
    if intent["action"] == "plain_answer":
        if not is_admin and user.plan != "elite":
            _charge_tokens(user, db, 1.0)
        reply_text = strip_thinking_tokens(intent["reply"])
        if _is_degenerate_reply(reply_text):
            reply_text = await _conversational_fallback(
                user, payload.text, db=db, node=agent_node, assignment_context=assignment_ctx,
            )
        reply_text = strip_thinking_tokens(reply_text)
        if _is_degenerate_reply(reply_text):
            reply_text = ("I couldn't generate a reply just now (the model "
                          "service may be down) — please try again in a moment.")
        # AI Detection Standard (operator 08-31): prose replies only — status
        # markers and error text are never rewritten.
        if reply_text and not reply_text.startswith(("⚠️", "✅", "❌")):
            reply_text = await _apply_detection_standard(
                settings, user, reply_text, node=agent_node, humanizer_ctx=humanizer_ctx, db=db,
            )
        agent_reply = _chat_reply(db, user, thread_key, text=reply_text)
        await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))
        return {"status": "success", "message": agent_reply, "execution": None, "reply": reply_text,
                "token_balance": _tk_balance(user)}

    # 2.5 TOKEN GATE (operator 08-26): actions that do work must be affordable
    # BEFORE execution. Only the operator account is exempt — every paid plan
    # runs on its monthly token allowance. The permission flow is separate.
    # ELIGIBILITY, not a price (owner 2026-09-17: "no flat prices"). The flat
    # table survives only as a hint at whether an action does billable work at
    # all (0 = read-only, needs no balance). There is no up-front deduction —
    # the measured cost is charged after execution.
    from .credits import has_usage_balance as _has_usage_balance
    does_work = _AGENT_ACTION_COSTS.get(intent["action"], 0) > 0
    if does_work and not _has_usage_balance(user):
        return _insufficient_tokens_response(thread_key, user, 1, db)

    # 3. Permission gate (manual mode asks; auto approves routine; yolo never
    # asks). 09-01 (Bob): a bare `_ask_permissions` call forces the approval
    # path even when the engine would have approved — but pure read-only
    # actions can NEVER be gated, by any mode, ever.
    mode_override = payload.session_mode_override
    if mode_override and mode_override.lower() == "yolo" and settings.get("operation_mode") != "yolo":
        mode_override = None

    is_approved, reason = permission_engine.evaluate_action_permission(
        user_settings=settings,
        action_type=intent["action"],
        session_mode_override=mode_override,
    )
    if intent.get("force_permission") and intent["action"] not in READONLY_ACTION_TYPES:
        is_approved = False

    # run_shell is a read-only, sandboxed compute query — it never asks for
    # permission (like plain_answer); it still pays the credit gate above.
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
        return {
            "status": "permission_required",
            "permission_request": perm,
            "approval_request": approval_request_payload(perm),
            "message": agent_reply,
            "token_balance": _tk_balance(user),
        }

    # 4. Execute the chosen action
    # Operator 08-27: thread_key is the assignment id for assignment-bubble
    # chats but a conversation-thread id for main chat. Only pass a real
    # assignment context so flashcards/materials attach to the assignment
    # they were asked in — never to a thread id (which mis-links decks).
    # (bubble_assignment_id was resolved at the top of this handler, operator
    # 08-28 — same rule, shared by the node/context resolution.)
    # 3.9 ASSIGNMENT GUARD (operator 08-28): never fabricate an assignment card
    # the user never gave. Ask for the real material instead of a fake "✅".
    if intent["action"] == "create_assignment":
        _grounded, _ask = _assignment_request_grounded(payload.text, user, db, bubble_assignment_id)
        if not _grounded:
            reply_text = f"⚠️ {_ask}"
            agent_reply = _chat_reply(db, user, thread_key, text=reply_text, suggested_actions=[])
            return {"status": "failed", "message": agent_reply, "reply": reply_text,
                    "token_balance": _tk_balance(user)}
    # Admission control (owner 2026-09-17): under load the task QUEUES rather
    # than failing or fighting for CPU. Budget is 80% RAM / 85% CPU, measured
    # machine-wide. No timeout — a task must never be dropped for taking long.
    from .resource_guard import run_with_budget as _budgeted
    from .priority import priority_for_action as _prio
    exec_res = await _budgeted(lambda: overlord_agent.execute_task_action(
        db,
        user=user,
        action_type=intent["action"],
        payload=intent["payload"],
        assignment_id=bubble_assignment_id,
        node=agent_node,
    ),
        process=_prio(intent["action"]))
    if not is_admin and user.plan != "elite":
        _charge_usage(user, db, intent["action"], since_id=_usage_mark)
    _LLM_EMPTY_HONEST = ("Hmm — I ran into an issue answering that one."
                         " Try again in a moment?")
    if exec_res.get("status") == "failed":
        reply_text = f"⚠️ {strip_thinking_tokens(exec_res.get('message', 'Could not do that.'))}"
    else:
        result_msg = strip_thinking_tokens(exec_res.get("message") or exec_res.get("result_text"))
        if _is_degenerate_reply(result_msg):
            # Execution completed silently (misclassified intent / empty result):
            # answer the user's message conversationally instead of a bare ✅.
            result_msg = await _conversational_fallback(
                user, payload.text, node=agent_node, assignment_context=assignment_ctx,
            )
            result_msg = strip_thinking_tokens(result_msg)
        if intent["action"] == "humanize_text" and exec_res.get("result_text"):
            reply_text = strip_thinking_tokens(exec_res["result_text"])
            if _is_degenerate_reply(reply_text):
                reply_text = _LLM_EMPTY_HONEST
        elif _is_degenerate_reply(result_msg):
            # No real answer anywhere — say so honestly rather than faking
            # a completion ("Done." on a question is a phantom pass).
            reply_text = _LLM_EMPTY_HONEST
        else:
            reply_text = f"✅ {result_msg}"
    # AI Detection Standard (operator 08-31): score/redo the prose body. The
    # cosmetic ✅ prefix is re-attached; warning/error text is never rewritten.
    _det_prefix = ""
    _det_body = reply_text
    if not reply_text.startswith(("⚠️", "❌")):
        if reply_text.startswith("✅ "):
            _det_prefix = "✅ "
            _det_body = reply_text[2:]
        _det_body = await _apply_detection_standard(
            settings, user, _det_body, node=agent_node, humanizer_ctx=humanizer_ctx, db=db,
        )
        reply_text = _det_prefix + _det_body
    agent_reply = _chat_reply(
        db, user, thread_key,
        text=reply_text,
        suggested_actions=[],
        subagent_logs=[],
        metadata={"intent_action": intent["action"]})

    # 5. Auto-compaction: keep the thread lean (>40 msgs or >12k chars → summarize)
    await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))

    return {"status": "success", "message": agent_reply, "execution": exec_res, "reply": reply_text,
            "token_balance": _tk_balance(user)}


# ─── My Agent composer attachment (operator 08-28): the paperclip now sends
# the REAL file. The upload is OCR/text-extracted with the same helpers the
# assignment dump uses, then forwarded through the EXACT chat pipeline above
# (intent, token gate, permission system, persistence — all identical). ──────

_ATTACH_MAX_BYTES = 30 * 1024 * 1024

_ATTACH_FALLBACK_MARKERS = (
    "OCR Image scan: ", "Image scanned: ", "Image document: ",
    "File content: ", "PDF extract: ", "Error reading text file: ",
)


def _sniff_image_ext(content: bytes) -> Optional[str]:
    """Content sniff (operator 08-28): a renamed .txt that holds a PNG is still
    an image. Only png/jpg/gif/webp get the vision-OCR route — everything else
    falls to the document text extraction."""
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if content[:3] == b"\xff\xd8\xff":
        return "jpg"
    if content[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"
    return None


def _attach_text_usable(text: str) -> bool:
    """True when extraction produced real content, not an error/fallback
    placeholder (same markers the dump engine rejects; %PDF content is binary
    junk the 'printable chars' fallback can fabricate)."""
    t = (text or "").strip()
    return len(t) >= 5 and not t.startswith("%PDF") and not any(m in t for m in _ATTACH_FALLBACK_MARKERS)


@router.post("/agent/chat/attach")
async def attach_to_agent_chat(
    request: Request,
    file: UploadFile = File(...),
    text: str = Form(""),
    db: Session = Depends(get_db),
):
    """My Agent composer attachment: extract the upload (vision OCR for images,
    text extraction for documents), then call the same handler as
    POST /api/agent/chat with the content — the agent sees the REAL file."""
    user = _get_current_user(request, db)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(content) > _ATTACH_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (30 MB max).")

    filename = os.path.basename(file.filename or "attachment")
    ext = os.path.splitext(filename)[1].lower()
    sniffed = _sniff_image_ext(content)
    is_image = sniffed is not None or ext in (".png", ".jpg", ".jpeg", ".webp", ".gif")

    # Save to a temp file first — the dump helpers and vision OCR both need a
    # real path (and the OCR mime follows the extension). Always cleaned up.
    with tempfile.NamedTemporaryFile(
        prefix="helpotron_attach_", suffix=f".{sniffed or ext.lstrip('.') or 'bin'}", delete=False
    ) as tmpf:
        tmp_path = tmpf.name
        tmpf.write(content)
    try:
        from .assignment_dump import AssignmentDumpManager
        if is_image:
            extracted = await AssignmentDumpManager._ocr_image_gemini(tmp_path, user.public_id)
        else:
            category = AssignmentDumpManager.detect_file_category(filename)
            extracted, _engine = await AssignmentDumpManager.extract_text_from_file(
                file_path=tmp_path, file_category=category, user_id=user.public_id
            )
    finally:
        with contextlib.suppress(OSError):
            os.unlink(tmp_path)

    if _attach_text_usable(extracted):
        extraction_block = f"[Attachment: {filename}]\n{extracted[:8000]}"
    else:
        # OCR/fallback text ("OCR Image scan: ...") or genuinely empty content —
        # still hand the agent the file so it can answer knowledgeably.
        extraction_block = f"[Attachment: {filename}]\n(the attachment produced no readable text)"

    user_text = text.strip()
    combined = f"{user_text}\n\n{extraction_block}" if user_text else extraction_block

    forwarded = await send_chat_message(
        ChatMessageRequest(assignment_id=0, text=combined[:12000], session_mode_override="auto"),
        request,
        db,
    )
    if not isinstance(forwarded, dict):
        forwarded = {"reply": str(forwarded)}
    # Most branches reply under "reply"; failure branches put it under "message"
    # — normalize to the same shape the chat UI reads.
    if not forwarded.get("reply"):
        forwarded = dict(forwarded)
        forwarded["reply"] = forwarded.get("message") or (
            "I got your file but couldn't process it right now — try again.")
    return forwarded


@router.post("/agent/task")
async def dispatch_task(payload: TaskRequest, request: Request, db: Session = Depends(get_db)):
    """Dispatches a direct task to the sub-agent pipeline with mode-based permission checks."""
    user = _get_current_user(request, db)
    thread_key = payload.assignment_id  # 08-28 operator: was undefined -> NameError (crash)

    # 09-01 (Bob, mode rule): the client may send "<action>_ask_permissions" —
    # strip the suffix and force the approval path (read-only actions never).
    action_type = (payload.action_type or "").strip()
    force_permission = False
    if action_type.endswith("_ask_permissions"):
        force_permission = True
        action_type = action_type[: -len("_ask_permissions")].strip()

    user_settings = user.settings or {}
    mode_override = payload.session_mode_override
    if mode_override and mode_override.lower() == "yolo" and user_settings.get("operation_mode") != "yolo":
        mode_override = None

    is_approved, reason = permission_engine.evaluate_action_permission(
        user_settings=user_settings,
        action_type=action_type,
        session_mode_override=mode_override,
    )
    if force_permission and action_type not in READONLY_ACTION_TYPES:
        is_approved = False

    if not is_approved:
        perm = overlord_agent.create_pending_permission(
            user_public_id=user.public_id,
            action_type=action_type,
            title=payload.title,
            description=payload.description or f"Permission required for '{action_type}'",
            payload=payload.payload,
            assignment_id=thread_key,
        )
        return {
            "status": "permission_required",
            "permission_request": perm,
            "approval_request": approval_request_payload(perm),
            "message": f"Action '{action_type}' paused awaiting user confirmation.",
        }

    # Admission control, same as the other agent action paths. This endpoint was
    # the one that got missed — it runs the identical execute_task_action, so
    # leaving it ungated meant a caller could bypass the 80%/90% caps simply by
    # posting here instead.
    from .resource_guard import run_with_budget as _budgeted
    from .priority import priority_for_action as _prio
    exec_res = await _budgeted(lambda: overlord_agent.execute_task_action(
        db,
        user=user,
        action_type=action_type,
        payload=payload.payload,
        assignment_id=thread_key,
    ),
        process=_prio(action_type))
    return {"status": "success", "execution_result": exec_res}


# ─── Natural Language Overlord Command & Sandbox Endpoints ───────────────────

class NLPCommandRequest(BaseModel):
    text: str
    mode_override: Optional[str] = None
    target_key: Optional[str] = "global"
    files: Optional[List[Dict[str, Any]]] = None


class SandboxScriptRequest(BaseModel):
    script_code: str
    language: str = "python"
    subagent_name: str = "sandbox_worker"
    timeout: float = 30.0
    input_files: Optional[Dict[str, str]] = None


@router.post("/agent/command")
async def execute_natural_language_command(
    payload: NLPCommandRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Executes a natural language directive via the Overlord agent with full ecosystem control."""
    user = _get_current_user(request, db)
    res = await overlord_agent.parse_and_execute_command(
        db=db,
        user=user,
        prompt=payload.text,
        mode_override=payload.mode_override,
        files=payload.files,
        target_key=payload.target_key or "global",
    )
    return res


@router.post("/agent/sandbox/execute")
async def execute_sandbox_script_endpoint(
    payload: SandboxScriptRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Executes a sub-agent script inside an isolated virtual sandbox with resource limits.

    Admin-only (audit 08-29). This route takes attacker-supplied ``script_code``
    and runs it; before the gate any signed-up account could reach it, and
    signup is open. The agent pipeline does not depend on this route — both
    internal callers (overlord_agent.py) invoke ``execute_subagent_task``
    directly — so restricting it removes the surface without changing product
    behaviour.
    """
    from .admin import require_admin
    user = require_admin(request, db)
    from .engine.sandbox import sandbox_manager
    res = await sandbox_manager.execute_subagent_task(
        subagent_name=payload.subagent_name,
        user_id=user.public_id,
        script_code=payload.script_code,
        language=payload.language,
        input_files=payload.input_files,
        auto_cleanup=True,
        timeout=payload.timeout,
    )
    return {"status": "success", "sandbox_result": res}


@router.get("/agent/sandbox/active")
def list_active_sandboxes_endpoint(request: Request, db: Session = Depends(get_db)):
    """Lists currently active virtual sub-agent sandboxes."""
    user = _get_current_user(request, db)
    from .engine.sandbox import sandbox_manager
    from .security import is_admin_user
    sandboxes = sandbox_manager.list_active()
    if not is_admin_user(user):
        sandboxes = [s for s in sandboxes if s.get("user_id") == user.public_id]
    return {"sandboxes": sandboxes}


@router.post("/agent/sandbox/cleanup")
def cleanup_sandbox_endpoint(payload: Dict[str, str], request: Request, db: Session = Depends(get_db)):
    """Manually cleans up a virtual sandbox."""
    user = _get_current_user(request, db)
    sandbox_id = payload.get("sandbox_id", "")
    from .engine.sandbox import sandbox_manager
    from .security import is_admin_user
    sbx = sandbox_manager.get_sandbox(sandbox_id)
    if not sbx:
        return {"status": "not_found", "sandbox_id": sandbox_id}
    if sbx.user_id != user.public_id and not is_admin_user(user):
        raise HTTPException(403, "You can only clean up your own sandboxes")
    success = sandbox_manager.cleanup_sandbox(sandbox_id)
    return {"status": "success" if success else "not_found", "sandbox_id": sandbox_id}
