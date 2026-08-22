"""Assignment orchestrator — spawns subagents to complete assignments.

When a new assignment is scraped and transcribed, the orchestrator kicks off
a workflow: it analyzes the assignment, breaks it into tasks, spawns subagents
for each task, monitors progress, runs AI detectors on the final output, and
notifies the user via Telegram when done.

Dashboard shows assignment boxes with status, estimated time, and a message
channel to the team.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import threading
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

from sqlalchemy.orm import Session

from . import detectors, llm, study_tools
from .config import config
from .database import Assignment, Transcript, User, SessionLocal, get_db
from .draft import get_style, set_style, MAX_RETRIES, DRAFT_COST
from .subagents import SubAgentCoordinator

logger = logging.getLogger("helpotron.orchestrator")

subagent_coordinator = SubAgentCoordinator()

# In-memory status tracking for real-time dashboard updates
assignment_status: Dict[int, Dict] = {}

class AssignmentWorkflow:
    """Manages the end-to-end workflow for a single assignment."""

    def __init__(self, assignment_id: int, public_id: str):
        self.assignment_id = assignment_id
        self.public_id = public_id
        self.status = "pending"  # pending | analyzing | planning | executing | reviewing | done | failed
        self.tasks = []
        self.current_task_index = 0
        self.estimated_time_seconds = 0
        self.messages = []  # chat messages between student and team
        self.result_text = ""
        self.detector_results = []
        self.average_score = None
        self.passed = False
        self.started_at = time.time()
        self.updated_at = time.time()
        self.error = None

    def to_dict(self) -> Dict:
        return {
            "assignment_id": self.assignment_id,
            "status": self.status,
            "tasks": self.tasks,
            "current_task_index": self.current_task_index,
            "estimated_time_seconds": self.estimated_time_seconds,
            "messages": self.messages[-10:],  # last 10 messages
            "result_text": self.result_text[:500] if self.result_text else "",
            "detector_results": self.detector_results,
            "average_score": self.average_score,
            "passed": self.passed,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "error": self.error,
        }

    def add_message(self, sender: str, text: str):
        self.messages.append({"sender": sender, "text": text, "timestamp": time.time()})
        if len(self.messages) > 100:
            self.messages = self.messages[-100:]
        self.updated_at = time.time()


# Global registry of workflows
workflows: Dict[int, AssignmentWorkflow] = {}


def get_workflow(assignment_id: int) -> Optional[AssignmentWorkflow]:
    return workflows.get(assignment_id)


def start_assignment_workflow(assignment_id: int, public_id: str) -> AssignmentWorkflow:
    """Start a new workflow for an assignment."""
    workflow = AssignmentWorkflow(assignment_id, public_id)
    workflows[assignment_id] = workflow
    # Kick off background processing
    threading.Thread(target=run_workflow, args=(assignment_id,), daemon=True).start()
    return workflow


def run_workflow(assignment_id: int):
    """Background thread: run the full workflow."""
    asyncio.run(_run_workflow_async(assignment_id))


async def run_subagent_pipeline(assignment_id: int, prompt: str, rubric: str, context: str) -> Dict[str, Any]:
    """Runs specialized sub-agent decomposition and task execution."""
    tasks = await subagent_coordinator.decompose_rubric(prompt, rubric)
    sub_results = []
    for t in tasks:
        res = await subagent_coordinator.execute_subtask(t, context)
        sub_results.append(res)
    return {"assignment_id": assignment_id, "tasks_completed": len(sub_results), "results": sub_results}


async def _run_workflow_async(assignment_id: int):
    """Async workflow: analyze, plan, execute, review."""
    db = SessionLocal()
    try:
        assignment = db.get(Assignment, assignment_id)
        if not assignment:
            logger.error("Assignment %d not found", assignment_id)
            return
        workflow = workflows.get(assignment_id)
        if not workflow:
            return

        workflow.status = "analyzing"
        workflow.add_message("system", "Analyzing assignment...")
        # Step 1: Analyze the assignment prompt and transcript
        transcript = (
            db.query(Transcript)
            .filter(Transcript.assignment_id == assignment_id)
            .order_by(Transcript.id.desc())
            .first()
        )
        if not transcript:
            workflow.status = "failed"
            workflow.error = "No transcript found"
            workflow.add_message("system", "Error: no transcript available.")
            return

        # Step 2: Plan the tasks (break down into sub-tasks)
        workflow.status = "planning"
        workflow.add_message("system", "Planning tasks via subagent coordinator...")
        tasks = await plan_tasks(assignment.prompt, transcript.text)
        workflow.tasks = tasks
        workflow.estimated_time_seconds = sum(t.get("estimated_seconds", 60) for t in tasks)

        # Step 3: Execute tasks with subagents
        workflow.status = "executing"
        workflow.add_message("system", f"Executing {len(tasks)} tasks...")
        results = []
        for idx, task in enumerate(tasks):
            workflow.current_task_index = idx
            workflow.add_message("system", f"Working on task {idx+1}/{len(tasks)}: {task.get('name', 'unknown')}")
            try:
                style = get_style(assignment.user_id, db)
                if not style:
                    workflow.add_message("system", "No writing style uploaded; using default.")
                    style = "Write in a clear, academic style."
                draft_text, model = await generate_draft_for_task(
                    assignment.user_id,
                    assignment_id,
                    transcript.text,
                    assignment.prompt,
                    style
                )
                results.append({"task": task, "result": draft_text})
                workflow.add_message("system", f"Task {idx+1} completed.")
            except Exception as e:
                workflow.add_message("system", f"Task {idx+1} failed: {e}")
                logger.error("Task %d failed: %s", idx, e)
                workflow.status = "failed"
                workflow.error = str(e)
                return

        # Combine results into final output
        combined = "\n\n".join([r["result"] for r in results])
        workflow.result_text = combined

        # Step 4: Review with AI detectors
        workflow.status = "reviewing"
        workflow.add_message("system", "Running AI detectors...")
        avg_score, detector_results, passed = await detectors.score_text(combined, threshold=80.0)
        workflow.average_score = avg_score
        workflow.detector_results = [r.to_dict() for r in detector_results]
        workflow.passed = passed

        if passed:
            workflow.status = "done"
            workflow.add_message("system", f"✅ Assignment completed! Score: {avg_score:.1f}% passed detectors.")
            assignment.status = "completed"
            assignment.progress = {**assignment.progress, "orchestrator_done": True}
            db.commit()
            await notify_user_via_telegram(assignment.user_id, assignment.title, assignment.due_date or "No due date")
        else:
            workflow.status = "risky"
            workflow.add_message("system", f"⚠️ Assignment risky: score {avg_score:.1f}% below threshold. Student can retry or contact admin.")
            assignment.status = "draft_risky"
            assignment.progress = {**assignment.progress, "orchestrator_risky": True}
            db.commit()

    except Exception as e:
        logger.exception("Workflow failed for assignment %d", assignment_id)
        if assignment_id in workflows:
            workflows[assignment_id].status = "failed"
            workflows[assignment_id].error = str(e)
            workflows[assignment_id].add_message("system", f"Workflow failed: {e}")
    finally:
        db.close()


async def plan_tasks(prompt: str, transcript: str) -> List[Dict]:
    """Use LLM to break down assignment into sub-tasks."""
    system = "You are a task planner. Break down the given assignment into 3-5 logical sub-tasks. Return a JSON list of tasks, each with 'name', 'description', and 'estimated_seconds' (int)."
    user = f"Assignment prompt: {prompt}\nTranscript: {transcript[:2000]}"
    try:
        content = await llm.call_llm(system, user)  # remediation: call_llm returns str now
        parsed = llm.extract_json(content)
        if isinstance(parsed, list):
            return parsed
        elif isinstance(parsed, dict) and "tasks" in parsed:
            return parsed["tasks"]
    except Exception as e:
        logger.warning("Planning tasks exception: %s", e)
    return [
        {"name": "Understand the assignment", "description": "Read and comprehend the prompt and transcript.", "estimated_seconds": 30},
        {"name": "Research and gather key points", "description": "Extract key concepts and arguments.", "estimated_seconds": 60},
        {"name": "Write draft", "description": "Write the assignment draft.", "estimated_seconds": 120},
        {"name": "Review and edit", "description": "Check for clarity, grammar, and style.", "estimated_seconds": 60},
    ]


async def generate_draft_for_task(user_id: int, assignment_id: int, transcript_text: str, assignment_prompt: str, style_text: str) -> tuple[str, str]:
    from .draft import generate_draft as gen_draft
    return await gen_draft(user_id, assignment_id, transcript_text, assignment_prompt, style_text)


async def notify_user_via_telegram(user_id: int, title: str, due_date: str):
    logger.info("Telegram notification: Assignment '%s' completed. Due: %s", title, due_date)


def send_message_to_team(assignment_id: int, sender: str, text: str) -> bool:
    workflow = workflows.get(assignment_id)
    if not workflow:
        return False
    workflow.add_message(sender, text)
    return True


def get_assignment_status(assignment_id: int) -> Optional[Dict]:
    workflow = workflows.get(assignment_id)
    if workflow:
        return workflow.to_dict()
    return None
