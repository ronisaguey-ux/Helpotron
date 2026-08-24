"""Browser agent sessions — the extension's "Activate" feature.

When the user hits Activate, a session starts here and runs for up to
30 minutes: an LLM agent (DeepSeek V4 Flash via OmniRoute) plans steps and
issues tool calls (navigate / click / type / read_page / scroll / finish)
that the extension executes in the user's own Canvas tab over a WebSocket
bridge. Collected page content lands in the Transcript table (source
"agent") so the study generators can consume it.

Scope guard: the agent only reads the user's own Canvas account. It never
submits anything.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid

from fastapi import WebSocket

try:
    from . import llm
except (ImportError, ValueError):
    from server import llm


logger = logging.getLogger("helpotron.agent")

MAX_SESSION_SECONDS = 60 * 60  # spec: "30 minutes to an hour"
MAX_STEPS = 120                # slow, deliberate scraping pace
MAX_PAGE_CHARS = 30000
COMMAND_TIMEOUT = 40  # seconds to wait for the extension to execute one command
ATTACH_TIMEOUT = 60   # seconds to wait for the extension to connect after start

AGENT_SYSTEM = (
    "You are the Helpotron Universal Collection Subagent working inside the user's selected browser tab. "
    "Your mission: slowly and methodically gather everything needed to build structured assignment data and study "
    "materials from ANY educational platform or arbitrary website (Canvas, Google Classroom, Blackboard, Brightspace, Moodle, Schoology, Google Docs, Notion, or custom faculty pages). "
    "Extract the assignment title, due date, full prompt/description, rubric criteria/tables, instructor guidance, and attached files. "
    "Navigate and inspect pages using your tool calls. When the assignment details are complete, call 'finish' with the structured JSON payload. "
    "If the page is heavily obfuscated, DRM-protected, or does not contain readable assignment data, honestly call 'report_unparseable' and suggest submitting feedback to the Data Lake. "
    "Never submit anything, never take destructive actions."
)

TOOL_DOC = """Tools (call EXACTLY one per turn, as JSON):
{"tool": "read_page"} — current page text + links + url + title + detected LMS metadata
{"tool": "inspect_dom", "args": {"selector": "<css selector>"}} — targeted element inspection
{"tool": "extract_rubric", "args": {"selector": "<optional table or container selector>"}} — structured rubric parser
{"tool": "extract_files"} — gathers all downloadable attachment links, PDFs, and Google Drive links
{"tool": "click", "args": {"selector": "<css selector>"}} — click an element (e.g. accordion, rubric tab)
{"tool": "type", "args": {"selector": "<css>", "text": "<value>"}} — fill an input
{"tool": "scroll", "args": {"direction": "down"|"up"}} — methodically scroll to trigger lazy-loaded sections
{"tool": "navigate", "args": {"url": "<full target url>"}} — navigate to related syllabus/assignment links
{"tool": "report_unparseable", "args": {"reason": "<honest explanation of why this page cannot be parsed>"}} — report unparseable page and direct to Data Lake
{"tool": "finish", "args": {"summary": "<summary>", "assignment": {"title": "...", "due_date": "...", "prompt": "...", "rubric": "...", "file_urls": []}}} — end session and ingest data into Helpotron

Strategy:
1. Call 'read_page' first to analyze page contents and detect page type.
2. If sections are collapsed, use 'click' to open rubrics or files.
3. If complete assignment data is extracted, call 'finish'.
4. If page cannot be parsed, honestly call 'report_unparseable'."""


class AgentSession:
    def __init__(self, session_id: str, public_id: str,
                 assignment_id: int | None, instruction: str):
        self.session_id = session_id
        self.public_id = public_id
        self.assignment_id = assignment_id
        self.instruction = instruction or ""
        self.started_at = time.time()
        self.steps = 0
        self.log: list[dict] = []
        self.status = "running"  # running | done | failed | disconnected
        self.result_text = ""
        self.websocket: WebSocket | None = None
        self.command_queue: asyncio.Queue | None = asyncio.Queue()
        self.pending: dict[str, asyncio.Future] = {}
        self.attached = asyncio.Event()  # set when the extension connects

    def elapsed(self) -> float:
        return time.time() - self.started_at

    def snapshot(self) -> dict:
        return {
            "session_id": self.session_id,
            "status": self.status,
            "steps": self.steps,
            "elapsed_seconds": int(self.elapsed()),
            "log": self.log[-15:],
            "result_text": self.result_text[:500] if self.result_text else "",
        }


class AgentManager:
    def __init__(self) -> None:
        self.sessions: dict[str, AgentSession] = {}

    def create(self, public_id: str, assignment_id: int | None, instruction: str) -> AgentSession:
        s = AgentSession(uuid.uuid4().hex[:12], public_id, assignment_id, instruction)
        self.sessions[s.session_id] = s
        return s

    def get(self, session_id: str) -> AgentSession | None:
        return self.sessions.get(session_id)

    async def attach(self, session_id: str, ws: WebSocket) -> None:
        s = self.get(session_id)
        if s is None:
            await ws.close(code=4404)
            return
        if s.websocket is not None and s.websocket is not ws:
            try:
                await s.websocket.close(code=4000, reason="replaced")
            except Exception:
                pass
        s.websocket = ws
        s.attached.set()
        logger.info("agent %s attached", session_id)

    def detach(self, session_id: str) -> None:
        s = self.get(session_id)
        if s is not None:
            s.websocket = None
            if s.status == "running":
                s.status = "disconnected"
                logger.warning("agent %s disconnected", session_id)

    async def handle_result(self, session_id: str, msg: dict) -> None:
        s = self.get(session_id)
        if s is None or msg.get("type") != "result":
            return
        fut = s.pending.pop(str(msg.get("command_id")), None)
        if fut is not None and not fut.done():
            fut.set_result(msg)

    async def run(self, session: AgentSession) -> None:
        """The 30-minute agent loop. Each step: LLM decision -> extension
        command -> page observation. Ends on finish, timeout, or max steps."""
        messages = [
            {"role": "system", "content": AGENT_SYSTEM + "\n\n" + TOOL_DOC},
            {"role": "user", "content": f"Mission start. User instruction: {session.instruction or '(none — collect the current assignment)'}"},
        ]
        try:
            # The extension connects only after /api/agent/start returns — wait
            # for it so we don't misread the handoff gap as a disconnect.
            try:
                await asyncio.wait_for(session.attached.wait(), timeout=ATTACH_TIMEOUT)
            except asyncio.TimeoutError:
                session.status = "disconnected"
                session.log.append({"step": 0, "event": "extension never connected"})
                return
            while session.elapsed() < MAX_SESSION_SECONDS and session.steps < MAX_STEPS:
                if session.websocket is None:
                    session.status = "disconnected"
                    session.log.append({"step": session.steps, "event": "extension disconnected"})
                    return
                try:
                    content = await llm.call_llm(AGENT_SYSTEM + "\n\n" + TOOL_DOC, _agent_prompt(messages))
                except Exception as e:
                    session.log.append({"step": session.steps, "event": f"llm error: {e}"})
                    return
                decision = llm.extract_json(content)
                if not isinstance(decision, dict) or "tool" not in decision:
                    messages.append({"role": "assistant", "content": content})
                    messages.append({"role": "user", "content": "That response was not valid JSON tool call. Reply with exactly one JSON tool call."})
                    continue

                tool = decision["tool"]
                args = decision.get("args") or {}
                if tool == "report_unparseable":
                    session.status = "unparseable"
                    reason = args.get("reason", "This website cannot be automatically parsed due to proprietary layout, DRM, or missing assignment data.")
                    session.result_text = f"⚠️ Unparseable Website: {reason} Please submit this page/syllabus to the Data Lake to earn micro-credits and help train our platform."
                    session.log.append({"step": session.steps, "event": "report_unparseable", "detail": reason[:200]})
                    await _send(session, {
                        "type": "unparseable",
                        "reason": reason,
                        "datalake_prompt": "Submit snippet to Data Lake to earn micro-credits.",
                    })
                    return

                if tool == "finish":
                    session.status = "done"
                    session.result_text = str(args.get("summary", ""))[:4000]
                    assignment_data = args.get("assignment") or {}
                    session.log.append({"step": session.steps, "event": "finish", "detail": session.result_text[:200]})
                    await _send(session, {"type": "finished", "summary": session.result_text, "assignment": assignment_data})
                    return

                step = session.steps + 1
                session.steps = step
                command_id = f"c{step}-{uuid.uuid4().hex[:6]}"
                session.log.append({"step": step, "event": f"tool:{tool}", "detail": json.dumps(args)[:200]})

                fut = asyncio.get_running_loop().create_future()
                session.pending[command_id] = fut
                await _send(session, {"type": "command", "command_id": command_id, "command": {"action": tool, **args}})
                try:
                    result = await asyncio.wait_for(fut, timeout=COMMAND_TIMEOUT)
                except asyncio.TimeoutError:
                    session.pending.pop(command_id, None)
                    messages.append({"role": "assistant", "content": json.dumps({"tool": tool, "args": args})})
                    messages.append({"role": "user", "content": "The extension did not respond in time. If this repeats, finish."})
                    continue

                ok = result.get("ok", False)
                page = result.get("result") or {}
                observation = json.dumps({"ok": ok, "error": result.get("error"), **page})[:MAX_PAGE_CHARS]
                messages.append({"role": "assistant", "content": json.dumps({"tool": tool, "args": args})})
                messages.append({"role": "user", "content": f"Tool result: {observation}"})

            if session.status == "running":
                session.status = "done"
                session.result_text = session.result_text or "(reached step/time limit)"
                session.log.append({"step": session.steps, "event": "limit reached"})
        except Exception as e:
            logger.exception("agent session %s crashed", session.session_id)
            session.status = "failed"
            session.log.append({"step": session.steps, "event": f"session error: {e}"})


def _agent_prompt(messages: list[dict]) -> str:
    """Compact prompt: mission + recent conversation tail (keeps context small)."""
    head = messages[0]["content"] if messages else ""
    tail = messages[-6:]
    return head + "\n\n--- recent ---\n" + "\n".join(
        f"{m['role'].upper()}: {m['content'][:6000]}" for m in tail
    )


async def _send(session: AgentSession, payload: dict) -> None:
    if session.websocket is None:
        raise ConnectionError("extension not connected")
    await session.websocket.send_json(payload)


try:
    from .user_settings_service import set_scoped_setting, resolve_scoped_setting
except (ImportError, ValueError):
    from server.user_settings_service import set_scoped_setting, resolve_scoped_setting


class AgentActionExecutionEngine:
    """Shared action layer: ensures conversational My Agent and the visual UI
    execute identical underlying state mutations."""

    @staticmethod
    async def execute_setting_change(user_id: int, setting_key: str, value, scope_type: str, scope_id: str, db) -> Dict[str, Any]:
        record = set_scoped_setting(user_id, setting_key, value, scope_type, scope_id, db)
        return {
            'action': 'setting_change',
            'status': 'SUCCESS',
            'setting_key': setting_key,
            'new_value': value,
            'scope': f'{scope_type}:{scope_id}',
            'reversible': True,
        }
manager = AgentManager()


async def execute_session_with_preservation(session_id: str, cost: float, db, user, runner_fn):
    """Execute session runner with atomic credit deduction and fail-safe refund rollback."""
    from .credits import safe_deduct_with_rollback
    success, rollback_or_err = safe_deduct_with_rollback(db, user, cost, f"session_{session_id}")
    if not success:
        return {"status": "failed", "error": rollback_or_err}
    try:
        result = await runner_fn()
        return {"status": "success", "data": result}
    except Exception as e:
        if callable(rollback_or_err):
            rollback_or_err()
        return {"status": "failed", "error": str(e), "refunded": True}

