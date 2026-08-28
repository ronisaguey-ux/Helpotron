"""FastAPI routes for Overlord Main Agent, Assignment Cards, 3 Operation Modes, and Permission System."""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .agent_files import delete_agent_file, list_agent_files, save_agent_file
from .agent_memory import append_memory, delete_memory, load_memory, replace_memory
from .database import AgentChatThread, Assignment, User, get_db
from .overlord_agent import agent_display_name, overlord_agent, permission_engine

router = APIRouter(prefix="/api", tags=["overlord_and_cards"])


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class TaskRequest(BaseModel):
    assignment_id: Optional[int] = None
    action_type: str = Field(..., description="analyze_rubric | draft_section | humanize_text | submit_assignment | custom")
    title: str = "Sub-Agent Task Execution"
    description: str = ""
    payload: Dict[str, Any] = {}
    session_mode_override: Optional[str] = None  # manual | auto | yolo


class ChatMessageRequest(BaseModel):
    assignment_id: int
    text: str
    action_type: Optional[str] = None
    session_mode_override: Optional[str] = None
    thread_id: Optional[int] = None  # chat thread (0/none = legacy single conversation)


class ThreadCreateRequest(BaseModel):
    title: Optional[str] = None


class ThreadRenameRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    pinned: Optional[bool] = None


class PermissionResponseRequest(BaseModel):
    permission_id: str
    decision: str = Field(..., description="approve | reject | always_approve | write_something_else")
    comment: Optional[str] = None
    replacement_text: Optional[str] = None


class ModeUpdateRequest(BaseModel):
    mode: str = Field(..., description="manual | auto | yolo")
    is_session_override: bool = False


class AutoApprovedRuleRequest(BaseModel):
    rule: str


# ─── Claude Code bridge (My Agent → Claude Code) ────────────────────────────
# When HELPOTRON_CLAUDE_BRIDGE=1, agent-chat messages from the site are
# forwarded to a headless `claude -p` session that IS the My Agent: it can
# use the helpotron-admin MCP server (mcp/server.js) to look up users, adjust
# credits, check health and run platform operations. Its reply is stored in
# the normal chat history and returned to the site. Admin-only by default
# (HELPOTRON_CLAUDE_BRIDGE_ADMIN_ONLY=1). Any failure falls back to the
# local intent pipeline — the bridge never breaks the chat.

def _claude_bridge_enabled() -> bool:
    return os.environ.get("HELPOTRON_CLAUDE_BRIDGE") == "1"


def _claude_bridge_allowed(is_admin: bool) -> bool:
    if not _claude_bridge_enabled():
        return False
    admin_only = os.environ.get("HELPOTRON_CLAUDE_BRIDGE_ADMIN_ONLY", "1") != "0"
    return (not admin_only) or is_admin


def _claude_bridge_call(public_id: str, user_text: str) -> Optional[str]:
    """Forward one agent-chat message to headless Claude Code. Returns the
    reply text, or None on any failure (caller falls back to the local
    pipeline). Never shells out — argv array only."""
    try:
        mcp_cfg = Path(__file__).resolve().parent.parent / "mcp" / "claude_bridge_config.json"
        if not mcp_cfg.exists():
            return None
        prompt = (
            "You are Helpotron's My Agent, responding to a user on the helpotron "
            f"website (public_id: {public_id}). The user sent this message:\n\n"
            f"{user_text}\n\n"
            "If the user asks to do anything on the platform — look up a user, "
            "adjust credits, check system health, platform operations — use the "
            "helpotron-admin MCP tools to resolve it. Reply to the user directly "
            "and concisely (a few sentences max), reporting what you actually did."
        )
        proc = subprocess.run(
            [
                "claude", "-p", prompt,
                "--mcp-config", str(mcp_cfg),
                "--dangerously-skip-permissions",
                "--output-format", "json",
                "--model", "sonnet",
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if proc.returncode != 0:
            return None
        out = json.loads(proc.stdout)
        if out.get("type") != "result" or not out.get("result"):
            return None
        candidate = str(out["result"]).strip() or None
        if candidate is None or _is_degenerate_reply(candidate):
            return None
        return candidate
    except Exception:
        return None


def _is_degenerate_reply(text: str) -> bool:
    """True when a reply carries no substance: empty, or punctuation/emoji-
    only (a lone '👍' has NO word characters). The claude bridge — and
    occasionally the local LLM — can hand back exactly this when the model
    decides the message needs no words; sending it verbatim looks like a
    broken bare reaction. Callers treat a degenerate reply as 'no reply' and
    fall back to a real answer.
    """
    t = (text or "").strip()
    return (not t) or (re.fullmatch(r"[\W_]+", t, re.UNICODE) is not None)


# ─── Helper to extract user ───────────────────────────────────────────────────

def _get_current_user(request: Request, db: Session) -> User:
    """Authenticated user lookup (remediation BATCH-11): identity comes only
    from a valid Bearer token or session cookie — the X-Public-ID header is
    never an identity and no user is auto-selected from the DB."""
    from .routes_features import get_current_authenticated_user
    return get_current_authenticated_user(request, db)
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

        card = {
            "id": a.id,
            "name": a.title,
            "subject": progress.get("subject", "General Academic"),
            "class_code": progress.get("course_code", "GEN-101"),
            "teacher_name": progress.get("teacher_name", "Prof. Academic"),
            "estimated_time": progress.get("estimated_time", "45 mins"),
            "status": status_label,
            "due_date": a.due_date or "No Deadline",
            "score_ai": progress.get("ai_score", 12.0),
        }
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


@router.get("/assignment/{assignment_id}/full-view")
async def get_assignment_full_view(assignment_id: int, request: Request, db: Session = Depends(get_db)):
    """Returns comprehensive full-page assignment details: prompt, rubric, attachments, subagent progress."""
    user = _get_current_user(request, db)
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id, Assignment.user_id == user.id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    progress = assignment.progress or {}
    chat_history = overlord_agent.get_chat_history(assignment_id, user=user)

    return {
        "status": "success",
        "assignment": {
            "id": assignment.id,
            "title": assignment.title,
            "prompt": assignment.prompt or "Full research essay prompt and requirements.",
            "due_date": assignment.due_date,
            "status": assignment.status,
            "rubric": progress.get("rubric", "Standard grading rubric: Thesis & Argumentation (25%), Textual Evidence (25%), Structural Cadence (25%), Citations & Format (25%)."),
            "attached_files": progress.get("attached_files", ["lecture_transcript_week3.txt", "rubric_guidelines.pdf"]),
            "subagent_progress": progress.get("subagent_steps", [
                {"agent": "Rubric Decomposition Agent", "status": "completed", "progress": 100},
                {"agent": "Draft Synthesis Agent", "status": "in_progress", "progress": 70},
                {"agent": "AI Humanizer & Cadence Agent", "status": "pending", "progress": 0},
            ]),
            # Completed work from Assignment Dump "do it" finalize (operator 08-26).
            "do_it_work": progress.get("do_it_work"),
        },
        "materials": _assignment_materials(db, assignment_id),
        "chat_history": chat_history,
    }


# ─── Chat threads (operator 08-26) ──────────────────────────────────────────
@router.get("/agent/threads")
async def list_chat_threads(request: Request, db: Session = Depends(get_db)):
    """All conversation threads for the user, newest first."""
    user = _get_current_user(request, db)
    rows = (
        db.query(AgentChatThread)
        .filter(AgentChatThread.user_id == user.id)
        .order_by(AgentChatThread.pinned.desc(), AgentChatThread.updated_at.desc())
        .all()
    )
    return {"status": "success", "threads": [
        {"id": t.id, "title": t.title, "pinned": bool(t.pinned), "created_at": t.created_at.isoformat() if t.created_at else None,
         "updated_at": t.updated_at.isoformat() if t.updated_at else None}
        for t in rows
    ]}


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


@router.post("/agent/permission/respond")
async def respond_to_permission(payload: PermissionResponseRequest, request: Request, db: Session = Depends(get_db)):
    """Handles user approval decision: approve, reject, always_approve, or write_something_else."""
    user = _get_current_user(request, db)
    perm_entry = overlord_agent._pending_permissions.get(payload.permission_id)
    if not perm_entry:
        raise HTTPException(404, "Permission request not found")
    if perm_entry.get("user_public_id") != user.public_id:
        raise HTTPException(403, "Permission request does not belong to you")

    decision = payload.decision.lower()
    assignment_id = perm_entry.get("assignment_id")

    if decision == "write_something_else":
        perm_entry["status"] = "cancelled"
        replacement = payload.replacement_text or payload.comment or "Cancelled in favor of alternative instructions."
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
        reject_note = payload.comment or "Declined by user."
        if assignment_id:
            overlord_agent.add_chat_message(
                assignment_id,
                sender="overlord",
                text=f"❌ Action '{perm_entry['action_type']}' rejected by user. Note: {reject_note}", user_id=user.id)
        return {"status": "rejected", "decision": "reject", "note": reject_note}

    if decision == "always_approve":
        # Add action type to user's persistent auto_approved_actions
        settings = dict(user.settings or {})
        auto_list = set(settings.get("auto_approved_actions", []))
        auto_list.add(perm_entry["action_type"])
        settings["auto_approved_actions"] = list(auto_list)
        user.settings = settings
        db.commit()

    # Execute approved action (with optional user instructions/comments merged in)
    perm_entry["status"] = "approved"
    action_payload = dict(perm_entry["payload"])
    if payload.comment:
        action_payload["user_instruction"] = payload.comment

    exec_res = await overlord_agent.execute_task_action(
        db,
        user=user,
        action_type=perm_entry["action_type"],
        payload=action_payload,
        assignment_id=assignment_id,
    )
    if assignment_id and payload.comment:
        overlord_agent.add_chat_message(
            assignment_id,
            sender="user",
            text=f"Approval Note: {payload.comment}", user_id=user.id)
    return {"status": "success", "decision": decision, "execution_result": exec_res, "comment": payload.comment}


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
    _get_current_user(request, db)
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
    return {
        "status": "ok",
        "url": f"/uploads/avatars/{disk_name}",
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
            raise HTTPException(status_code=404, detail="Assignment not found")
    try:
        from .overlord_agent import load_chat_history_from_db
        load_chat_history_from_db(db, user.id, assignment_id)
    except Exception:
        pass
    return {"status": "success", "chat": overlord_agent.get_chat_history(assignment_id, user=user)}


# ─── 4.5. LLM-first agent intent (one agent, does anything) ──────────────────

_AGENT_ACTIONS = {
    "create_assignment": {"title": "str", "prompt": "str", "due_date": "str", "course": "str"},
    "delete_assignment": {"assignment_id": "int"},
    "read_assignment": {"assignment_id": "int"},
    "edit_assignment": {"assignment_id": "int", "updates": "dict with optional keys title, due_date (ISO string), prompt, status (one of: tracked, not_started, in_progress, completed, submitted, graded, paused), progress — progress MUST be a JSON object of {section: state} e.g. {\"section 2\": \"done\"}, NEVER a string or list"},
    "change_settings": {"settings": "dict — valid keys: effort_score (int 1-1000), agent_name (str), personality (str), instructions (str), operation_mode (manual|auto|yolo), auto_approved_actions (list of action names), school_name, major, goal"},
    "generate_flashcards": {"title": "str", "cards": "list of {front,back}"},
    "humanize_text": {"text": "str to humanize"},
    "analyze_rubric": {"prompt": "str", "rubric": "str"},
    "draft_section": {"section_name": "str"},
    "submit_assignment": {"assignment_id": "int"},
    "message_assignment_team": {"assignment_id": "int", "instruction": "str"},
    "run_sandbox_script": {"script": "str", "language": "python"},
    "run_shell": {"command": "str — ONE tiny SAFE command (no ;, |, &, `, $, <, >): for math use python3 -c \"import math;print(<expr>)\"; for date/time use the exact python date one-liner. The command is generated BY YOU (never taken from the user text) and must only compute or print a fact."},
    "remember": {"text": "str fact/preference to store permanently"},
    "forget_memory": {"entry_id": "str or text snippet to forget"},
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
    "read_assignment": 0, "change_settings": 0,
    "remember": 0, "forget_memory": 0, "plain_answer": 0,
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
    t = re.sub(r"^(?:what\s+is|whats|what'?s|calculate|compute|solve|how\s+much\s+is|answer|result|result\s*of)\s*[:=]?\s*", "", t)
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
    return t


_MATH_FUNC_RENAME = re.compile(r"\b(sqrt|sin|cos|tan|asin|acos|atan|log10|ln|exp|abs|round|floor|ceil|factorial|pow)\b")


def _build_math_command(expr: str) -> str:
    """Tiny deterministic python one-liner: `python3 -c "import math;print(<expr>)"`."""
    e = re.sub(r"\be\b", "math.e", expr)
    e = re.sub(r"\bpi\b", "math.pi", e)
    e = re.sub(r"\bln\b", "math.log", e)
    e = _MATH_FUNC_RENAME.sub(r"math.\1", e)
    code = f"import math;print({e})"
    return f'python3 -c "{code}"'


def _insufficient_tokens_response(target_key, user, required) -> Dict[str, Any]:
    """Non-upgraded user without token budget: friendly refusal, action NOT run.
    Tokens = usage; credits = discounts (operator 08-26)."""
    reply = (
        "⚠️ Insufficient tokens — the operator hasn't granted you enough tokens yet. "
        "Ask them to grant you tokens (or upgrade your account) to use My Agent."
    )
    msg = overlord_agent.add_chat_message(target_key, sender="overlord", text=reply, user_id=user.id)
    return {
        "status": "insufficient_tokens",
        "message": msg,
        "reply": reply,
        "payload": {"required": required, "available": float((user.settings or {}).get("token_balance", 0) or 0)},
    }


_DATE_CODE = (
    "import datetime as dt;d=dt.date.today();"
    "print('Today is ' + d.strftime('%A, %B') + ' ' + str(d.day) + ', ' + str(d.year) + '.')"
)
_TIME_CODE = (
    "import datetime as dt;d=dt.datetime.now();"
    "print('The time is ' + d.strftime('%H:%M:%S %Z') + ' on ' + d.strftime('%A, %B %d, %Y') + '.')"
)


def _extract_shell_query(text: str) -> str:
    """If the message is a self-contained math/date/time query, return the safe
    server-generated command; else ''."""
    if not text:
        return ""
    if _TIME_PAT.search(text):
        return f'python3 -c "{_TIME_CODE}"'
    if _DATE_PAT.search(text):
        return f'python3 -c "{_DATE_CODE}"'
    expr = _extract_math_expression(text)
    if expr:
        return _build_math_command(expr)
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
    Credits are untouched (they are the discount currency)."""
    settings = dict(user.settings or {})
    bal = float(settings.get("token_balance", 0) or 0)
    settings["token_balance"] = max(0.0, bal - cost)
    user.settings = settings
    db.commit()


async def _conversational_fallback(user, text: str, db: Session = None) -> str:
    """When an action executed silently, give a genuine answer to the user's
    question instead of a canned 'Task completed.' (operator 08-26)."""
    from .llm import call_llm
    try:
        raw = await call_llm(
            system_prompt=(
                f"You are '{agent_display_name(user)}', the user's personal agent. "
                f"Today's real date (server-computed, never guess another): "
                f"Today is {datetime.now().strftime('%A, %B %-d, %Y')}. "
                "The user sent a message and no specific tool action applied. "
                "Answer helpfully and briefly: acknowledge what you can (or can't "
                "yet) do, and ask a clarifying question if needed. Keep it under "
                "90 words; plain text only."
            ),
            user_prompt=(text or "")[:2000],
            temperature=0.4,
            max_tokens=300,
            effort_score=20,
            db=db, user_id=user.public_id,
        )
        return (raw or "").strip()[:1000]
    except Exception:
        return ""


def _safe_json_extract(text: str) -> Optional[Dict[str, Any]]:
    """Tolerant JSON parse: strips markdown fences, finds the first balanced object."""
    t = (text or "").strip()
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


def _regex_fallback_intent(text: str) -> Dict[str, Any]:
    """Old keyword dispatch — only used when the LLM JSON contract fails."""
    shell_cmd = _extract_shell_query(text)
    if shell_cmd:
        return {"action": "run_shell", "payload": {"command": shell_cmd}, "reply": "Computing…"}
    lower = text.lower()
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
        return {"action": "generate_flashcards", "payload": {"title": "Flashcards", "cards": []}, "reply": "Generating flashcards…"}
    if "due date" in lower or "change the due" in lower or "edit" in lower and "assignment" in lower:
        return {"action": "edit_assignment", "payload": {"updates": {}}, "reply": "Editing the assignment…"}
    # Catch-all: unmatched text is a QUESTION, not a work order. Answer it
    # conversationally — never phantom-run draft_section and claim "Done."
    # (08-27: LLM intent failure dropped every unknown message onto an
    # invisible draft_section execution; users saw "✅ Done." for questions).
    return {"action": "plain_answer", "payload": {}, "reply": ""}


async def _resolve_agent_intent(user: User, settings: Dict[str, Any], text: str, is_admin: bool, db: Session = None, target_key=None) -> Dict[str, Any]:
    """LLM decides which action the agent should take — strict JSON contract.

    The model sees the user's identity + personality + instructions, their
    permanent memory, the files loaded into the agent, and the exact tool
    catalogue. It must reply with {"action", "payload", "reply"}. Any failure
    falls back to the keyword dispatcher so chat never breaks.
    """
    from .llm import call_llm

    ai = settings.get("ai", {}) or {}
    agent_name = agent_display_name(user)
    personality = ai.get("personality") or "Professional"
    instructions = (ai.get("instructions") or "").strip()

    from .agent_files import agent_files_summary
    from .agent_memory import memory_summary

    memory_block = memory_summary(user.public_id) or "(empty — nothing remembered yet)"
    files_block = agent_files_summary(user.id) or "(none loaded)"

    # Deterministic quick-path (operator 08-26): self-contained math/date/time
    # questions MUST be computed for real — never left to model memory or a
    # clarifying question. The safe command is server-built, not user text.
    shell_cmd = _extract_shell_query(text)
    if shell_cmd:
        return {"action": "run_shell", "payload": {"command": shell_cmd}, "reply": "Computing…"}

    actions = dict(_AGENT_ACTIONS)
    if is_admin:
        actions.update({
            "admin_lookup_user": {"query": "public_id or name substring"},
            "admin_adjust_credits": {"public_id": "str", "delta": "float"},
            "admin_system_status": {},
        })

    action_spec = "\n".join(f"- {name}: {json.dumps(spec)}" for name, spec in sorted(actions.items()))

    today_label = datetime.now().strftime("%A, %B %-d, %Y")
    from .security import educational_guards_on
    _edu_block = (
        "EDUCATIONAL MODE (operator 08-26): this is a study workspace. When a user asks you to "
        "echo, repeat, remember, or roleplay slurs, sexualized insults, harassment, or otherwise "
        "abusive content — decline simply and neutrally (\"that isn't part of studying — let me "
        "help with your assignment instead\") and redirect to the study task. Never repeat the "
        "phrase yourself, even inside quotes or as a \"joke\". The 'remember' action stores real "
        "personal facts only (dates, preferences, constraints) — never store this kind of phrase. "
        "You are still free to discuss sensitive academic topics seriously.\n"
        if educational_guards_on(user) else ""
    )
    system_prompt = (
        _edu_block +
        f"You are '{agent_name}', the user's single personal agent. You do EVERYTHING — "
        f"you change their settings, edit assignments, generate materials, humanize text, "
        f"run scripts, manage your own memory and files, and answer questions directly. "
        f"Personality: {personality}. User instructions: {instructions or '(none)'}\n\n"
        f"TODAY'S REAL DATE (computed server-side, NEVER guess another one): "
        f"Today is {today_label} ({datetime.now().strftime('%Y-%m-%d')}). "
        f"If the user asks the date/time or whether it's a weekday, answer with THIS date exactly.\n\n"
        f"PERMANENT MEMORY (always true, respect it):\n{memory_block}\n\n"
        f"FILES LOADED INTO YOU:\n{files_block}\n\n"
        f'EDUCATIONAL MODE (operator 08-26): this is a study workspace. When a user asks you to '
        f'echo, repeat, remember, or roleplay slurs, sexualized insults, harassment, or otherwise '
        f'abusive content — decline simply and neutrally ("that isn\'t part of studying — let me '
        f'help with your assignment instead") and redirect to the study task. Never repeat the '
        f'phrase yourself, even inside quotes or as a "joke". The "remember" action stores real '
        f'personal facts only (dates, preferences, constraints) — never store this kind of phrase. '
        f'You are still free to discuss sensitive academic topics seriously.\n\n'
        f"AVAILABLE ACTIONS (choose exactly one):\n{action_spec}\n\n"
        f'For ANY math/calculation/date/time or "check/prove/compute" question, always use '
        f'"action": "run_shell" — you pick a tiny SAFE python3 one-liner (or the date one-liner) '
        f'for the payload; NEVER answer such a question from memory. '
        f'Never ask a clarifying question for a self-contained computation — compute it.\n\n'
        f'NEVER REFUSE OR DOWNGRADE A REQUEST (operator 08-26): if the user asks for any kind of '
        f'content — an essay, an outline, research, a summary, analysis, ideas, full assignment work — '
        f'YOU PRODUCE IT, completely, right now. No "I can\'t generate...", no "I can provide a brief '
        f'overview", no "what specific aspects would you like", no deferring. If the request is '
        f'under-specified, pick reasonable defaults and deliver the complete finished thing.\n\n'
        f"Reply STRICTLY as a single JSON object, no markdown, no extra text: "
        f'{{"action": "<action name>", "payload": {{...}}, "reply": "<your answer>"}}. '
        f'If the user is just talking or asking a question, use "action": "plain_answer" and put the COMPLETE answer in "reply" (it may be long — essays/guides can run several thousand words).'
    )
    # Conversation memory (operator 08-26): the LLM previously saw ONLY the
    # current message — every reply started with zero context, which is why
    # the agent "forgot the last message". Include recent prior turns.
    conv_parts = []
    for m in overlord_agent.get_chat_history(target_key, user=user)[:-1]:
        sender = "User" if m.get("sender") == "user" else agent_name
        body = str(m.get("text") or "").strip()
        if body:
            conv_parts.append(f"{sender}: {body[:800]}")
        if len(conv_parts) >= 10:
            break
    history_block = ("\n".join(reversed(conv_parts)) or "")
    user_prompt = (
        (f"CONVERSATION SO FAR (most recent last):\n{history_block}\n\n" if history_block else "")
        + f"User said: {text[:3000]}"
    )

    effort = settings.get("effort_score")
    try:
        effort = int(effort) if isinstance(effort, (int, float)) else 500
    except (TypeError, ValueError):
        effort = 500

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
        )
    except Exception:
        raw = ""

    parsed = _safe_json_extract(raw) if raw else None
    if parsed and isinstance(parsed.get("action"), str) and parsed["action"] in actions:
        return {
            "action": parsed["action"],
            "payload": parsed.get("payload") if isinstance(parsed.get("payload"), dict) else {},
            "reply": str(parsed.get("reply") or f"Done — {parsed['action'].replace('_', ' ')}."),
        }
    if parsed and parsed.get("action") == "plain_answer":
        lower = text.lower()
        if "submit" in lower or "delete" in lower or "humanize" in lower or "rubric" in lower:
            return _regex_fallback_intent(text)
        return {"action": "plain_answer", "payload": {}, "reply": str(parsed.get("reply") or text)}
    # LLM failed or chose an unknown action — fall back to keyword dispatch
    return _regex_fallback_intent(text)


@router.post("/agent/chat")
async def send_chat_message(payload: ChatMessageRequest, request: Request, db: Session = Depends(get_db)):
    """One agent, any request: the LLM picks the action, the pipeline executes it."""
    user = _get_current_user(request, db)
    settings = dict(user.settings or {})
    from .security import is_admin_user
    is_admin = bool(getattr(user, "is_admin", False)) or is_admin_user(user)
    # Chat threads (operator 08-26): thread_id selects a conversation; none =
    # the legacy single conversation (key 0).
    thread_key = payload.thread_id if payload.thread_id is not None else payload.assignment_id
    # Restore conversation context from the durable store (operator 08-26).
    try:
        from .overlord_agent import load_chat_history_from_db
        load_chat_history_from_db(db, user.id, thread_key)
    except Exception:
        pass

    # Token gate (operator 08-26): nothing runs until the operator grants tokens.
    # Credits remain for discounts; token_balance is the usage budget.
    if not is_admin and user.plan != "elite":
        token_bal = float((user.settings or {}).get("token_balance", 0) or 0)
        if token_bal <= 0:
            agent_reply = overlord_agent.add_chat_message(
                thread_key,
                sender="overlord",
                text="⚠️ Insufficient tokens — the operator hasn't granted you any tokens yet. "
                     "Ask them to grant you tokens (or upgrade your account) to use My Agent.",
                suggested_actions=[], user_id=user.id)
            return {"status": "insufficient_tokens", "message": agent_reply, "reply": agent_reply}

    # Record user message
    user_msg = overlord_agent.add_chat_message(thread_key, sender="user", text=payload.text, user_id=user.id)
    try:
        from .overlord_agent import persist_chat_message
        persist_chat_message(db, user.id, thread_key, "user", payload.text)
    except Exception:
        pass
    # Auto-title a new thread from its first user message (operator 08-26).
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
    except Exception:
        pass

    # 0b. Claude Code bridge: when enabled, this message goes to Claude Code,
    # which answers (and can act) as the My Agent. Fallback to the local
    # pipeline if the bridge is unavailable. Requests that already come FROM
    # the bridge (X-Helpotron-MCP marker, set by mcp/server.js) are exempt —
    # otherwise claude -p -> MCP admin_chat -> bridge would recurse.
    if _claude_bridge_allowed(is_admin) and not request.headers.get("X-Helpotron-MCP"):
        # Run in a thread: subprocess.run blocks the event loop, and the
        # spawned claude's MCP server calls back into THIS server — a blocking
        # call would deadlock the event loop until the 120s timeout.
        reply = await asyncio.to_thread(_claude_bridge_call, user.public_id, payload.text)
        if reply:
            agent_reply = overlord_agent.add_chat_message(
                thread_key,
                sender="overlord",
                text=reply, user_id=user.id)
            try:
                from .overlord_agent import persist_chat_message
                persist_chat_message(db, user.id, thread_key, "overlord", reply)
            except Exception:
                pass
            await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))
            return {
                "status": "success",
                "message": agent_reply,
                "execution": {"action": "claude_bridge", "status": "completed", "bridge": True},
                "reply": reply,
            }

    # 1. LLM decides the intent (strict JSON contract, regex fallback)
    intent = await _resolve_agent_intent(user, settings, payload.text, is_admin, db=db, target_key=thread_key)

    # 2. Plain conversational answer — no action needed (still costs tokens: every
    #    LLM reply is paid from the usage budget — operator 08-26).
    if intent["action"] == "plain_answer":
        if not is_admin and user.plan != "elite":
            _charge_tokens(user, db, 1.0)
        reply_text = intent["reply"]
        if _is_degenerate_reply(reply_text):
            reply_text = await _conversational_fallback(user, payload.text, db=db)
        if _is_degenerate_reply(reply_text):
            reply_text = ("I didn't catch that — mind rephrasing? "
                          "(Reply generation came back empty.)")
        agent_reply = overlord_agent.add_chat_message(
            thread_key,
            sender="overlord",
            text=reply_text, user_id=user.id)
        await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))
        return {"status": "success", "message": agent_reply, "execution": None, "reply": reply_text}

    # 2.5 CREDIT GATE (operator 08-26): actions that do work must be affordable
    # BEFORE execution. Elite accounts are exempt (same rule charge_with_rollback
    # uses); the permission flow above/below is untouched and separate.
    cost = _AGENT_ACTION_COSTS.get(intent["action"], 0)  # 0 = no work / no cost
    privileged = bool(getattr(user, "plan", "") == "elite" or is_admin)
    tok_bal = float((user.settings or {}).get("token_balance", 0) or 0)
    if cost > 0 and not privileged and tok_bal < cost:
        return _insufficient_tokens_response(thread_key, user, cost)

    # 3. Permission gate (manual mode asks; auto approves routine; yolo never asks)
    is_approved, reason = permission_engine.evaluate_action_permission(
        user_settings=settings,
        action_type=intent["action"],
        session_mode_override=payload.session_mode_override,
    )

    # run_shell is a read-only, sandboxed compute query — it never asks for
    # permission (like plain_answer); it still pays the credit gate above.
    if not is_approved and intent["action"] != "run_shell":
        perm = overlord_agent.create_pending_permission(
            user_public_id=user.public_id,
            action_type=intent["action"],
            title=f"Permission Required: {intent['action'].replace('_', ' ').title()}",
            description=f"Action '{intent['action']}' requires confirmation in {settings.get('operation_mode', 'auto').upper()} mode.",
            payload={"text": payload.text, **intent["payload"]},
            assignment_id=thread_key,
        )
        agent_reply = overlord_agent.add_chat_message(
            thread_key,
            sender="overlord",
            text=f"⚠️ Action '{intent['action'].replace('_', ' ')}' requires your permission before execution.",
            suggested_actions=["Approve", "Write Something Else", "Always Approve This Action"], user_id=user.id)
        return {
            "status": "permission_required",
            "permission_request": perm,
            "message": agent_reply,
        }

    # 4. Execute the chosen action
    exec_res = await overlord_agent.execute_task_action(
        db,
        user=user,
        action_type=intent["action"],
        payload=intent["payload"],
        assignment_id=thread_key,
    )
    if not is_admin and user.plan != "elite":
        _charge_tokens(user, db, _action_cost(intent["action"]))
    _LLM_EMPTY_HONEST = ("Hmm — I ran into an issue answering that one."
                         " Try again in a moment?")
    if exec_res.get("status") == "failed":
        reply_text = f"⚠️ {exec_res.get('message', 'Could not do that.')}"
    else:
        result_msg = exec_res.get("message") or exec_res.get("result_text")
        if _is_degenerate_reply(result_msg):
            # Execution completed silently (misclassified intent / empty result):
            # answer the user's message conversationally instead of a bare ✅.
            result_msg = await _conversational_fallback(user, payload.text)
        if intent["action"] == "humanize_text" and exec_res.get("result_text"):
            reply_text = exec_res["result_text"]
            if _is_degenerate_reply(reply_text):
                reply_text = _LLM_EMPTY_HONEST
        elif _is_degenerate_reply(result_msg):
            # No real answer anywhere — say so honestly rather than faking
            # a completion ("Done." on a question is a phantom pass).
            reply_text = _LLM_EMPTY_HONEST
        else:
            reply_text = f"✅ {result_msg}"
    agent_reply = overlord_agent.add_chat_message(
        thread_key,
        sender="overlord",
        text=reply_text,
        suggested_actions=[],
        subagent_logs=[],
        metadata={"intent_action": intent["action"]}, user_id=user.id)

    # 5. Auto-compaction: keep the thread lean (>40 msgs or >12k chars → summarize)
    await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))

    return {"status": "success", "message": agent_reply, "execution": exec_res, "reply": reply_text}


@router.post("/agent/task")
async def dispatch_task(payload: TaskRequest, request: Request, db: Session = Depends(get_db)):
    """Dispatches a direct task to the sub-agent pipeline with mode-based permission checks."""
    user = _get_current_user(request, db)

    is_approved, reason = permission_engine.evaluate_action_permission(
        user_settings=user.settings or {},
        action_type=payload.action_type,
        session_mode_override=payload.session_mode_override,
    )

    if not is_approved:
        perm = overlord_agent.create_pending_permission(
            user_public_id=user.public_id,
            action_type=payload.action_type,
            title=payload.title,
            description=payload.description or f"Permission required for '{payload.action_type}'",
            payload=payload.payload,
            assignment_id=thread_key,
        )
        return {
            "status": "permission_required",
            "permission_request": perm,
            "message": f"Action '{payload.action_type}' paused awaiting user confirmation.",
        }

    exec_res = await overlord_agent.execute_task_action(
        db,
        user=user,
        action_type=payload.action_type,
        payload=payload.payload,
        assignment_id=thread_key,
    )
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
    """Executes a sub-agent script inside an isolated virtual sandbox with resource limits."""
    user = _get_current_user(request, db)
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
    _get_current_user(request, db)
    from .engine.sandbox import sandbox_manager
    return {"sandboxes": sandbox_manager.list_active()}


@router.post("/agent/sandbox/cleanup")
def cleanup_sandbox_endpoint(payload: Dict[str, str], request: Request, db: Session = Depends(get_db)):
    """Manually cleans up a virtual sandbox."""
    _get_current_user(request, db)
    sandbox_id = payload.get("sandbox_id", "")
    from .engine.sandbox import sandbox_manager
    success = sandbox_manager.cleanup_sandbox(sandbox_id)
    return {"status": "success" if success else "not_found", "sandbox_id": sandbox_id}

