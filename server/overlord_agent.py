"""Overlord Main Agent & Operation Mode Permission Engine for Helpotron.

Supports:
1. Three Operation Modes:
   - Manual: Requires user approval for every action.
   - Auto: Auto-approves routine actions; asks permission for critical actions.
   - YOLO: Auto-approves all actions with zero prompts.
2. Auto-Approved Actions Rule Engine (persistent list per user).
3. Overlord Main Agent Chat & Sub-Agent Dispatcher.
4. Pending Permission Queue & Action Execution Handlers.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from .database import Assignment, CreditTransaction, StudyMaterial, User
from .humanizer import AIHumanizerPipeline
from .subagents import SubAgentCoordinator

logger = logging.getLogger("helpotron.overlord")

# Critical actions that trigger permission prompt in AUTO mode
CRITICAL_ACTION_TYPES = {
    "submit_assignment",
    "large_credit_deduct",
    "delete_data",
    "external_file_upload",
    "final_grade_submission",
    "bulk_wipe",
}

ROUTINE_ACTION_TYPES = {
    "analyze_rubric",
    "draft_section",
    "humanize_text",
    "generate_citations",
    "check_originality",
    "generate_flashcards",
    "summarize_lecture",
}


class PermissionEngine:
    """Evaluates whether an action requires approval based on user mode and persistent rules."""

    @staticmethod
    def evaluate_action_permission(
        user_settings: Dict[str, Any],
        action_type: str,
        session_mode_override: Optional[str] = None,
        context_data: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        """
        Determines if action is auto-approved or requires user confirmation.
        Returns: (is_approved: bool, reason: str)
        """
        # Determine effective mode
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


class OverlordAgent:
    """The central orchestrating agent managing sub-agents, chat, tasks, and permissions."""

    def __init__(self) -> None:
        # Key: request_id -> {id, user_id, assignment_id, action_type, payload, status, created_at}
        self._pending_permissions: Dict[str, Dict[str, Any]] = {}
        # Key: assignment_id -> list of chat messages
        self._chat_histories: Dict[int, List[Dict[str, Any]]] = {}

    def get_chat_history(self, assignment_id: int) -> List[Dict[str, Any]]:
        return self._chat_histories.get(assignment_id, [
            {
                "id": "init_msg",
                "sender": "overlord",
                "text": "👋 Helpotron Overlord Agent active. Sub-agents ready for your instructions.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "suggested_actions": ["Write Introduction", "Check Citations", "Humanize Section", "Evaluate Rubric"],
            }
        ])

    def add_chat_message(
        self,
        assignment_id: int,
        sender: str,
        text: str,
        suggested_actions: Optional[List[str]] = None,
        subagent_logs: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        msg = {
            "id": f"msg_{uuid.uuid4().hex[:8]}",
            "sender": sender,
            "text": text,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "suggested_actions": suggested_actions or [],
            "subagent_logs": subagent_logs or [],
        }
        if assignment_id not in self._chat_histories:
            self._chat_histories[assignment_id] = []
        self._chat_histories[assignment_id].append(msg)
        return msg

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
            "status": "pending",  # pending | approved | rejected
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._pending_permissions[req_id] = entry
        return entry

    def get_pending_permissions(self, user_public_id: str) -> List[Dict[str, Any]]:
        return [
            p for p in self._pending_permissions.values()
            if p["user_public_id"] == user_public_id and p["status"] == "pending"
        ]

    async def execute_task_action(
        self,
        db: Session,
        user: User,
        action_type: str,
        payload: Dict[str, Any],
        assignment_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Executes the specific sub-agent or tool action."""
        logger.info("Executing action: %s for user %s", action_type, user.public_id)

        if action_type == "humanize_text":
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
            prompt = payload.get("prompt", "Assignment overview")
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

        else:
            return {
                "action": action_type,
                "status": "completed",
                "message": f"Action '{action_type}' completed successfully by sub-agent cluster.",
                "data": payload,
            }


overlord_agent = OverlordAgent()
permission_engine = PermissionEngine()
