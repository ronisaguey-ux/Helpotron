"""FastAPI routes for Overlord Main Agent, Assignment Cards, 3 Operation Modes, and Permission System."""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .agent_files import delete_agent_file, list_agent_files, save_agent_file
from .agent_memory import append_memory, delete_memory, load_memory, replace_memory
from .database import Assignment, User, get_db
from .overlord_agent import overlord_agent, permission_engine

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
        return str(out["result"]).strip() or None
    except Exception:
        return None


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


@router.get("/assignment/{assignment_id}/full-view")
async def get_assignment_full_view(assignment_id: int, request: Request, db: Session = Depends(get_db)):
    """Returns comprehensive full-page assignment details: prompt, rubric, attachments, subagent progress."""
    user = _get_current_user(request, db)
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id, Assignment.user_id == user.id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    progress = assignment.progress or {}
    chat_history = overlord_agent.get_chat_history(assignment_id)

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
        },
        "chat_history": chat_history,
    }


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
                text=replacement,
            )
            overlord_agent.add_chat_message(
                assignment_id,
                sender="overlord",
                text=f"Understood. Pending action '{perm_entry['action_type']}' cancelled. Processing your new instruction: {replacement}",
            )
        return {"status": "cancelled", "decision": "write_something_else", "message": replacement}

    if decision == "reject":
        perm_entry["status"] = "rejected"
        reject_note = payload.comment or "Declined by user."
        if assignment_id:
            overlord_agent.add_chat_message(
                assignment_id,
                sender="overlord",
                text=f"❌ Action '{perm_entry['action_type']}' rejected by user. Note: {reject_note}",
            )
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
            text=f"Approval Note: {payload.comment}",
        )
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


@router.get("/agent/files")
async def get_agent_files(request: Request, db: Session = Depends(get_db)):
    """Files loaded into the user's personal agent (skill/rule/automation/personality)."""
    user = _get_current_user(request, db)
    return {"status": "success", "files": list_agent_files(user.id)}


@router.post("/agent/files/upload")
async def upload_agent_file(
    file: UploadFile = File(...),
    kind: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload a skill / rule / automation / personality file into the agent.

    Follows the existing dump-upload convention: a user may identify via the
    multipart field when no Bearer token is present (demo/extension flows).
    """
    uid = user_id or "RoniDev"
    user = db.query(User).filter(User.public_id == uid).first()
    if not user:
        user = User(public_id=uid, plan="basic", credits=50.0)
        db.add(user)
        db.commit()
        db.refresh(user)
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    try:
        saved = await save_agent_file(user, file.filename or "upload.bin", kind or "skill", content, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "success", "file": saved, "files": list_agent_files(user.id)}


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
    file: UploadFile = File(...),
    kind: Optional[str] = Form(None),
    subject: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
):
    """Avatar upload for the user, the agent, or a subject (PNG/JPG only)."""
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar too large (max 5 MB).")
    content_type = (file.content_type or "").lower()
    ext = "png" if content_type == "image/png" else "jpg" if content_type in ("image/jpeg", "image/jpg") else None
    if ext is None:
        raise HTTPException(status_code=400, detail="Only PNG or JPG images are accepted.")
    _AVATAR_DIR = Path("./uploads/avatars")
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
    """Fetches chat conversation history with Overlord / Sub-Agent team for an assignment."""
    return {"status": "success", "chat": overlord_agent.get_chat_history(assignment_id)}


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
    "remember": {"text": "str fact/preference to store permanently"},
    "forget_memory": {"entry_id": "str or text snippet to forget"},
}


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
    return {"action": "draft_section", "payload": {"section_name": "Synthesis"}, "reply": "On it."}


async def _resolve_agent_intent(user: User, settings: Dict[str, Any], text: str, is_admin: bool) -> Dict[str, Any]:
    """LLM decides which action the agent should take — strict JSON contract.

    The model sees the user's identity + personality + instructions, their
    permanent memory, the files loaded into the agent, and the exact tool
    catalogue. It must reply with {"action", "payload", "reply"}. Any failure
    falls back to the keyword dispatcher so chat never breaks.
    """
    from .llm import call_llm

    ai = settings.get("ai", {}) or {}
    agent_name = ai.get("aiName") or "Atlas"
    personality = ai.get("personality") or "Professional"
    instructions = (ai.get("instructions") or "").strip()

    from .agent_files import agent_files_summary
    from .agent_memory import memory_summary

    memory_block = memory_summary(user.public_id) or "(empty — nothing remembered yet)"
    files_block = agent_files_summary(user.id) or "(none loaded)"

    actions = dict(_AGENT_ACTIONS)
    if is_admin:
        actions.update({
            "admin_lookup_user": {"query": "public_id or name substring"},
            "admin_adjust_credits": {"public_id": "str", "delta": "float"},
            "admin_system_status": {},
        })

    action_spec = "\n".join(f"- {name}: {json.dumps(spec)}" for name, spec in sorted(actions.items()))

    system_prompt = (
        f"You are '{agent_name}', the user's single personal agent. You do EVERYTHING — "
        f"you change their settings, edit assignments, generate materials, humanize text, "
        f"run scripts, manage your own memory and files, and answer questions directly. "
        f"Personality: {personality}. User instructions: {instructions or '(none)'}\n\n"
        f"PERMANENT MEMORY (always true, respect it):\n{memory_block}\n\n"
        f"FILES LOADED INTO YOU:\n{files_block}\n\n"
        f"AVAILABLE ACTIONS (choose exactly one):\n{action_spec}\n\n"
        f"Reply STRICTLY as a single JSON object, no markdown, no extra text: "
        f'{{"action": "<action name>", "payload": {{...}}, "reply": "<one short user-facing sentence>"}}. '
        f'If the user is just talking or asking a question, use "action": "plain_answer" and put your full answer in "reply".'
    )
    user_prompt = f"User said: {text[:4000]}"

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
            max_tokens=900,
            response_format="json_object",
            effort_score=effort,
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
    is_admin = bool(getattr(user, "is_admin", False)) or user.public_id in ("RoniDev", "admin")

    # Record user message
    user_msg = overlord_agent.add_chat_message(payload.assignment_id, sender="user", text=payload.text)

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
                payload.assignment_id,
                sender="overlord",
                text=reply,
            )
            await overlord_agent.compact_chat_history(user=user, target_key=str(payload.assignment_id))
            return {
                "status": "success",
                "message": agent_reply,
                "execution": {"action": "claude_bridge", "status": "completed", "bridge": True},
                "reply": reply,
            }

    # 1. LLM decides the intent (strict JSON contract, regex fallback)
    intent = await _resolve_agent_intent(user, settings, payload.text, is_admin)

    # 2. Plain conversational answer — no action needed
    if intent["action"] == "plain_answer":
        agent_reply = overlord_agent.add_chat_message(
            payload.assignment_id,
            sender="overlord",
            text=intent["reply"],
        )
        await overlord_agent.compact_chat_history(user=user, target_key=str(payload.assignment_id))
        return {"status": "success", "message": agent_reply, "execution": None, "reply": intent["reply"]}

    # 3. Permission gate (manual mode asks; auto approves routine; yolo never asks)
    is_approved, reason = permission_engine.evaluate_action_permission(
        user_settings=settings,
        action_type=intent["action"],
        session_mode_override=payload.session_mode_override,
    )

    if not is_approved:
        perm = overlord_agent.create_pending_permission(
            user_public_id=user.public_id,
            action_type=intent["action"],
            title=f"Permission Required: {intent['action'].replace('_', ' ').title()}",
            description=f"Action '{intent['action']}' requires confirmation in {settings.get('operation_mode', 'auto').upper()} mode.",
            payload={"text": payload.text, **intent["payload"]},
            assignment_id=payload.assignment_id,
        )
        agent_reply = overlord_agent.add_chat_message(
            payload.assignment_id,
            sender="overlord",
            text=f"⚠️ Action '{intent['action'].replace('_', ' ')}' requires your permission before execution.",
            suggested_actions=["Approve", "Write Something Else", "Always Approve This Action"],
        )
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
        assignment_id=payload.assignment_id,
    )
    if exec_res.get("status") == "failed":
        reply_text = f"⚠️ {exec_res.get('message', 'Could not do that.')}"
    else:
        result_msg = exec_res.get("message") or exec_res.get("result_text") or "Task completed."
        if intent["action"] == "humanize_text" and exec_res.get("result_text"):
            reply_text = exec_res["result_text"]
        else:
            reply_text = f"✅ {result_msg}"
    agent_reply = overlord_agent.add_chat_message(
        payload.assignment_id,
        sender="overlord",
        text=reply_text,
        suggested_actions=[],
        subagent_logs=[],
        metadata={"intent_action": intent["action"]},
    )

    # 5. Auto-compaction: keep the thread lean (>40 msgs or >12k chars → summarize)
    await overlord_agent.compact_chat_history(user=user, target_key=str(payload.assignment_id))

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
            assignment_id=payload.assignment_id,
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
        assignment_id=payload.assignment_id,
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
    from .engine.sandbox import sandbox_manager
    return {"sandboxes": sandbox_manager.list_active()}


@router.post("/agent/sandbox/cleanup")
def cleanup_sandbox_endpoint(payload: Dict[str, str], request: Request, db: Session = Depends(get_db)):
    """Manually cleans up a virtual sandbox."""
    sandbox_id = payload.get("sandbox_id", "")
    from .engine.sandbox import sandbox_manager
    success = sandbox_manager.cleanup_sandbox(sandbox_id)
    return {"status": "success" if success else "not_found", "sandbox_id": sandbox_id}

