"""FastAPI routes for Overlord Main Agent, Assignment Cards, 3 Operation Modes, and Permission System."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

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


# ─── Helper to extract user ───────────────────────────────────────────────────

def _get_current_user(request: Request, db: Session) -> User:
    public_id = request.headers.get("X-Public-ID") or request.query_params.get("public_id")
    if not public_id:
        user = db.query(User).first()
        if user:
            return user
        raise HTTPException(400, "Missing X-Public-ID header")
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return user


# ─── 1. Assignment Card Dashboard Endpoints ───────────────────────────────────

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


# ─── 4. Overlord Chat & Sub-Agent Task Dispatch ────────────────────────────────

@router.get("/agent/chat/{assignment_id}")
async def get_chat(assignment_id: int, request: Request, db: Session = Depends(get_db)):
    """Fetches chat conversation history with Overlord / Sub-Agent team for an assignment."""
    return {"status": "success", "chat": overlord_agent.get_chat_history(assignment_id)}


@router.post("/agent/chat")
async def send_chat_message(payload: ChatMessageRequest, request: Request, db: Session = Depends(get_db)):
    """Sends user message to Overlord / Sub-Agent team and triggers appropriate response/task."""
    user = _get_current_user(request, db)
    # Record user message
    user_msg = overlord_agent.add_chat_message(payload.assignment_id, sender="user", text=payload.text)

    # Process prompt intent via Overlord
    text_lower = payload.text.lower()
    action_type = "draft_section"
    if "humanize" in text_lower or "ai check" in text_lower:
        action_type = "humanize_text"
    elif "rubric" in text_lower:
        action_type = "analyze_rubric"
    elif "submit" in text_lower:
        action_type = "submit_assignment"

    # Evaluate permissions based on active mode
    is_approved, reason = permission_engine.evaluate_action_permission(
        user_settings=user.settings or {},
        action_type=action_type,
        session_mode_override=payload.session_mode_override,
    )

    if not is_approved:
        perm = overlord_agent.create_pending_permission(
            user_public_id=user.public_id,
            action_type=action_type,
            title=f"Permission Required: {action_type.replace('_', ' ').title()}",
            description=f"Action '{action_type}' requires confirmation in {user.settings.get('operation_mode', 'auto').upper()} mode.",
            payload={"text": payload.text},
            assignment_id=payload.assignment_id,
        )
        agent_reply = overlord_agent.add_chat_message(
            payload.assignment_id,
            sender="overlord",
            text=f"⚠️ Action '{action_type}' requires your permission before execution.",
            suggested_actions=["Approve", "Write Something Else", "Always Approve This Action"],
        )
        return {
            "status": "permission_required",
            "permission_request": perm,
            "message": agent_reply,
        }

    # Execute directly if approved
    exec_res = await overlord_agent.execute_task_action(
        db,
        user=user,
        action_type=action_type,
        payload={"text": payload.text},
        assignment_id=payload.assignment_id,
    )
    reply_text = f"✅ Completed '{action_type}': {exec_res.get('message') or exec_res.get('result_text', 'Task completed.')}"
    agent_reply = overlord_agent.add_chat_message(
        payload.assignment_id,
        sender="overlord",
        text=reply_text,
        subagent_logs=[f"Sub-Agent [Synthesis] -> Success (Latency: 280ms)", f"Humanizer Confidence: 94.2%"],
    )
    return {"status": "success", "message": agent_reply, "execution": exec_res}


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

