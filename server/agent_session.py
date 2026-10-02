import asyncio
import json
import logging
import time
import uuid
from typing import Any, Dict

from fastapi import WebSocket

from . import llm

logger = logging.getLogger(__name__)

MAX_SESSION_SECONDS = 1800  # 30 min cap
MAX_STEPS = 30
COMMAND_TIMEOUT = 30.0  # seconds waiting for extension to respond to a tool
ATTACH_TIMEOUT = 15.0   # seconds waiting for extension WS to attach after start
MAX_PAGE_CHARS = 12000  # cap tool observation size fed back into prompt

AGENT_SYSTEM = """You are Helpotron's page collector. Your goal is to inspect
the user's active LMS assignment page (Canvas, Blackboard, Brightspace, Moodle,
Google Classroom, etc.) and read its full text so Helpotron can generate an
authentic completion plan.

Rules:
1. Be fast and efficient — read the current page first.
2. If content is truncated or paginated, scroll or navigate to see the full prompt/rubric.
3. Once complete assignment data is extracted, call 'finish'.
4. If page cannot be parsed, honestly call 'report_unparseable'."""

TOOL_DOC = """Available tools (reply with exactly one JSON object):
- {"tool": "read_page"} — extract text, title, and links from current tab
- {"tool": "click", "args": {"selector": "css selector or text"}}
- {"tool": "type", "args": {"selector": "...", "text": "..."}}
- {"tool": "scroll", "args": {"direction": "down|up"}}
- {"tool": "navigate", "args": {"url": "..."}}
- {"tool": "finish", "args": {"summary": "...", "assignment": {"title": "...", "description": "...", "due_date": "...", "points": ...}}}
- {"tool": "report_unparseable", "args": {"reason": "..."}}"""


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
                    await asyncio.sleep(0)
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
        return {"status": "failed", "error": str(e)}
