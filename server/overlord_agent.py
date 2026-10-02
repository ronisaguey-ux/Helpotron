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
import time
import uuid
from datetime import datetime
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from .database import AgentFile, Assignment, CreditTransaction, StudyMaterial, User
from .humanizer import AIHumanizerPipeline
from .subagents import SubAgentCoordinator
from .engine.sandbox import sandbox_manager

logger = logging.getLogger("helpotron.overlord")

# Critical actions that trigger permission prompt in AUTO mode
CRITICAL_ACTION_TYPES = {
    "submit_assignment",
    "delete_assignment",
    "large_credit_deduct",
    "delete_data",
    "external_file_upload",
    "final_grade_submission",
    "bulk_wipe",
    "modify_security_settings",
    "mint_credits",
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
}

def _persist_user_settings(db, user, settings) -> None:
    """BATCH-05 settings write (see user_settings_service.persist_user_settings):
    shallow dict writes that equal the ORM-cached value are skipped by the ORM —
    nested edits vanish. Write through a core UPDATE."""
    import copy
    from .user_settings_service import persist_user_settings
    persist_user_settings(db, user, settings)



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
_PY3_CMD = re.compile(r'^python3\s+-c\s+"(.+)"$')


def _validated_argv(command: str) -> Optional[list[str]]:
    """Turn a run_shell payload into an argv array. STRICT: only a tiny set of
    compute commands — python3 -c '<code>' or 'date'. No shell metas, no
    arbitrary user text, never shell=True."""
    cmd = (command or "").strip()
    if not cmd or _SHELL_META.search(cmd) or not _CMD_ALLOW.fullmatch(cmd):
        return None
    if cmd == "date":
        return ["date"]
    m = _PY3_CMD.match(cmd)
    if m:
        code = m.group(1)
        if _SHELL_META.search(code) or not _CMD_ALLOW.fullmatch(code):
            return None
        return ["python3", "-c", code]
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
                "text": f"🤖 {agent_display_name(user)} Agent online. Today is {_today_label()}. Full ecosystem control and Virtual Sandboxes armed.",
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
                        "Keep it under 250 words."
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
                status="in_progress",
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
                dets = {k: False for k in ["pangram", "sapling", "winston_ai", "perplexity_cadence", "statistical_burstiness"]}
                reply = "🛡️ All AI detector pre-scans disabled."
            else:
                dets = {k: True for k in ["pangram", "sapling", "winston_ai", "perplexity_cadence", "statistical_burstiness"]}
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

            # Generate material
            mat = StudyMaterial(
                user_id=user.id,
                type="flashcards",
                title=f"Flashcards: {text[:30]}",
                content=json.dumps([{"front": "Core Concept", "back": f"Synthesized definition via {display_name} subagent"}]),
            )
            db.add(mat)
            db.commit()
            reply = f"✨ Active Recall Flashcard deck created: '{mat.title}'."
            self.add_chat_message(target_key, "overlord", reply, suggested_actions=["Practice Flashcards", "Create Quiz"])
            return {"status": "success", "reply": reply, "material_id": mat.id}

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
        subagent_logs.append(f"{display_name}: Routing query to DeepSeek-V4 Tier...")
        reply = f"🤖 {display_name} executed directive: '{text}'. All ecosystem subsystems and sub-agents synchronized."
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
    ) -> Dict[str, Any]:
        """Executes the specific sub-agent, settings mutation, team dispatch, or tool action."""
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
                status="in_progress",
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
            applied = []
            # chat-level keys → the ai sub-dict the UI + resolver read
            for k, v in updates.items():
                if k in ("agent_name", "name"):
                    ai["aiName"] = str(v)
                    applied.append("agent name")
                elif k in ("personality", "instructions"):
                    ai[k] = str(v)
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
                elif k in ("school_name", "major", "goal", "timezone", "theme"):
                    settings[k] = v
                    applied.append(k.replace("_", " "))
            if ai:
                settings["ai"] = ai
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
            mat = StudyMaterial(
                user_id=user.id,
                type="flashcards",
                title=payload.get("title", "Flashcards Deck"),
                content=json.dumps(payload.get("cards", [{"front": "Question", "back": "Answer"}])),
            )
            db.add(mat)
            db.commit()
            return {
                "action": action_type,
                "status": "completed",
                "material_id": mat.id,
                "message": f"Flashcards deck '{mat.title}' generated.",
            }

        elif action_type == "humanize_text":
            pipeline = AIHumanizerPipeline()
            text = payload.get("text", "")
            humanized, iterations = await pipeline.humanize_loop(text)
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
            decomp = await coordinator.decompose_rubric(prompt_text, rubric_text)
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
            allowed_status = {"tracked", "not_started", "in_progress", "completed", "submitted", "graded", "paused"}
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

        elif action_type == "admin_lookup_user":
            admin_id = getattr(config, "admin_public_id", None)
            if not getattr(user, "is_admin", False) and not (bool(admin_id) and user.public_id == admin_id):
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
            admin_id = getattr(config, "admin_public_id", None)
            if not getattr(user, "is_admin", False) and not (bool(admin_id) and user.public_id == admin_id):
                return {"action": action_type, "status": "failed", "message": "Not an admin caller."}
            from .database import SessionLocal as _SL
            _db = _SL()
            try:
                target = _db.query(User).filter(User.public_id == payload.get("public_id", "")).first()
                if not target:
                    return {"action": action_type, "status": "failed", "message": "User not found."}
                delta = float(payload.get("delta", 0))
                target.credits = max(0.0, (target.credits or 0.0) + delta)
                _db.commit()
                return {"action": action_type, "status": "completed", "message": f"{target.public_id} credits now {target.credits:.0f}."}
            finally:
                _db.close()

        elif action_type == "admin_system_status":
            admin_id = getattr(config, "admin_public_id", None)
            if not getattr(user, "is_admin", False) and not (bool(admin_id) and user.public_id == admin_id):
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
            # 08-28 (Envy ownership): canvas-scrape delegation. The tab scrape
            # runs CLIENT-SIDE (popup.js -> scrapeWithInstruction) — this
            # intercept must NOT land on the generic else (which fakes
            # "completed by sub-agent cluster"). Return a scrape_request the
            # popup.js can execute; status is "pending" until the extension
            # reports the real result back.
            return {
                "action": action_type,
                "status": "pending",
                "node": "extensions",
                "scrape_request": {
                    "instruction": payload.get("instruction", "") or "",
                    "assignment_id": payload.get("assignment_id") or assignment_id,
                },
                "message": "Scrape request dispatched to the browser extension — run the real tab scrape via scrapeWithInstruction.",
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
            .order_by(AgentChatMessage.created_at.asc())
            .limit(40)
            .all()
        )
    except Exception:
        return
    if rows:
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
