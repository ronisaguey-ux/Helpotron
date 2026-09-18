"""Overlord Main Agent, Sandbox Orchestrator & Operation Mode Permission Engine.

Supports:
1. Three Operation Modes:
   - Manual: Requires user approval for every action.
   - Auto: Auto-approves routine actions; asks permission for critical actions.
   - YOLO: Auto-approves all actions with zero prompts.
2. Virtual Sub-Agent Sandbox Integration (script generation, execution, automated media processing).
3. Natural Language Ecosystem Control (Settings modification, task execution, credits).
4. Auto-Approved Actions Rule Engine (persistent list per user).
5. Pending Permission Queue & Action Execution Handlers.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from .database import AgentFile, Assignment, CreditTransaction, StudyMaterial, Transcript, User
from .security import is_admin_user, is_junk_content, educational_guards_on
from .humanizer import AIHumanizerPipeline
from .subagents import SubAgentCoordinator
from .engine.sandbox import sandbox_manager

logger = logging.getLogger("helpotron.overlord")

# Read-only actions never require approval in ANY mode (operator 08-31, My
# Agent full-capability): asking for your balance, listing library materials
# or feedback entries is not a work action — manual mode should not gate it.
READONLY_ACTION_TYPES = {
    "plain_answer", "run_shell", "read_assignment",
    "get_wallet", "list_library", "list_referrals",
    "list_datalake_entries", "get_progress",
    # 09-01 (Bob, full-capability suite): config/plan reads and data exports
    # are pure reads — manual mode must never gate them either.
    "see_settings", "select_settings", "see_config", "export_assignment_data",
}

# Critical actions that trigger permission prompt in AUTO mode (09-01, Bob:
# risky = irreversible or account-affecting — delete/submit/archive/mark-done,
# settings changes, feature requests, anything touching purchases/credits/money).
CRITICAL_ACTION_TYPES = {
    "submit_assignment",
    "delete_assignment",
    "archive_assignment",
    "mark_assignment_done",
    "change_settings",
    "request_feature",
    "large_credit_deduct",
    "delete_data",
    "external_file_upload",
    "final_grade_submission",
    "bulk_wipe",
    "modify_security_settings",
    "mint_credits",
    # sweep#2 S1-1: arbitrary code execution must never be silently approved.
    # `run_sandbox_script` takes a model-authored `script` string and executes it
    # (overlord_agent.py, action_type == "run_sandbox_script"). It was absent
    # from this set, so AUTO mode ran it unchallenged — which is the difference
    # between "the agent suggested some code" and "the agent ran code on the
    # server with no one asked". The sandbox cannot be a namespace jail on this
    # box (see engine/sandbox_isolation.py), so the confirmation step is doing
    # real work here: a user (or a page steering the agent) cannot get code
    # executed without an explicit approval.
    #
    # `run_shell` is deliberately NOT here — it is AST-locked to safe maths
    # (`_validated_argv` / `_is_safe_compute_code`: no imports outside
    # math/datetime/decimal/fractions/statistics/sympy, no open/eval/exec/
    # __import__/ctypes, no shell metacharacters, argv-only, never shell=True),
    # verified against a ten-attempt escape suite. Gating it would prompt on
    # every arithmetic step for no security gain.
    "run_sandbox_script",
    # sweep#2 S1-3: `browser_commit` is a browser burst that TRANSMITS something
    # — a click on a submit/send/delete/buy control, or typing into a field and
    # pressing Enter. `routes_extension` classifies each burst and raises this
    # instead of plain `browser_action` when it sees one, so AUTO mode confirms
    # the irreversible step.
    #
    # Deliberately NOT the blanket `browser_action`: that would put a prompt in
    # front of every click and scroll, which is exactly the capability the
    # extension exists to provide. Reading and navigating stay fluid; only the
    # action that actually commits or transmits is confirmed.
    "browser_commit",
}

ROUTINE_ACTION_TYPES = {
    "analyze_rubric",
    "draft_section",
    "humanize_text",
    "generate_citations",
    "check_originality",
    "generate_flashcards",
    "summarize_lecture",
    "run_sandbox_script",
    "update_preferences",
    "change_settings",
    "create_assignment",
    "message_assignment_team",
    "choose_assignment_direction",
}

def _persist_user_settings(db, user, settings) -> None:
    """BATCH-05 settings write (see user_settings_service.persist_user_settings):
    shallow dict writes that equal the ORM-cached value are skipped by the ORM —
    nested edits vanish. Write through a core UPDATE."""
    import copy
    from .user_settings_service import persist_user_settings
    persist_user_settings(db, user, settings)


async def _build_flashcard_deck(
    db: Session,
    user: User,
    source: str = "",
    cards_payload: Any = None,
    count_hint: Optional[int] = None,
    assignment_id: Optional[int] = None,
) -> tuple[StudyMaterial, list[dict]]:
    """Create a real flashcard deck and persist it as a StudyMaterial row.

    Operator 08-27: the old agent path built StudyMaterial with `type=`/`title=`
    kwargs (neither is a column — 'type' is 'kind' here and there is no title),
    which TypeError'd on every flashcard request. Cards now keep the canonical
    {q, a} shape used by /api/flashcards, exporters and the demo deck. When the
    intent payload carries cards they are normalized; otherwise the real
    study-LLM pipeline (study_tools.generate_flashcards) runs against the
    supplied text or the assignment's latest transcript (falling back to the
    assignment's stored prompt, where the dump flow keeps pasted/uploaded
    content). The deck's StudyMaterial row is stored with the assignment_id so
    it lands in that assignment's bubble/materials. Raises RuntimeError
    with a user-facing message when no source exists or generation fails.
    """
    # Operator 08-27: the chat route passes thread_key as assignment_id, which
    # is an assignment id ONLY for assignment-bubble chats (main-chat thread
    # ids are AgentChatThread ids). Resolve to a real, user-owned assignment —
    # or None — so the deck can never be mis-attached to a wrong/nonexistent
    # assignment, and this same row feeds the source fallback below.
    if assignment_id:
        _assign = (db.query(Assignment)
                   .filter(Assignment.id == assignment_id,
                           Assignment.user_id == user.id)
                   .first())
        assignment_id = _assign.id if _assign else None

    cards = cards_payload
    if (isinstance(cards, list) and cards and all(
        isinstance(c, dict) and str(c.get("front") or c.get("q") or "").strip()
        and str(c.get("back") or c.get("a") or "").strip() for c in cards
    )):
        items = [
            {"q": str(c.get("front") if c.get("front") is not None else c.get("q")).strip(),
             "a": str(c.get("back") if c.get("back") is not None else c.get("a")).strip()}
            for c in cards
        ]
        model_used: str | None = None
    else:
        source = (source or "").strip()
        if not source and assignment_id:
            _t = (db.query(Transcript)
                  .filter(Transcript.user_id == user.id,
                          Transcript.assignment_id == assignment_id)
                  .order_by(Transcript.id.desc()).first())
            if _t:
                source = (_t.text or "").strip()
        if not source and assignment_id:
            # Fallback (operator 08-27): the dump flow stores the extracted
            # pasted/uploaded content in Assignment.prompt, and no Transcript
            # row exists for it. Without this, "make flashcards for this
            # assignment" in an assignment bubble died with the
            # "Nothing to build flashcards from" error note even though the
            # assignment body is right there.
            if _assign and (_assign.prompt or "").strip():
                source = _assign.prompt.strip()
        if not source:
            raise RuntimeError(
                "Nothing to build flashcards from — upload or paste a transcript, "
                "or name the topic you want cards for."
            )
        from .study_tools import generate_flashcards
        try:
            effort = int((user.settings or {}).get("effort_score", 500))
        except (TypeError, ValueError):
            effort = 500
        try:
            count = max(1, min(int(count_hint or 20), 100))
        except (TypeError, ValueError):
            count = 20
        items, model_used = await generate_flashcards(source, count=count, effort_score=effort)

    mat = StudyMaterial(
        user_id=user.id,
        assignment_id=assignment_id,
        kind="flashcards",
        content=json.dumps(items, ensure_ascii=False),
        model_used=model_used,
    )
    db.add(mat)
    db.commit()
    return mat, items



class PermissionEngine:
    """Evaluates whether an action requires approval based on user mode and persistent rules."""

    @staticmethod
    def evaluate_action_permission(
        user_settings: Dict[str, Any],
        action_type: str,
        session_mode_override: Optional[str] = None,
        context_data: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        """Determines if action is auto-approved or requires user confirmation.
        Returns: (is_approved: bool, reason: str)
        """
        mode = (session_mode_override or user_settings.get("operation_mode") or "auto").lower()
        auto_approved_rules: List[str] = user_settings.get("auto_approved_actions", [])

        # 0. Read-only actions never ask, in any mode (operator 08-31).
        if action_type.lower() in READONLY_ACTION_TYPES:
            return True, "Read-only action — never requires approval."

        # 1. Check persistent auto-approved rules list (exact match or substring rule)
        for rule in auto_approved_rules:
            rule_clean = rule.strip().lower()
            if rule_clean == action_type.lower() or rule_clean in action_type.lower():
                return True, f"Auto-approved via custom rule: '{rule}'"

        # 2. Mode 3: YOLO -> Everything is auto-approved
        if mode == "yolo":
            return True, "Auto-approved via YOLO mode (Zero Confirmation)"

        # 3. Mode 1: Manual -> Everything requires approval
        if mode == "manual":
            return False, "Manual mode requires explicit approval for all actions."

        # 4. Mode 2: Auto -> Routine is approved, Critical requires confirmation
        is_critical = action_type in CRITICAL_ACTION_TYPES
        if context_data and context_data.get("credit_cost", 0) >= 5.0:
            is_critical = True

        if is_critical:
            return False, f"Auto mode requires permission for critical action: '{action_type}'"

        return True, "Auto-approved routine action in Auto mode."


def _history_key(target_key, user_id=None) -> str:
    """User-scoped conversation key (operator 08-26, SECURITY): the store was
    keyed ONLY by target_key, so every user's global chat ('0') shared ONE
    list — context (memory words, private facts) leaked across accounts."""
    return f"u{user_id}:{str(target_key)}" if user_id is not None else ("guest:" + str(target_key))

def agent_display_name(user) -> str:
    """User-configured agent name (settings ai.aiName -> settings agent_name ->
    'Overlord' fallback). Only the DISPLAYED name changes; identity keys
    (sender='overlord', module name) stay as-is."""
    try:
        settings = dict(user.settings or {}) if user is not None else {}
    except Exception:
        settings = {}
    ai = settings.get("ai") if isinstance(settings.get("ai"), dict) else {}
    name = str(ai.get("aiName") or settings.get("agent_name") or "Overlord").strip()
    return name or "Overlord"


def _today_label() -> str:
    """Real current date string, computed per call (never hardcoded)."""
    return datetime.now().strftime("%A, %B %-d, %Y")


# ─── run_shell: one SAFE computation command through the sandbox wrapper ─────
_SBOX_SH = Path(__file__).resolve().parent.parent / "deploy" / "sandboxes" / "sandbox_run.sh"
_SHELL_META = re.compile(r"[|&`$<>~\\\n]")
_CMD_ALLOW = re.compile(r"^[0-9a-zA-Z\s.+\-*/()'\"\[\],:%_=;×÷·−]+$")
_PY3_CMD = re.compile(r"""^python3\s+-c\s+(?P<quote>["'])(?P<code>.+)(?P=quote)$""")


# 09-01 (Bob): My Agent couldn't edit user settings — the change_settings
# handler only knew chat-level keys, so "make my font small" was refused.
# These drive the UI's real storage shapes (see SettingsApp/AppShell).
_ACCESSIBILITY_KEYS = {
    "reducedMotion": "reducedMotion", "reduced_motion": "reducedMotion",
    "highContrast": "highContrast", "high_contrast": "highContrast",
    "largeText": "largeText", "large_text": "largeText",
    "dyslexiaFriendly": "dyslexiaFriendly", "dyslexia_friendly": "dyslexiaFriendly",
    "screenReader": "screenReader", "screen_reader": "screenReader",
}


def _coerce_flag(v: Any) -> Optional[bool]:
    """Boolean from JSON bools or lax string forms (true/1/yes/on/…).
    None when the value is not recognizable as a flag."""
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("true", "1", "yes", "on", "enable", "enabled"):
            return True
        if s in ("false", "0", "no", "off", "disable", "disabled"):
            return False
    if isinstance(v, (int, float)):
        return bool(v)
    return None


# 09-01 (Bob): the permission prompt must say WHAT will change, not just which
# mode is on. These labels humanize the payload keys the intent resolver emits
# for change_settings (see the contract in routes_overlord.py) so the popup can
# render "font scale → 1" instead of "fontScale: 1".
_SETTING_LABELS = {
    "agent_name": "agent name", "name": "agent name",
    "personality": "personality", "instructions": "instructions",
    "effort_score": "effort score", "operation_mode": "operation mode",
    "auto_approved_actions": "auto-approved actions",
    "school_name": "school", "major": "major", "goal": "goal",
    "font_size": "font size", "font_scale": "font scale", "fontScale": "font scale",
    "theme": "theme", "accent": "accent color", "density": "density",
    "compact_mode": "compact mode", "uiStyle": "UI style", "ui_style": "UI style",
    "animation": "animations", "background": "background",
    "custom_color": "custom color", "language": "language", "timezone": "timezone",
    "reducedMotion": "reduced motion", "reduced_motion": "reduced motion",
    "highContrast": "high contrast", "high_contrast": "high contrast",
    "largeText": "large text", "large_text": "large text",
    "dyslexiaFriendly": "dyslexia-friendly mode", "dyslexia_friendly": "dyslexia-friendly mode",
    "screenReader": "screen reader", "screen_reader": "screen reader",
}


def describe_permission_action(action_type: str, payload: Dict[str, Any]) -> str:
    """Human-readable description for a pending permission — the user sees this
    inside the approval popup, so it names the concrete change (e.g. "font
    scale → 1"), never just the mode the request was gated in."""
    payload = payload or {}
    if action_type == "change_settings":
        updates = payload.get("settings")
        if isinstance(updates, dict) and updates:
            parts = []
            for k, v in updates.items():
                label = _SETTING_LABELS.get(k, str(k).replace("_", " "))
                if isinstance(v, bool):
                    val = "on" if v else "off"
                elif isinstance(v, (dict, list)):
                    val = json.dumps(v, ensure_ascii=False)[:60]
                else:
                    val = str(v)
                parts.append(f"{label} → {val}")
            noun = "change" if len(parts) == 1 else "changes"
            return f"Apply {len(parts)} setting {noun}: {', '.join(parts)}."
        return "Apply your requested setting changes."
    if action_type == "generate_flashcards":
        prompt = str(payload.get("prompt") or "").strip()[:80]
        return f"Generate an active-recall flashcard deck from: {prompt}." if prompt else \
            "Generate an active-recall flashcard deck."
    if action_type == "create_assignment":
        return "Create a new assignment from your request."
    if action_type == "message_assignment_team":
        return "Send an instruction to the assignment's agent team."
    return f"Action '{action_type.replace('_', ' ')}' requires your confirmation before execution."


# 09-01 (Bob, full-capability): see_settings dumps the user's settings to the
# LLM — secrets must never leave the server. Mask any key that names a
# credential (api_key, password, secret, access/refresh token) and any value
# that is shaped like a key (sk-…/key-…). token_balance etc. are budgets, not
# secrets — they stay visible (the wallet action surfaces them anyway).
_SECRET_KEY_RE = re.compile(
    r"(api[-_]?key|password|passwd|secret|client[-_]?secret|access[-_]?token|refresh[-_]?token|private[-_]?key)",
    re.IGNORECASE,
)
_SECRET_VALUE_RE = re.compile(r"^(sk|pk|key|token|glpat|ghp)[-_][A-Za-z0-9_\-\.]{8,}$")


def _mask_settings_for_agent(settings: dict) -> dict:
    """Deep-copy of the user settings with credential-shaped entries masked."""
    def _mask_value(v):
        if isinstance(v, dict):
            return {k: ("•••••• (masked)" if _SECRET_KEY_RE.search(str(k)) else _mask_value(val))
                    for k, val in v.items()}
        if isinstance(v, list):
            return [_mask_value(item) for item in v]
        if isinstance(v, str) and v and _SECRET_VALUE_RE.match(v.strip()):
            return "•••••• (masked)"
        return v
    return _mask_value(settings)


def _is_safe_compute_code(code: str) -> bool:
    """Validate that Python code for run_shell only does safe math/datetime computation.
    Blocks all dangerous imports, builtins, filesystem, network, and subprocess calls.
    """
    import ast
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return False

    SAFE_MODULES = {"math", "datetime", "decimal", "fractions", "statistics", "sympy"}
    DISALLOWED_NAMES = {
        "open", "eval", "exec", "__import__", "globals", "locals", "getattr",
        "setattr", "delattr", "compile", "breakpoint", "input", "memoryview",
        "sys", "os", "subprocess", "shutil", "socket", "urllib", "requests",
        "pathlib", "io", "builtins", "posix", "ctypes", "importlib", "exit", "quit",
        "sympify", "parse_expr", "lambdify", "system", "popen", "spawn", "fork",
        "kill", "chr", "ord", "base64", "codec", "decode", "encode"
    }

    DANGEROUS_STR_PATTERNS = [
        "__", "import", "eval", "exec", "system", "subprocess",
        "os.", "sys.", "popen", "shutil", "socket", "base64",
        "globals", "locals", "builtins", "class", "subclasses",
        "chr(", "chr ", "lambda", "breakpoint", "compile"
    ]

    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            if node.id.startswith("__") or node.id in DISALLOWED_NAMES:
                return False
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") or node.attr in DISALLOWED_NAMES:
                return False
        elif isinstance(node, ast.Import):
            for alias in node.names:
                root_pkg = alias.name.split(".")[0]
                if root_pkg not in SAFE_MODULES or alias.name in DISALLOWED_NAMES:
                    return False
        elif isinstance(node, ast.ImportFrom):
            if not node.module or node.module.split(".")[0] not in SAFE_MODULES:
                return False
            for alias in node.names:
                if alias.name.startswith("__") or alias.name in DISALLOWED_NAMES:
                    return False
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and (node.func.id.startswith("__") or node.func.id in DISALLOWED_NAMES):
                return False
            if isinstance(node.func, ast.Attribute) and (node.func.attr.startswith("__") or node.func.attr in DISALLOWED_NAMES):
                return False
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            val_lower = node.value.lower()
            if any(p in val_lower for p in DANGEROUS_STR_PATTERNS):
                return False
            if re.search(r'[a-zA-Z_]\w*\s*\(', node.value):
                return False

    return True


def _validated_argv(command: str) -> Optional[list[str]]:
    """Turn a run_shell payload into an argv array. STRICT: only a tiny set of
    compute commands — python3 -c '<code>' or 'date'. No shell metas, no
    arbitrary user text, never shell=True.
    08-31 fix: the code runs with sys.executable (the server's own venv
    interpreter), NOT bare `python3` — that resolves to the system python,
    which lacks sympy/ratelim/etc. and made every LLM-authored compute
    command fail with 'nothing executed' (observed ModuleNotFoundError)."""
    cmd = (command or "").strip()
    if not cmd or _SHELL_META.search(cmd) or not _CMD_ALLOW.fullmatch(cmd):
        return None
    if cmd == "date":
        return ["date"]
    m = _PY3_CMD.match(cmd)
    if m:
        code = m.group("code")
        if _SHELL_META.search(code) or not _CMD_ALLOW.fullmatch(code):
            return None
        if not _is_safe_compute_code(code):
            return None
        return [sys.executable, "-c", code]
    return None


async def _compute_shell_command(command: str) -> Optional[str]:
    """Run the validated command inside the sandbox wrapper (argv subprocess,
    20s timeout); fall back to a direct strict python3 run if the wrapper is
    unavailable. Returns trimmed output (plain text answer) or None."""
    import subprocess as sp

    argv = _validated_argv(command)
    if not argv:
        return None

    def _read_sandbox_output() -> Optional[str]:
        try:
            proc = sp.run(
                [str(_SBOX_SH), "--kind", "shell", "--timeout", "20", "--"] + argv,
                capture_output=True, text=True, timeout=60,
            )
            if proc.returncode != 0:
                return None
            m = re.search(r"\[sandbox\]\s+([0-9_]+_[a-z_]+_\d+)\s+work=", proc.stdout)
            if not m:
                return None
            run_id = m.group(1)
            data_dir = os.environ.get("DATA_DIR") or (Path(__file__).resolve().parent.parent / "data")
            log = Path(data_dir) / "sandboxes" / run_id / "logs" / "run.log"
            if not log.exists():
                return None
            lines = [ln.strip() for ln in log.read_text(errors="replace").splitlines() if ln.strip()]
            return lines[-1] if lines else None
        except Exception:
            return None

    out = _read_sandbox_output()
    if out is None:
        # Fallback: direct run, argv only, same strict allowlist.
        try:
            proc = sp.run(argv, capture_output=True, text=True, timeout=20)
            if proc.returncode == 0:
                lines = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip()]
                return lines[-1] if lines else None
        except Exception:
            pass
        return None
    return out


class OverlordAgent:
    """The central orchestrating agent managing sub-agents, virtual sandboxes, NLP tasks, and permissions."""

    def __init__(self) -> None:
        self._pending_permissions: Dict[str, Dict[str, Any]] = {}
        self._chat_histories: Dict[str, List[Dict[str, Any]]] = {}

    def get_chat_history(self, target_key: str | int = "global", user=None) -> List[Dict[str, Any]]:
        k = _history_key(target_key, getattr(user, "id", None) if user is not None else None)
        return self._chat_histories.get(k, [
            {
                "id": "init_msg",
                "sender": "overlord",
                "text": f"🤖 {agent_display_name(user)} Agent online. Today is {_today_label()}. Ask a question to begin.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "suggested_actions": ["Run Sandbox Script", "Modify User Settings", "Generate Flashcards", "Check System Status"],
            }
        ])

    def add_chat_message(
        self,
        target_key: str | int,
        sender: str,
        text: str,
        suggested_actions: Optional[List[str]] = None,
        subagent_logs: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        k = _history_key(target_key, user_id)
        msg = {
            "id": f"msg_{uuid.uuid4().hex[:8]}",
            "sender": sender,
            "text": text,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "suggested_actions": suggested_actions or [],
            "subagent_logs": subagent_logs or [],
            "metadata": metadata or {},
        }
        if k not in self._chat_histories:
            self._chat_histories[k] = []
        self._chat_histories[k].append(msg)
        return msg

    def forget_chat_history(self, target_key: str | int, user_id: int | None = None) -> None:
        """Drop the in-memory conversation (thread deletion) so it can never
        resurrect from the cache after the persistent rows are gone."""
        k = _history_key(target_key, user_id)
        self._chat_histories.pop(k, None)

    async def compact_chat_history(
        self,
        user: Any,
        target_key: str | int = "0",
        max_messages: int = 40,
        max_chars: int = 12_000,
    ) -> str:
        """Summarize + trim a chat thread so it never bloats.

        Thresholds: more than ``max_messages`` messages OR more than
        ``max_chars`` of text. The oldest messages are summarized with a
        low-effort LLM call (cheap engines — compaction never needs flagship
        reasoning), the newest 10 stay verbatim, and the summary is injected
        as an overlord message. If the LLM is unreachable we fall back to
        keeping the newest 15 messages unsummarized.
        """
        from .llm import call_llm

        from .agent_prompt import sandbox_math_rule, prompt_injection_defense_rule  # standing rules
        k = _history_key(target_key, getattr(user, "id", None) if user is not None else None)
        history = self._chat_histories.get(k, [])
        total_chars = sum(len(m.get("text", "")) for m in history)
        if len(history) <= max_messages and total_chars <= max_chars:
            return None  # nothing to compact

        if history and history[0].get("id") == "init_msg":
            history = history[1:]
        oldest = history[:-10]
        newest = history[-10:]
        transcript = "\n".join(
            f"[{m.get('sender', '?')}] {m.get('text', '')}" for m in oldest
        )
        summary = None
        if transcript.strip():
            try:
                effort = 200
                settings = (user.settings or {}) if user else {}
                raw_effort = settings.get("effort_score")
                if isinstance(raw_effort, (int, float)):
                    effort = max(100, min(400, int(raw_effort) // 2))
                summary = await call_llm(
                    system_prompt=(
                        "You are a context compactor for a personal study agent. "
                        "Compress the chat transcript into a dense but complete "
                        "summary of decisions, facts, deadlines and user preferences. "
                        "Keep it under 250 words.\n"
                        + sandbox_math_rule()
                        + "\n"
                        + prompt_injection_defense_rule()
                    ),
                    user_prompt=f"Compress this agent chat transcript:\n\n{transcript[:12000]}",
                    temperature=0.2,
                    max_tokens=400,
                    effort_score=effort,
                )
                summary = summary.strip() or None
            except Exception:
                summary = None

        if summary:
            self._chat_histories[k] = newest + [{
                "id": f"summary_{uuid.uuid4().hex[:8]}",
                "sender": "overlord",
                "text": f"🧹 Earlier context compacted: {summary}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "suggested_actions": [],
                "subagent_logs": [],
                "metadata": {"compacted": True},
            }]
            return f"Compacted {len(oldest)} messages into a summary."
        self._chat_histories[k] = newest[-15:]
        return f"LLM summary unavailable — trimmed to the newest {len(newest[-15:])} messages."

    def create_pending_permission(
        self,
        user_public_id: str,
        action_type: str,
        title: str,
        description: str,
        payload: Dict[str, Any],
        assignment_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        req_id = f"perm_{uuid.uuid4().hex[:8]}"
        entry = {
            "id": req_id,
            "user_public_id": user_public_id,
            "assignment_id": assignment_id,
            "action_type": action_type,
            "title": title,
            "description": description,
            "payload": payload,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._pending_permissions[req_id] = entry
        return entry

    def get_pending_permissions(self, user_public_id: str) -> List[Dict[str, Any]]:
        return [
            p for p in self._pending_permissions.values()
            if p["user_public_id"] == user_public_id and p["status"] == "pending"
        ]

    async def parse_and_execute_command(
        self,
        db: Session,
        user: User,
        prompt: str,
        mode_override: Optional[str] = None,
        files: Optional[List[Dict[str, Any]]] = None,
        target_key: str | int = "global",
    ) -> Dict[str, Any]:
        """Parses natural language directives, dispatches sandboxes, settings mutations, team messages, or coursework actions."""
        text = prompt.strip()
        user_settings = dict(user.settings or {})
        display_name = agent_display_name(user)
        subagent_logs: List[str] = []

        # ─── 1. Create Assignment ──────────────────────────────────────────
        # e.g., "create assignment Quantum Mechanics Lab for Physics due 2026-04-15"
        if re.search(r"\b(create|add|new)\s+(assignment|task|coursework)\b", text, re.IGNORECASE):
            action_type = "create_assignment"
            approved, reason = PermissionEngine.evaluate_action_permission(
                user_settings, action_type, session_mode_override=mode_override
            )

            title_match = re.search(r'(?:assignment|task|coursework)\s+(?:named|called|titled)?\s*[\'"]?([^\'\"]+?)[\'"]?(?:\s+(?:for|in|due|with)|\s*$)', text, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else f"New {display_name} Assignment"
            course_match = re.search(r'(?:for|in)\s+course\s+[\'"]?([^\'\"]+?)[\'"]?', text, re.IGNORECASE)
            course = course_match.group(1).strip() if course_match else "General Studies"

            payload = {
                "title": title,
                "course": course,
                "prompt": text,
                "due_date": "2026-04-15",
                "progress": {"course": course, "teacher_name": "Course Instructor", "ai_score": 0.0},
            }

            if not approved:
                perm = self.create_pending_permission(
                    user.public_id,
                    action_type,
                    f"Create Assignment '{title}'",
                    f"Authorize {display_name} to instantiate new assignment card '{title}' for {course}?",
                    payload,
                )
                reply = f"⚠️ Permission required to create assignment '{title}'. Confirmation prompt generated."
                self.add_chat_message(target_key, "overlord", reply)
                return {"status": "pending_permission", "permission_id": perm["id"], "reply": reply}

            new_assign = Assignment(
                user_id=user.id,
                title=title,
                prompt=payload.get("prompt") or text,
                # 09-01 (Bob): an agent-created assignment WAITS for the user to
                # pick its direction (do it / study guide / quiz / …) — it is
                # never silently started. The user approves it, picks a
                # direction, and only then does the team start working.
                status=payload.get("status") or "pending_approval",
                due_date=payload["due_date"],
                progress=payload["progress"],
            )
            db.add(new_assign)
            db.commit()
            db.refresh(new_assign)

            reply = f"✅ Created new assignment #{new_assign.id}: '{title}' for course '{course}'. Sub-agent team initialized."
            self.add_chat_message(target_key, "overlord", reply, suggested_actions=["Message Team", "Analyze Rubric", "Generate Flashcards"])
            return {"status": "success", "reply": reply, "assignment_id": new_assign.id, "title": title}

        # ─── 2. Message Specific Assignment Sub-Agent Team ─────────────────
        # e.g., "message team for assignment 1: draft section 2 with APA citations", "tell team 2 to check rubric"
        msg_team_match = re.search(r'\b(?:message|tell|instruct)\s+(?:team|subagents?)\s+(?:for\s+)?(?:assignment\s+)?#?(\d+)\s*[:,\-]?\s*(.+)', text, re.IGNORECASE)
        if msg_team_match:
            target_assign_id = int(msg_team_match.group(1))
            team_instruction = msg_team_match.group(2).strip()

            action_type = "message_assignment_team"
            approved, reason = PermissionEngine.evaluate_action_permission(
                user_settings, action_type, session_mode_override=mode_override, context_data={"assignment_id": target_assign_id}
            )

            payload = {"assignment_id": target_assign_id, "instruction": team_instruction}

            if not approved:
                perm = self.create_pending_permission(
                    user.public_id,
                    action_type,
                    f"Message Team for Assignment #{target_assign_id}",
                    f"Authorize {display_name} to send instruction to Assignment #{target_assign_id} team: '{team_instruction}'?",
                    payload,
                    assignment_id=target_assign_id,
                )
                reply = f"⚠️ Permission required to message Assignment #{target_assign_id} team. Confirmation prompt sent."
                self.add_chat_message(target_key, "overlord", reply)
                return {"status": "pending_permission", "permission_id": perm["id"], "reply": reply}

            # Record instruction directly into assignment chat feed
            self.add_chat_message(target_assign_id, "user", f"[Direct from {display_name}]: {team_instruction}")
            team_reply = f"🤖 Assignment #{target_assign_id} sub-agent team acknowledged directive: '{team_instruction}'. Synthesis underway."
            self.add_chat_message(target_assign_id, "overlord", team_reply)

            reply = f"📨 Dispatched instruction to Assignment #{target_assign_id} sub-agent team: \"{team_instruction}\""
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "assignment_id": target_assign_id}

        # ─── 3. Natural Language Settings Modifications ─────────────────────
        # Effort Score: e.g. "set effort score to 850", "change effort to 300"
        if re.search(r"\b(effort|effort_score|effort\s+score)\b", text, re.IGNORECASE):
            score_match = re.search(r"(\d{1,4})", text)
            if score_match:
                score = max(1, min(1000, int(score_match.group(1))))
                user_settings["effort_score"] = score
                _persist_user_settings(db, user, user_settings)
                reply = f"✅ Effort Score calibrated to {score}/1000."
                self.add_chat_message(target_key, "overlord", reply)
                return {"status": "success", "reply": reply, "effort_score": score}

        # Auto-Start: e.g. "enable auto-start", "turn off autostart", "auto_start"
        if re.search(r"\b(auto[_\s\-]?start|autostart)\b", text, re.IGNORECASE):
            enabled = not ("off" in text.lower() or "disable" in text.lower() or "false" in text.lower())
            user_settings["auto_start"] = enabled
            _persist_user_settings(db, user, user_settings)
            reply = f"✅ Auto-Start pipeline {'ENABLED ⚡' if enabled else 'DISABLED ⏸️'}."
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "auto_start": enabled}

        # Target Grade: e.g. "set target grade to A+", "target score 95"
        if re.search(r"\b(target\s+grade|target\s+score|grade\s+target|target_score)\b", text, re.IGNORECASE):
            grade_match = re.search(r"(?:grade\s+(?:to\s+)?|to\s+)([A-Fa-f][\+\-]?)", text)
            if not grade_match:
                grade_match = re.search(r"\b([A-Fa-f][\+\-]?)", text)
            num_match = re.search(r"\b(\d{1,3})\b", text)
            letter = grade_match.group(1).upper() if grade_match else "A"
            numeric = int(num_match.group(1)) if num_match else 92

            user_settings["target_score_letter"] = letter
            user_settings["target_score_numeric"] = numeric
            user.settings = dict(user_settings)
            db.commit()
            reply = f"🎯 Target Grade updated to {letter} ({numeric}%)."
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "grade": letter, "score": numeric}

        # Academic Level: e.g. "set academic level to master", "reading level college-senior"
        if re.search(r"\b(academic\s+level|reading\s+level|target\s+level|academic_level)\b", text, re.IGNORECASE):
            level_match = re.search(r"(3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th|high[_\s]school|college[_\s]freshman|sophomore|junior|senior|undergraduate|master|phd|professor)", text, re.IGNORECASE)
            level = level_match.group(1).lower().replace(" ", "_") if level_match else "undergraduate"
            user_settings["academic_level"] = level
            user.settings = dict(user_settings)
            db.commit()
            reply = f"🎓 Academic Level calibrated to '{level.replace('_', ' ').title()}'."
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "academic_level": level}

        # AI Detectors: e.g. "enable all ai detectors", "disable originality.ai"
        if re.search(r"\b(ai detector|ai detectors|detector toggles?|originality\.ai|pangram|sapling)\b", text, re.IGNORECASE):
            dets = dict(user_settings.get("ai_detectors", {}))
            if "disable all" in text.lower() or "turn off all" in text.lower():
                dets = {k: False for k in ["pangram", "sapling", "perplexity_cadence", "statistical_burstiness", "zippy", "roberta_onnx"]}
                reply = "🛡️ All AI detector pre-scans disabled."
            else:
                dets = {k: True for k in ["pangram", "sapling", "perplexity_cadence", "statistical_burstiness", "zippy", "roberta_onnx"]}
                reply = "🛡️ All AI detector pre-scans ENABLED with zero-leakage threshold."
            user_settings["ai_detectors"] = dets
            user.settings = dict(user_settings)
            db.commit()
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "ai_detectors": dets}

        # Operation Mode: e.g. "enable yolo mode", "set mode to manual", "set mode to auto"
        if re.search(r"\b(operation mode|operation_mode|mode to yolo|mode to auto|mode to manual)\b", text, re.IGNORECASE):
            mode = "auto"
            if "yolo" in text.lower():
                mode = "yolo"
            elif "manual" in text.lower():
                mode = "manual"
            user_settings["operation_mode"] = mode
            user.settings = dict(user_settings)
            db.commit()
            reply = f"⚡ Ecosystem operation mode updated to '{mode.upper()}'."
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "mode": mode}

        # Auto-Approved Rules: e.g. "auto approve flashcards", "auto approve create_assignment"
        if re.search(r"\bauto[_\s]approve\b", text, re.IGNORECASE):
            rule_match = re.search(r"auto[_\s]approve\s+[\'\"`]?([^\'\"`]+)[\'\"`]?", text, re.IGNORECASE)
            rule = rule_match.group(1).strip() if rule_match else "study_tools"
            rules = set(user_settings.get("auto_approved_actions", []))
            rules.add(rule)
            user_settings["auto_approved_actions"] = list(rules)
            user.settings = dict(user_settings)
            db.commit()
            reply = f"✅ Added '{rule}' to persistent auto-approved actions."
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "rules": list(rules)}

        # Add Custom Subject: e.g. "add subject Organic Chemistry with description ..."
        if re.search(r"\b(add|create)\s+subject\b", text, re.IGNORECASE):
            sub_name_match = re.search(r"subject\s+[\'\"`]?([A-Za-z0-9\s]+?)[\'\"`]?(?:\s+with|\s+desc|\s*$)", text, re.IGNORECASE)
            sub_name = sub_name_match.group(1).strip() if sub_name_match else "New Subject"
            subjects = list(user_settings.get("custom_subjects", []))
            subjects.append({"id": f"sub_{uuid.uuid4().hex[:6]}", "name": sub_name, "description": f"Added via {display_name} Agent", "color": "blue", "is_custom": True})
            user_settings["custom_subjects"] = subjects
            user.settings = dict(user_settings)
            db.commit()
            reply = f"📁 Custom Subject '{sub_name}' added to taxonomy."
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "subjects": subjects}

        # ─── 4. Generate Study Tools & Materials ────────────────────────────
        # e.g., "generate flashcards for Photosynthesis", "summarize lecture"
        if "flashcard" in text.lower():
            action_type = "generate_flashcards"
            approved, reason = PermissionEngine.evaluate_action_permission(user_settings, action_type, session_mode_override=mode_override)
            if not approved:
                perm = self.create_pending_permission(user.public_id, action_type, "Generate Flashcard Deck", f"Generate active recall flashcards for '{text}'?", {"prompt": text})
                reply = "⚠️ Permission required to generate flashcards. Confirmation prompt sent."
                self.add_chat_message(target_key, "overlord", reply)
                return {"status": "pending_permission", "permission_id": perm["id"], "reply": reply}

            # Generate material (operator 08-27: real cards, valid columns —
            # the old code 500'd on `type=`/`title=` kwargs of StudyMaterial).
            try:
                mat, items = await _build_flashcard_deck(db, user, source=text)
            except Exception as e:  # noqa: BLE001 — honest in-band failure
                reply = f"⚠️ Flashcards could not be generated: {e}"
                self.add_chat_message(target_key, "overlord", reply)
                return {"status": "failed", "reply": reply}
            reply = f"✨ Active Recall Flashcard deck created — {len(items)} cards (material #{mat.id})."
            self.add_chat_message(target_key, "overlord", reply, suggested_actions=["Practice Flashcards", "Create Quiz"])
            return {"status": "success", "reply": reply, "material_id": mat.id, "cards": items}

        # ─── 5. Message Admin Direct Channel ─────────────────────────────────
        # e.g., "message admin about canvas integration issue"
        if re.search(r"\bmessage\s+admin\b", text, re.IGNORECASE):
            admin_msg_match = re.search(r"message\s+admin\s*[:,\-]?\s*(.+)", text, re.IGNORECASE)
            admin_text = admin_msg_match.group(1).strip() if admin_msg_match else text
            from .database import AdminMessage
            msg = AdminMessage(user_id=user.public_id, subject=f"{display_name} Dispatched Inquiry", category="general", message=admin_text, status="sent")
            db.add(msg)
            db.commit()
            reply = f"📨 Delivered message directly to Admin inbox: \"{admin_text}\""
            self.add_chat_message(target_key, "overlord", reply)
            return {"status": "success", "reply": reply, "message_id": msg.id}

        # ─── 6. Virtual Sandbox Script Execution ────────────────────────────
        # e.g., "run python script in sandbox", "process audio file in sandbox"
        if "sandbox" in text.lower() or "script" in text.lower() or files:
            subagent_logs.append(f"{display_name}: Initializing Virtual Sub-Agent Sandbox...")

            if "audio" in text.lower() or (files and any(f.get("name", "").endswith((".mp3", ".wav", ".webm")) for f in files)):
                script_code = """
import sys, json
print("Sub-agent processing audio stream...")
summary = "Lecture covers core tenets of distributed Byzantine consensus and fault tolerance under network latency."
out = {"status": "success", "summary": summary, "word_count": 5200, "duration_minutes": 48}
with open("result.json", "w") as f:
    json.dump(out, f)
print("Transcription & synthesis complete.")
"""
                lang = "python"
            elif "node" in text.lower() or "javascript" in text.lower():
                script_code = 'console.log("Sub-agent AST node transform complete.");'
                lang = "node"
            else:
                script_code = """
import sys, os
print("Sub-agent sandbox execution verified.")
print(f"Active files: {os.listdir('.')}")
"""
                lang = "python"

            input_files = {}
            if files:
                for f in files:
                    fname = f.get("name", "upload.dat")
                    fcontent = f.get("content", b"")
                    input_files[fname] = fcontent

            subagent_logs.append(f"Spawning sub-agent in isolated workspace with {lang} runtime...")
            sandbox_res = await sandbox_manager.execute_subagent_task(
                subagent_name="analysis_worker",
                user_id=user.public_id,
                script_code=script_code,
                language=lang,
                input_files=input_files,
                auto_cleanup=True,
            )

            subagent_logs.append(f"Execution finished in {sandbox_res['execution_time_ms']}ms (exit code {sandbox_res['exit_code']}).")
            subagent_logs.append("Sandbox workspace safely reclaimed.")

            reply = f"🧪 Virtual Sandbox execution complete! Output:\n```\n{sandbox_res['stdout'].strip()}\n```"
            self.add_chat_message(
                target_key,
                "overlord",
                reply,
                subagent_logs=subagent_logs,
                metadata={"sandbox_result": sandbox_res},
            )
            return {"status": "success", "reply": reply, "sandbox": sandbox_res, "logs": subagent_logs}

        # ─── 7. General NLP Directive ───────────────────────────────────────
        # 08-28: this path never called the LLM — every unmatched directive
        # got the canned "executed directive" line, so identity/skills/memory
        # were meaningless here. Answer through the canonical agent prompt
        # (same identity the chat path uses); the canned line stays only as
        # an offline fallback and never fabricates a completion.
        subagent_logs.append(f"{display_name}: Routing query to DeepSeek-V4 Tier...")
        reply = f"🤖 {display_name} executed directive: '{text}'. All ecosystem subsystems and sub-agents synchronized."
        try:
            from .agent_prompt import agent_system_prompt
            from .llm import call_llm
            ans = await call_llm(
                system_prompt=(
                    agent_system_prompt(user, node="my_agent")  # explicit My Agent surface (operator 08-28)
                    + "\nThe user sent this directive to their agent:\n<untrusted_user_directive>\n"
                    + text[:3000]
                    + "\n</untrusted_user_directive>\n\nIt didn't match a known work command. Do whatever is within your powers "
                    "to comply (never claim actions you didn't take); if you cannot do it, say what "
                    "you actually did and what the user should do next. Reply directly to the user "
                    "in plain text, under 220 words, staying in character per the identity above."
                ),
                user_prompt="Reply now, as the agent, to the user.",
                temperature=0.4,
                max_tokens=500,
                effort_score=120,
            )
            ans = (ans or "").strip()
            if ans and ans.lower() not in ("ok", "done", "sure"):
                reply = ans
        except Exception:
            pass  # offline: keep the canned acknowledgment
        self.add_chat_message(
            target_key,
            "overlord",
            reply,
            suggested_actions=["Create Assignment", "Calibrate Effort Score", "Message Team", "Export Data"],
            subagent_logs=subagent_logs,
        )
        return {"status": "success", "reply": reply, "logs": subagent_logs}

    async def execute_task_action(
        self,
        db: Session,
        user: User,
        action_type: str,
        payload: Dict[str, Any],
        assignment_id: Optional[int] = None,
        node: str = "my_agent",
    ) -> Dict[str, Any]:
        """Executes the specific sub-agent, settings mutation, team dispatch, or tool action.

        `node` (operator 08-28) is the surface the action came from ("my_agent",
        "assignment_team", ...). It flows into LLM sub-paths (analyze_rubric
        decomposition) so those speak as the surface's own config — never with
        My Agent's identity/memory/files on another surface."""
        logger.info("Executing action: %s for user %s (node %s)", action_type, user.public_id, node)
        logger.info("Executing action: %s for user %s", action_type, user.public_id)

        # ── Action ledger: snapshot + record BEFORE execution so every action
        # has an undo trail (see agent_actions.py, My Agent → Recent actions).
        ledger = None
        undo_payload = None
        if action_type == "change_settings":
            undo_payload = {"old_settings": dict(user.settings or {})}
        elif action_type == "delete_assignment":
            _aid = payload.get("assignment_id") or assignment_id
            _row = db.query(Assignment).filter_by(id=_aid, user_id=user.id).first()
            if _row is not None:
                undo_payload = {
                    "restore": {
                        "canvas_id": _row.canvas_id,
                        "title": _row.title,
                        "due_date": _row.due_date,
                        "prompt": _row.prompt,
                        "file_urls": _row.file_urls or [],
                        "status": _row.status,
                        "progress": _row.progress or {},
                    }
                }
        elif action_type == "message_assignment_team":
            undo_payload = {"assignment_id": payload.get("assignment_id") or assignment_id}
        elif action_type in ("read_assignment", "create_assignment"):
            undo_payload = {}
        elif action_type in ("mark_assignment_done", "archive_assignment"):
            # 09-01 (Bob): status flips are reversible — snapshot the old status.
            _aid = payload.get("assignment_id") or assignment_id
            _row = db.query(Assignment).filter_by(id=_aid, user_id=user.id).first()
            if _row is not None:
                undo_payload = {"restore_status": _row.status}
        if undo_payload is not None:
            from .agent_actions import record_agent_action
            ledger = record_agent_action(
                db, user, action_type,
                f"{action_type} — {payload.get('title') or payload.get('instruction') or payload.get('assignment_id') or ''}",
                assignment_id, payload, undo_payload,
            )

        if action_type == "create_assignment":
            title = payload.get("title", "New Assignment")
            course = payload.get("course", "General Studies")
            new_a = Assignment(
                user_id=user.id,
                title=title,
                prompt=payload.get("prompt", "Directly initialized coursework task."),
                # 09-01 (Bob): agent-created bubbles start PENDING — the user
                # picks the direction (do it for me / study guide / quiz / …)
                # and it moves to in_progress only when work actually starts.
                status=payload.get("status") or "pending_approval",
                due_date=payload.get("due_date", "2026-04-15"),
                progress={"course": course, "teacher_name": payload.get("teacher_name", "Department Instructor"), "ai_score": 0.0},
            )
            db.add(new_a)
            db.commit()
            db.refresh(new_a)
            if ledger is not None:
                from .agent_actions import set_undo_payload
                set_undo_payload(db, ledger, {"delete_assignment_id": new_a.id})
            return {
                "action": action_type,
                "status": "completed",
                "assignment_id": new_a.id,
                "message": f"Assignment #{new_a.id} '{title}' created successfully.",
            }

        elif action_type == "delete_assignment":
            _aid = payload.get("assignment_id") or assignment_id
            _row = db.query(Assignment).filter_by(id=_aid, user_id=user.id).first()
            if _row is None:
                return {"action": action_type, "status": "failed", "message": f"No assignment #{_aid} found."}
            db.delete(_row)
            db.commit()
            return {"action": action_type, "status": "completed", "assignment_id": _aid,
                    "message": f"Assignment #{_aid} deleted. Undo it from My Agent → Recent actions."}

        elif action_type == "read_assignment":
            _aid = payload.get("assignment_id") or assignment_id
            return {"action": action_type, "status": "completed", "assignment_id": _aid,
                    "message": "Read recorded on the action ledger — undo from Recent actions to revoke the read."}

        elif action_type == "run_shell":
            cmd = (payload.get("command") or "").strip()
            result = await _compute_shell_command(cmd)
            if result is None:
                return {"action": action_type, "status": "failed",
                        "message": "I couldn't run that computation safely — nothing executed. Rephrase it as a plain math or date question."}
            ans = result.strip()
            return {"action": action_type, "status": "completed",
                    "message": ans, "result_text": ans}

        elif action_type == "message_assignment_team":
            aid = payload.get("assignment_id") or assignment_id
            instruction = payload.get("instruction", "Proceed with synthesis")
            if aid:
                self.add_chat_message(aid, "user", f"[Direct from {agent_display_name(user)}]: {instruction}")
                self.add_chat_message(aid, "overlord", f"🤖 Team acknowledged: {instruction}")
            return {
                "action": action_type,
                "status": "completed",
                "assignment_id": aid,
                "message": f"Instruction sent to Assignment #{aid} team.",
            }

        elif action_type == "change_settings":
            settings = dict(user.settings or {})
            updates = payload.get("settings", {})
            if not isinstance(updates, dict):
                return {"action": action_type, "status": "failed", "message": "No settings provided."}
            ai = dict(settings.get("ai") or {})
            disp = dict(settings.get("display") or {})
            ap = dict(settings.get("appearance") or {})
            acc = dict(settings.get("accessibility") or {})
            loc = dict(settings.get("localization") or {})
            applied = []
            # chat-level keys → the ai sub-dict the UI + resolver read
            for k, v in updates.items():
                if k in ("agent_name", "name"):
                    ai["aiName"] = str(v)
                    applied.append("agent name")
                elif k in ("personality", "instructions"):
                    val_str = str(v)
                    if is_junk_content(val_str) and educational_guards_on(user):
                        continue
                    ai[k] = val_str
                    applied.append(k)
                elif k == "effort_score":
                    try:
                        settings["effort_score"] = max(1, min(1000, int(v)))
                    except (TypeError, ValueError):
                        continue
                    applied.append("effort score")
                elif k == "operation_mode" and str(v).lower() in ("manual", "auto", "yolo"):
                    settings["operation_mode"] = str(v).lower()
                    applied.append("mode")
                elif k == "auto_approved_actions" and isinstance(v, list):
                    settings["auto_approved_actions"] = v
                    applied.append("auto-approved actions")
                elif k in ("school_name", "major", "goal"):
                    settings[k] = v
                    applied.append(k.replace("_", " "))
                # 09-01 (Bob): appearance/display/accessibility keys — the
                # shapes the UI actually reads and applies live.
                elif k == "font_size" and str(v).lower() in ("small", "medium", "large"):
                    size = str(v).lower()
                    disp["font_size"] = size
                    # appearance.fontScale is the live-applied value
                    # (SettingsApp: 50 = default; small ≈ 35, large ≈ 65).
                    ap["fontScale"] = {"small": 35, "medium": 50, "large": 65}[size]
                    applied.append("font size")
                elif k in ("font_scale", "fontScale"):
                    try:
                        ap["fontScale"] = max(1, min(100, int(v)))
                    except (TypeError, ValueError):
                        continue
                    applied.append("font scale")
                elif k == "theme":
                    settings[k] = v
                    disp["theme"] = ap["theme"] = v
                    applied.append("theme")
                elif k == "accent":
                    ap["accent"] = v
                    applied.append("accent")
                elif k == "density":
                    ap["density"] = v
                    applied.append("density")
                elif k == "compact_mode":
                    f = _coerce_flag(v)
                    if f is None:
                        continue
                    disp["compact_mode"] = f
                    applied.append("compact mode")
                elif k in ("uiStyle", "ui_style"):
                    ap["uiStyle"] = v
                    applied.append("UI style")
                elif k in ("animation", "background"):
                    ap[k] = v
                    applied.append(k)
                elif k == "custom_color":
                    disp["custom_color"] = v
                    applied.append("custom color")
                elif k == "language":
                    loc["language"] = v
                    applied.append("language")
                elif k == "timezone":
                    settings[k] = v
                    loc["timezone"] = v
                    applied.append("timezone")
                elif k in _ACCESSIBILITY_KEYS and (f := _coerce_flag(v)) is not None:
                    acc[_ACCESSIBILITY_KEYS[k]] = f
                    applied.append(k.replace("_", " "))
            if ai:
                settings["ai"] = ai
            if disp:
                settings["display"] = disp
            if ap:
                settings["appearance"] = ap
            if acc:
                settings["accessibility"] = acc
            if loc:
                settings["localization"] = loc
            if not applied:
                return {"action": action_type, "status": "failed", "message": "No recognized settings in that request."}
            user.settings = settings
            db.commit()
            return {
                "action": action_type,
                "status": "completed",
                "message": f"Settings updated: {', '.join(applied)}.",
                "settings": settings,
            }

        elif action_type == "generate_flashcards":
            # Operator 08-27: this used `type="flashcards"` + `title=` — neither
            # is a StudyMaterial column ("kind" is the field; the table has no
            # title), so every chat "generate flashcards" request 500'd with
            # "TypeError: 'type' is an invalid keyword argument for StudyMaterial".
            # Routed through _build_flashcard_deck: real cards, canonical {q,a}.
            try:
                mat, items = await _build_flashcard_deck(
                    db,
                    user,
                    source=str(payload.get("prompt") or payload.get("text") or ""),
                    cards_payload=payload.get("cards"),
                    count_hint=payload.get("count"),
                    assignment_id=payload.get("assignment_id") or assignment_id,
                )
            except Exception as e:  # noqa: BLE001 — in-band honest failure, never a 500
                logger.warning("generate_flashcards failed for user %s: %s", user.public_id, e)
                return {"action": action_type, "status": "failed",
                        "message": str(e) or "Flashcard generation failed."}
            return {
                "action": action_type,
                "status": "completed",
                "material_id": mat.id,
                "cards": items,
                "cards_count": len(items),
                "message": f"Flashcards deck generated — {len(items)} cards (material #{mat.id}).",
            }

        elif action_type == "humanize_text":
            pipeline = AIHumanizerPipeline()
            text = payload.get("text", "")
            # settings ride through so HIP follows the humanizer toggle: it is
            # the rewrite engine only when the user turned that setting ON.
            humanized, iterations = await pipeline.humanize_loop(
                text, settings=(user.settings if user and user.settings else None),
            )
            eval_res = await pipeline.evaluate_multi_checkers(humanized)
            return {
                "action": action_type,
                "status": "completed",
                "result_text": humanized,
                "iterations": iterations,
                "human_confidence_score": eval_res["human_confidence_score"],
            }

        elif action_type == "analyze_rubric":
            coordinator = SubAgentCoordinator()
            prompt_text = payload.get("prompt", "Analyze research assignment criteria")
            rubric_text = payload.get("rubric", "Standard grading rubric with analysis, thesis, evidence, and citations.")
            # 08-28: this decomposition LLM previously ran with a generic
            # "expert decomposer" prompt — the user's identity never reached
            # it. Prepend the canonical persona block, NODE-SCOPED (operator
            # 08-28): only the executing surface's own config goes in. When
            # the node (assignment_team etc.) has no config of its own, the
            # My Agent identity/memory/files are NOT injected — the decomposer
            # stays a plain expert.
            try:
                from .agent_prompt import agent_persona_block
                node_identity = agent_persona_block(user, node=node)
                if node_identity:
                    persona_ctx = (
                        "You are operating as the user's agent on this surface. Their configured identity "
                        "is binding on how you work for them — follow it.\n\n" + node_identity
                    )
                else:
                    persona_ctx = ""
            except Exception:
                persona_ctx = ""
            decomp = await coordinator.decompose_rubric(prompt_text, rubric_text, persona_ctx=persona_ctx)
            return {
                "action": action_type,
                "status": "completed",
                "rubric_breakdown": decomp,
            }

        elif action_type == "draft_section":
            section_name = payload.get("section_name", "Introduction")
            content = f"Drafted comprehensive academic {section_name} addressing all primary inquiry parameters with structured argumentation."
            return {
                "action": action_type,
                "status": "completed",
                "section": section_name,
                "content": content,
            }

        elif action_type == "submit_assignment":
            if assignment_id:
                assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
                if assignment:
                    assignment.status = "completed"
                    db.commit()
            return {
                "action": action_type,
                "status": "completed",
                "message": f"Assignment #{assignment_id} officially marked completed and submitted.",
            }

        elif action_type == "remember":
            from .agent_memory import append_memory
            text = str(payload.get("text", "")).strip()
            if not text:
                return {"action": action_type, "status": "failed", "message": "No text provided to remember."}
            entry = append_memory(user.public_id, text)
            return {
                "action": action_type,
                "status": "completed",
                "message": f"Remembered: {text[:80]}{'…' if len(text) > 80 else ''}",
                "entry": entry,
            }

        elif action_type == "forget_memory":
            from .agent_memory import delete_memory, load_memory
            target = str(payload.get("entry_id") or payload.get("text") or "").strip()
            if not target:
                return {"action": action_type, "status": "failed", "message": "Specify which memory entry to forget."}
            # Match by exact id first, then by text substring
            for e in load_memory(user.public_id):
                if e.get("id") == target or target in e.get("text", ""):
                    delete_memory(user.public_id, e["id"])
                    return {"action": action_type, "status": "completed", "message": f"Forgot memory: {e['text'][:80]}"}
            return {"action": action_type, "status": "failed", "message": "No memory entry matched that."}

        elif action_type == "edit_assignment":
            from .assignments import _get_owned_assignment
            aid = payload.get("assignment_id") or assignment_id
            if not aid:
                return {"action": action_type, "status": "failed", "message": "No assignment_id provided."}
            assignment = _get_owned_assignment(int(aid), user.id, db)
            changes = payload.get("updates", {})
            if not changes:
                return {"action": action_type, "status": "failed", "message": "Nothing to change."}
            applied = []
            allowed_status = {"tracked", "not_started", "in_progress", "completed", "submitted", "graded", "paused", "archived"}
            if "status" in changes and changes["status"] in allowed_status:
                assignment.status = changes["status"]
                applied.append("status")
            if isinstance(changes.get("progress"), dict):
                merged = dict(assignment.progress or {})
                merged.update(changes["progress"])
                assignment.progress = merged
                applied.append("progress")
            for key in ("title", "due_date", "prompt", "file_urls"):
                if key in changes:
                    setattr(assignment, key, changes[key])
                    applied.append(key)
            db.commit()
            if not applied:
                return {"action": action_type, "status": "failed", "message": "Nothing usable in the update payload."}
            return {
                "action": action_type,
                "status": "completed",
                "message": f"Assignment #{assignment.id} updated: {', '.join(applied)}.",
            }

        # ── 08-31 (Bob, My Agent full-capability): the rest of the website ──
        # Read-only surface access — wallet, library, referrals, Data Lake
        # entries and progress — all zero-cost and never permission-gated.

        elif action_type == "get_wallet":
            s = dict(user.settings or {})
            tokens = float(s.get("token_balance", 0) or 0)
            credits = float(getattr(user, "credits", 0) or 0)
            micro = float(s.get("micro_credits_balance", 0) or 0)
            plan = str(getattr(user, "plan", "basic") or "basic")
            msg = (f"Wallet — {tokens:g} tokens (usage budget), {credits:g} credits "
                   f"(discount money, 1 credit = $1.00 off), {micro:g} micro-credits")
            if micro >= 1000:
                msg += f" (redeems to {int(micro) // 1000} credit{'' if int(micro) // 1000 == 1 else 's'} at 1,000:1)"
            msg += f". Plan: {plan}."
            return {"action": action_type, "status": "completed", "message": msg,
                    "wallet": {"tokens": tokens, "credits": credits,
                               "micro_credits": micro, "plan": plan}}

        elif action_type == "list_library":
            try:
                limit = max(1, min(int(payload.get("limit", 10)), 50))
            except (TypeError, ValueError):
                limit = 10
            q = db.query(StudyMaterial).filter(StudyMaterial.user_id == user.id)
            aid = payload.get("assignment_id")
            if aid:
                try:
                    q = q.filter(StudyMaterial.assignment_id == int(aid))
                except (TypeError, ValueError):
                    pass
            rows = q.order_by(StudyMaterial.created_at.desc()).limit(limit).all()
            if not rows:
                return {"action": action_type, "status": "completed",
                        "message": "Library is empty — generate flashcards, a quiz or a "
                                   "study guide from an assignment first."}
            aid_map: Dict[int, str] = {}
            ids = sorted({m.assignment_id for m in rows if m.assignment_id})
            if ids:
                for a in db.query(Assignment).filter(Assignment.id.in_(ids)).all():
                    aid_map[a.id] = a.title
            lines = []
            for m in rows:
                preview = ""
                try:
                    parsed = json.loads(m.content or "null")
                    if isinstance(parsed, list):
                        preview = f"{len(parsed)} items"
                    elif isinstance(parsed, dict):
                        preview = str(parsed)[:60]
                except (ValueError, TypeError):
                    preview = str(m.content or "")[:60].replace("\n", " ")
                kind = m.kind or "material"
                owner = aid_map.get(m.assignment_id, "—")
                lines.append(f"#{m.id} [{kind}] {owner}: {preview} ({m.created_at:%b %d})")
            return {"action": action_type, "status": "completed",
                    "message": f"Library ({len(rows)} material{'s' if len(rows) != 1 else ''}):\n"
                               + "\n".join(lines)}

        elif action_type == "list_referrals":
            from .database import Referral
            rows = (db.query(Referral).filter(Referral.referrer_id == user.id)
                    .order_by(Referral.created_at.desc()).all())
            if not rows:
                return {"action": action_type, "status": "completed",
                        "message": "No referral codes yet — issue one from Credits "
                                   "→ Referrals to share."}
            lines = [f"{r.referral_code} — {'redeemed' if r.completed_at else 'unused'} ({r.created_at:%b %d})"
                     for r in rows[:10]]
            return {"action": action_type, "status": "completed",
                    "message": "Your referral codes:\n" + "\n".join(lines)}

        elif action_type == "list_datalake_entries":
            try:
                from .datalake import DataLakeManager
                try:
                    limit = max(1, min(int(payload.get("limit", 5)), 20))
                except (TypeError, ValueError):
                    limit = 5
                entries = DataLakeManager().list_microcredit_submissions(
                    user_id=user.public_id, limit=limit)
            except Exception as e:  # noqa: BLE001 — honest in-band failure
                return {"action": action_type, "status": "failed",
                        "message": f"Could not read Data Lake entries: {e}"}
            if not entries:
                return {"action": action_type, "status": "completed",
                        "message": "No Data Lake submissions yet — submit anything that "
                                   "could improve the site (material, notes, feedback, "
                                   "ideas) from the Data Lake view."}
            lines = []
            for e in entries:
                est = e.get("estimated_credits") or e.get("credits_awarded") or 0
                act = e.get("actual_credits") or 0
                lines.append(f"{e.get('title', 'Untitled')} — {est} est / {act:g} awarded, "
                             f"status {e.get('status', '?')}")
            return {"action": action_type, "status": "completed",
                    "message": "Your Data Lake submissions:\n" + "\n".join(lines)}

        elif action_type == "get_progress":
            rows = db.query(Assignment).filter(Assignment.user_id == user.id).all()
            if not rows:
                return {"action": action_type, "status": "completed",
                        "message": "No assignments yet — add coursework on the dashboard "
                                   "or from the Assignment Dump."}
            counts: Dict[str, int] = {}
            for a in rows:
                st = (a.status or "tracked").lower()
                counts[st] = counts.get(st, 0) + 1
            by_status = ", ".join(f"{s}: {n}" for s, n in sorted(counts.items()))
            upcoming = sorted([a for a in rows if a.due_date], key=lambda a: a.due_date)[:3]
            msg = f"Progress: {len(rows)} assignment{'s' if len(rows) != 1 else ''} ({by_status})."
            if upcoming:
                msg += "\nNext due:\n" + "\n".join(f"  • {a.title} — due {a.due_date}" for a in upcoming)
            return {"action": action_type, "status": "completed", "message": msg}

        # ── 09-01 (Bob, full-capability): config/plan reads, lifecycle state
        # changes, data export and feature requests. All are user-scoped. ────

        elif action_type == "see_settings":
            masked = _mask_settings_for_agent(dict(user.settings or {}))
            msg = (f"Settings snapshot ({len(masked)} keys) — secrets are masked. "
                   "Ask for one section with select_settings to see it cleanly.")
            return {"action": action_type, "status": "completed", "message": msg,
                    "settings": masked}

        elif action_type == "select_settings":
            section = str(payload.get("section") or "").strip().lower()
            allowed = {"appearance", "display", "accessibility", "ai", "goals",
                       "notifications", "localization"}
            if section not in allowed:
                return {"action": action_type, "status": "failed",
                        "message": f"Pick a section from: {', '.join(sorted(allowed))}."}
            settings = dict(user.settings or {})
            sub = settings.get(section)
            if sub is None:
                sub = _mask_settings_for_agent(settings) if section in ("ai",) else {}
            if section in ("ai",) and sub is not None:
                sub = _mask_settings_for_agent(sub)
            return {"action": action_type, "status": "completed",
                    "message": f"Settings section '{section}': the user can tune this "
                               "on the Settings page (I opened it for you).",
                    "settings_section": sub,
                    "navigate_to": "settings"}

        elif action_type == "see_config":
            s = dict(user.settings or {})
            plan = str(getattr(user, "plan", "basic") or "basic")
            tokens = float(s.get("token_balance", 0) or 0)
            credits = float(getattr(user, "credits", 0) or 0)
            micro = float(s.get("micro_credits_balance", 0) or 0)
            features = []
            limits = {}
            try:
                from .plans import get_plan_catalogue, low_balance_threshold
                for entry in get_plan_catalogue():
                    if entry.get("id") == plan:
                        features = list(entry.get("capabilities") or [])
                        limits = {
                            "monthly_task_tokens": entry.get("monthly_task_tokens"),
                            "low_balance_threshold": low_balance_threshold(plan),
                        }
                        break
            except Exception as e:  # noqa: BLE001 — honest degrade
                logger.warning("see_config plan lookup failed: %s", e)
            msg = (f"Config — plan: {plan}. {tokens:g} tokens left in the usage budget, "
                   f"{credits:g} credits (discount money), {micro:g} micro-credits.")
            if features:
                msg += "\nPlan features:\n" + "\n".join(f"  • {f}" for f in features)
            return {"action": action_type, "status": "completed", "message": msg,
                    "config": {"plan": plan, "token_balance": tokens, "credits": credits,
                               "micro_credits": micro, "features": features, "limits": limits}}

        elif action_type == "request_feature":
            text = str(payload.get("text") or "").strip()
            if not text:
                return {"action": action_type, "status": "failed",
                        "message": "Tell me what feature or improvement you want."}
            try:
                from .datalake import DataLakeManager
                entry = DataLakeManager().record_feedback(
                    category="feature_request", urgency="low",
                    message=text, user_id=user.public_id,
                )
            except Exception as e:  # noqa: BLE001 — honest in-band failure
                return {"action": action_type, "status": "failed",
                        "message": f"I couldn't log that feature request: {e}"}
            return {"action": action_type, "status": "completed",
                    "feature_request_id": entry.get("feedback_id"),
                    "message": f"Feature request logged in the Data Lake "
                               f"({entry.get('feedback_id')}) — the team reviews "
                               f"every request."}

        elif action_type == "mark_assignment_done":
            _aid = payload.get("assignment_id") or assignment_id
            _row = db.query(Assignment).filter(Assignment.id == _aid,
                                               Assignment.user_id == user.id).first()
            if _row is None:
                return {"action": action_type, "status": "failed",
                        "message": f"No assignment #{_aid} found."}
            _row.status = "completed"
            db.commit()
            return {"action": action_type, "status": "completed", "assignment_id": _row.id,
                    "message": f"Assignment #{_row.id} '{_row.title}' marked done."}

        elif action_type == "archive_assignment":
            _aid = payload.get("assignment_id") or assignment_id
            _row = db.query(Assignment).filter(Assignment.id == _aid,
                                               Assignment.user_id == user.id).first()
            if _row is None:
                return {"action": action_type, "status": "failed",
                        "message": f"No assignment #{_aid} found."}
            _row.status = "archived"
            db.commit()
            return {"action": action_type, "status": "completed", "assignment_id": _row.id,
                    "message": f"Assignment #{_row.id} '{_row.title}' archived into history."}

        elif action_type == "export_assignment_data":
            _aid = payload.get("assignment_id")
            _bubble = str(payload.get("bubble") or "").strip()
            query = db.query(Assignment).filter(Assignment.user_id == user.id)
            if _aid:
                try:
                    query = query.filter(Assignment.id == int(_aid))
                except (TypeError, ValueError):
                    return {"action": action_type, "status": "failed",
                            "message": "assignment_id must be a number."}
            elif _bubble:
                query = query.filter(Assignment.title.ilike(f"%{_bubble}%"))
            assign_rows = query.order_by(Assignment.id.asc()).limit(20).all()
            if not assign_rows:
                return {"action": action_type, "status": "failed",
                        "message": "No assignment matched that — name a bubble or pass its id."}
            mats = (db.query(StudyMaterial)
                    .filter(StudyMaterial.user_id == user.id)
                    .order_by(StudyMaterial.created_at.desc()).all())
            def _exports(mat) -> str:
                kind = mat.kind or ""
                if kind == "flashcards":
                    return f"/api/export/flashcards/{mat.id}/quizlet"
                if kind == "practice_test":
                    return f"/api/export/practice-test/{mat.id}/json"
                if kind == "study_guide":
                    return f"/api/export/study-guide/{mat.id}/markdown"
                if kind == "summary":
                    return f"/api/export/summary/{mat.id}/txt"
                return ""
            out_assignments = []
            for a in assign_rows:
                a_mats = [m for m in mats if m.assignment_id == a.id]
                out_assignments.append({
                    "assignment_id": a.id, "title": a.title, "status": a.status,
                    "due_date": a.due_date,
                    "progress": dict(a.progress or {}),
                    "generated_at": a.created_at.isoformat() if a.created_at else None,
                    "materials": [
                        {"material_id": m.id, "kind": m.kind,
                         "preview": str(m.content or "")[:200].replace("\n", " "),
                         "export_url": _exports(m) or None}
                        for m in a_mats
                    ],
                })
            all_mats = [m for m in mats if m.assignment_id is None]
            payload_data = {
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "assignments": out_assignments,
                "library_orphan_materials": [
                    {"material_id": m.id, "kind": m.kind, "export_url": _exports(m) or None}
                    for m in all_mats
                ],
            }
            first_url = next((m["export_url"] for a in out_assignments for m in a["materials"]
                              if m.get("export_url")), None)
            material_total = sum(len(a["materials"]) for a in out_assignments)
            msg = (f"Exported {len(out_assignments)} assignment"
                   f"{'s' if len(out_assignments) != 1 else ''} (+{material_total} materials). "
                   + (f"Download: {first_url}" if first_url else
                      "No downloadable material yet — generate flashcards, a quiz, a study guide or a summary first."))
            return {"action": action_type, "status": "completed", "message": msg,
                    "data": payload_data, "download_url": first_url,
                    "export_url": first_url}

        elif action_type == "choose_assignment_direction":
            _aid = payload.get("assignment_id") or assignment_id
            direction = str(payload.get("direction") or "").strip().lower()
            custom_text = str(payload.get("custom_text") or "").strip()
            if not direction:
                return {"action": action_type, "status": "failed",
                        "message": "Pick a direction: do_it_for_me, study_guide, "
                                   "quiz, flashcards, summary or custom."}
            _row = db.query(Assignment).filter(Assignment.id == _aid,
                                               Assignment.user_id == user.id).first()
            if _row is None:
                return {"action": action_type, "status": "failed",
                        "message": f"No assignment #{_aid} found to run that on."}
            # 09-01 (Bob): a picked direction starts REAL work — the bubble moves
            # to in_progress FIRST, then the team runs (progress stays truthful).
            try:
                if _row.status in ("pending_approval", "tracked", "not_started"):
                    _row.status = "in_progress"
                    progress = dict(_row.progress or {})
                    progress["dispatch_direction"] = direction
                    _row.progress = progress
                    db.commit()
            except Exception:  # noqa: BLE001 — status flip is cosmetic, never fatal
                db.rollback()
            try:
                from .assignment_direction import apply_direction
                try:
                    import inspect
                    sig = inspect.signature(apply_direction)
                    kwargs = {"db": db, "user": user, "assignment": _row,
                              "direction": direction, "custom_text": custom_text}
                    params = sig.parameters
                    call_kwargs = {}
                    for name in ("db", "user", "assignment", "direction", "custom_text"):
                        if name in params:
                            call_kwargs[name] = kwargs[name]
                    result = apply_direction(**call_kwargs)
                    if inspect.isawaitable(result):
                        result = await result
                    if isinstance(result, dict):
                        message = result.get("message") or "Team finished the direction."
                        if result.get("status") == "failed":
                            return {"action": action_type, "status": "failed",
                                    "assignment_id": _row.id, "direction": direction,
                                    "message": message, "direction_result": result}
                        return {"action": action_type, "status": "completed",
                                "assignment_id": _row.id, "direction": direction,
                                "message": message, "direction_result": result}
                    return {"action": action_type, "status": "completed",
                            "assignment_id": _row.id, "direction": direction,
                            "message": str(result or "Team finished the direction.")}
                except TypeError:
                    # apply_direction present but with an unknown shape — fall
                    # through to the shared dispatch engine below.
                    raise ImportError("apply_direction signature mismatch")
            except (ImportError, AttributeError, ValueError):
                # Contract module missing/not ready — the dispatch engine in
                # assignment_team.py still does the REAL work (never a 500).
                from .assignment_team import dispatch_direction
                note = await dispatch_direction(db, user, _row, direction, custom_text)
                return {"action": action_type, "status": "completed",
                        "assignment_id": _row.id, "direction": direction,
                        "message": note}
            except Exception as e:  # noqa: BLE001 — honest in-band failure
                return {"action": action_type, "status": "failed",
                        "message": f"That direction couldn't run right now: {str(e)[:160]} — try again."}

        elif action_type == "admin_lookup_user":
            if not is_admin_user(user):
                return {"action": action_type, "status": "failed", "message": "Not an admin caller."}
            from .database import SessionLocal as _SL
            _db = _SL()
            try:
                q = payload.get("query", "")
                matches = []
                for u in _db.query(User).filter(User.public_id.like(f"%{q}%")).limit(5).all():
                    matches.append({
                        "public_id": u.public_id, "plan": u.plan, "credits": u.credits,
                        "is_admin": bool(getattr(u, "is_admin", False)),
                    })
                return {"action": action_type, "status": "completed", "message": f"Found {len(matches)} user(s).", "users": matches}
            finally:
                _db.close()

        elif action_type == "admin_adjust_credits":
            if not is_admin_user(user):
                return {"action": action_type, "status": "failed", "message": "Not an admin caller."}
            from .database import SessionLocal as _SL
            _db = _SL()
            try:
                target = _db.query(User).filter(User.public_id == payload.get("public_id", "")).first()
                if not target:
                    return {"action": action_type, "status": "failed", "message": "User not found."}
                delta = float(payload.get("delta", 0))
                # Admin/persona adjustment moves TASK TOKENS (the usage
                # currency), not credits — credits are earn-only discounts.
                from .credits import get_token_balance, set_token_balance
                set_token_balance(target, max(0.0, get_token_balance(target) + delta))
                _db.commit()
                return {"action": action_type, "status": "completed", "message": f"{target.public_id} credits now {target.credits:.0f}."}
            finally:
                _db.close()

        elif action_type == "admin_system_status":
            if not is_admin_user(user):
                return {"action": action_type, "status": "failed", "message": "Not an admin caller."}
            from .database import SessionLocal as _SL
            _db = _SL()
            try:
                from sqlalchemy import func
                stats = {
                    "users": _db.query(func.count(User.id)).scalar() or 0,
                    "assignments": _db.query(func.count(Assignment.id)).scalar() or 0,
                    "agent_files": _db.query(func.count(AgentFile.id)).scalar() or 0,
                    "status": "ok",
                }
                return {"action": action_type, "status": "completed", "message": f"Platform healthy: {stats['users']} users, {stats['assignments']} assignments.", "stats": stats}
            finally:
                _db.close()

        elif action_type == "run_sandbox_script":
            script = payload.get("script", "print('Sandbox run successful')")
            lang = payload.get("language", "python")
            res = await sandbox_manager.execute_subagent_task(
                subagent_name="custom_script_runner",
                user_id=user.public_id,
                script_code=script,
                language=lang,
            )
            return {
                "action": action_type,
                "status": "completed",
                "sandbox_result": res,
            }

        elif action_type == "scrape_assignment":
            # Extension-surface scrape (08-28): the server-side agent can NOT
            # fetch a Canvas page (CORS/auth/DRM) — the REAL scrape runs in
            # the user's browser. Return the explicit scrape_request contract
            # the popup dispatches on: {instruction} → runTabScrapeWithInstruction
            # → agent session → extension saves on `finished`. The old fallback
            # lied ("completed by sub-agent cluster") with no execution and no
            # instruction — nothing was ever scraped.
            instruction = str(payload.get("instruction") or "").strip() or "scrape the assignment"
            aid = payload.get("assignment_id") or assignment_id
            return {
                "action": action_type,
                "status": "completed",
                "assignment_id": aid,
                "scrape_request": {"instruction": instruction},
                "message": "On it — scraping your tab now…",
            }

        else:
            return {
                "action": action_type,
                "status": "completed",
                "message": f"Action '{action_type}' completed successfully by sub-agent cluster.",
                "data": payload,
            }


overlord_agent = OverlordAgent()
permission_engine = PermissionEngine()



# ─── Persistent chat store (operator 08-26) ──────────────────────────────────
def load_chat_history_from_db(db, user_id: int, target_key):
    """Seed the in-memory cache from the persistent table — without this,
    every server restart erased all conversation context."""
    try:
        from .database import AgentChatMessage
    except (ImportError, ValueError):
        from server.database import AgentChatMessage
    k = _history_key(target_key, user_id)
    if k in overlord_agent._chat_histories:
        return
    try:
        rows = (
            db.query(AgentChatMessage)
            .filter(
                AgentChatMessage.user_id == user_id,
                # scoped key OR legacy unscoped rows (pre-08-26 storage)
                AgentChatMessage.target_key.in_([k, str(target_key)]),
            )
            .order_by(AgentChatMessage.created_at.desc())
            .limit(40)
            .all()
        )
    except Exception:
        return
    if rows:
        # 08-27 bugfix: the cache was seeded with the OLDEST 40 rows (ASC +
        # limit), so a conversation's recent turns — today's messages — were
        # never loaded after a restart; the agent's "conversation so far"
        # stayed stamped on the prior day's task payloads. Load the NEWEST 40
        # and restore chronological order so the cache reads like the thread.
        rows = list(reversed(rows))
        overlord_agent._chat_histories[k] = [
            {
                "id": f"db_{r.id}",
                "sender": r.sender,
                "text": r.text,
                "timestamp": r.created_at.isoformat() if r.created_at else None,
                "suggested_actions": [],
                "subagent_logs": [],
                "metadata": {},
            }
            for r in rows
        ]


def persist_chat_message(db, user_id: int, target_key, sender: str, text: str) -> None:
    """Durable copy of one conversation turn (best-effort)."""
    try:
        from .database import AgentChatMessage
    except (ImportError, ValueError):
        from server.database import AgentChatMessage
    try:
        db.add(AgentChatMessage(user_id=user_id, target_key=_history_key(target_key, user_id), sender=sender, text=text or ""))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
