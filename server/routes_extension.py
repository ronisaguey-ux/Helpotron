"""API routes for Chrome Extension version tracking, update alerts, zip packaging,
and the extension mini-chatbox (operator task 08-28)."""
from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .config import BASE_DIR
from .database import get_db

router = APIRouter(prefix="/api/extension", tags=["extension"])

EXTENSION_DIR = BASE_DIR / "extension" if (BASE_DIR / "extension").exists() else BASE_DIR.parent / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"


def get_current_manifest() -> Dict[str, Any]:
    if MANIFEST_PATH.exists():
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"version": "2.0.0", "name": "Helpotron Universal Automator"}


class VersionCheckRequest(BaseModel):
    current_version: Optional[str] = Field(None, description="Current version installed in the browser")
    client_id: Optional[str] = None


@router.get("/version")
async def get_extension_version():
    """Returns the latest available extension version, changelog, and download metadata."""
    manifest = get_current_manifest()
    latest_version = manifest.get("version", "2.0.0")

    return {
        "status": "success",
        "latest_version": latest_version,
        "minimum_supported_version": "1.0.0",
        "release_date": "2026-08-18",
        "is_critical_update": False,
        "release_notes": [
            "✨ Added Deterministic Python Math Evaluation (exact calculations with zero hallucination).",
            "🛡️ Enhanced Kimhons 38-Pattern and Jalaalrd Anti-AI-Slop evasion heuristics.",
            "🎙️ Optimized lecture audio recording with chunked streaming upload.",
            "⚡ Added real-time version update alerts and 1-click zip bundle download.",
            "🔒 Hardened session token security and eliminated insecure headers.",
        ],
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
                # Exclude temporary, cache, or git files
                if file.startswith(".") or file.endswith((".pyc", ".tmp", ".log")):
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
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)


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


class ExtensionChatRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5_000)
    thread_id: Optional[int] = Field(None, description="chat thread (None/0 = the main agent conversation)")


async def _extension_current_user(request: Request, db: Session):
    """Authenticated user for extension requests — session cookie, 24h JWT,
    or the long-lived DB-backed session token the extension sends."""
    from .database import User
    from .security import get_current_user

    current = await get_current_user(request)
    return db.query(User).filter(User.id == current.id).first() or current


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
    )
    from .security import is_admin_user

    is_admin = bool(getattr(user, "is_admin", False)) or is_admin_user(user)
    llm_empty_honest = ("Hmm — I ran into an issue answering that one."
                        " Try again in a moment?")
    thread_key = payload.thread_id if payload.thread_id is not None else 0

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
                text="⚠️ Insufficient tokens — the operator hasn't granted you any tokens yet. "
                     "Ask them to grant you tokens (or upgrade your account) to use My Agent.",
                suggested_actions=[])
            return {"status": "insufficient_tokens", "message": agent_reply, "reply": agent_reply,
                    "token_balance": _tk_balance(user)}

    # Record the user message.
    overlord_agent.add_chat_message(thread_key, sender="user", text=payload.text, user_id=user.id)
    try:
        persist_chat_message(db, user.id, thread_key, "user", payload.text)
    except Exception:
        pass

    # The agent's intent decision on the extensions surface.
    intent = await _resolve_agent_intent(
        user, settings, payload.text, is_admin, db=db,
        target_key=thread_key, node="extensions",
    )

    # Plain conversational answer (still costs 1 token like the web chat).
    if intent["action"] == "plain_answer":
        if not is_admin and user.plan != "elite":
            _charge_tokens(user, db, 1.0)
        reply_text = intent["reply"]
        if _is_degenerate_reply(reply_text):
            reply_text = await _conversational_fallback(user, payload.text, db=db, node="extensions")
        if _is_degenerate_reply(reply_text):
            reply_text = "I didn't catch that — mind rephrasing? (Reply generation came back empty.)"
        agent_reply = _chat_reply(db, user, thread_key, text=reply_text)
        await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))
        return {"status": "success", "message": agent_reply, "execution": None, "reply": reply_text,
                "token_balance": _tk_balance(user)}

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
        perm = overlord_agent.create_pending_permission(
            user_public_id=user.public_id,
            action_type=intent["action"],
            title=f"Permission Required: {intent['action'].replace('_', ' ').title()}",
            description=f"Action '{intent['action']}' requires confirmation in "
                        f"{settings.get('operation_mode', 'auto').upper()} mode.",
            payload={"text": payload.text, **intent["payload"]},
            assignment_id=thread_key,
        )
        agent_reply = _chat_reply(
            db, user, thread_key,
            text=f"⚠️ Action '{intent['action'].replace('_', ' ')}' requires your permission before execution.",
            suggested_actions=["Approve", "Write Something Else", "Always Approve This Action"])
        return {
            "status": "permission_required",
            "permission_request": perm,
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
        reply_text = f"⚠️ {exec_res.get('message', 'Could not do that.')}"
    else:
        result_msg = exec_res.get("message") or exec_res.get("result_text")
        if _is_degenerate_reply(result_msg):
            result_msg = await _conversational_fallback(user, payload.text, node="extensions")
        if intent["action"] == "humanize_text" and exec_res.get("result_text"):
            reply_text = exec_res["result_text"]
            if _is_degenerate_reply(reply_text):
                reply_text = llm_empty_honest
        elif _is_degenerate_reply(result_msg):
            reply_text = llm_empty_honest
        else:
            reply_text = f"✅ {result_msg}"
    agent_reply = _chat_reply(
        db, user, thread_key,
        text=reply_text,
        suggested_actions=[],
        subagent_logs=[],
        metadata={"intent_action": intent["action"], "surface": "extensions"})

    await overlord_agent.compact_chat_history(user=user, target_key=str(thread_key))
    return {"status": "success", "message": agent_reply, "execution": exec_res, "reply": reply_text,
            "token_balance": _tk_balance(user)}


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
