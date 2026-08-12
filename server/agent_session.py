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

from . import llm

logger = logging.getLogger("helpotron.agent")

MAX_SESSION_SECONDS = 60 * 60  # spec: "30 minutes to an hour"
MAX_STEPS = 120                # slow, deliberate scraping pace
MAX_PAGE_CHARS = 30000
COMMAND_TIMEOUT = 40  # seconds to wait for the extension to execute one command
ATTACH_TIMEOUT = 60   # seconds to wait for the extension to connect after start

AGENT_SYSTEM = (
    "You are the Helpotron collection agent working inside the user's own "
    "Canvas tab. Your mission: gather everything needed to build study "
    "materials for the current assignment — the full prompt, rubric or "
    "requirements, attached-file descriptions, and any related module or "
    "lecture pages. Navigate and read pages with the tools; you can see the "
    "page text after read_page. When the assignment details are complete, "
    "call finish with a short summary of what you collected. Never submit "
    "anything, never click destructive actions. Stay inside the user's own "
    "Canvas account. Prefer read_page to inspect a page before clicking links."
)

TOOL_DOC = """Tools (call EXACTLY one per turn, as JSON):
{"tool": "read_page"} — current page text + links + url + title
{"tool": "click", "args": {"selector": "<css selector>"}} — click an element
{"tool": "type", "args": {"selector": "<css>", "text": "<value>"}} — fill an input
{"tool": "scroll", "args": {"direction": "down"|"up"}}
{"tool": "navigate", "args": {"url": "<full canvas url>"}}
{"tool": "finish", "args": {"summary": "<what you collected>"}} — end the session

Strategy: after navigate/click, always read_page to see what loaded. If a
selector fails, try links from the previous read_page instead of guessing.
If you already have the full assignment details, finish — don't wander."""


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
                    content, _model = await llm.call_llm(AGENT_SYSTEM + "\n\n" + TOOL_DOC, _agent_prompt(messages))
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
                if tool == "finish":
                    session.status = "done"
                    session.result_text = str(args.get("summary", ""))[:4000]
                    session.log.append({"step": session.steps, "event": "finish", "detail": session.result_text[:200]})
                    await _send(session, {"type": "finished", "summary": session.result_text})
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


manager = AgentManager()
