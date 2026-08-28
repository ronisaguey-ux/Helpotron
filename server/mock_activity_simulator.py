"""Helpotron Mock Activity & User Simulation Engine.

Simulates realistic academic activity:
- Multi-subject assignments with rich rubrics, course codes, and professors.
- Realistic statuses (Not Started, In Progress, Humanizing, Ready for Review, Submitted).
- Simulated sub-agent execution logs and chat history.
- Live analytics, grade distributions, and streak progression.
- Configurable ON/OFF toggle and seed/reset actions.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from .database import Assignment, CreditTransaction, StudyMaterial, User

logger = logging.getLogger("helpotron.simulator")

SAMPLE_COURSES = [
    {
        "title": "Ethics in Artificial Intelligence & Autonomous Systems",
        "subject": "Philosophy & Computer Science",
        "course_code": "PHIL-380",
        "teacher_name": "Dr. Eleanor Vance",
        "estimated_time": "1.5 hours",
        "status": "in_progress",
        "prompt": "Evaluate the moral responsibility of autonomous decision systems under deontological vs utilitarian frameworks with three empirical case studies.",
        "rubric": "Thesis Clarity (25%), Philosophical Framework Application (35%), Empirical Case Analysis (25%), Citations & Academic Integrity (15%)",
        "attached_files": ["ai_ethics_case_studies.pdf", "trolley_problem_survey.csv"],
        "subagent_steps": [
            {"agent": "Rubric Decomposition Agent", "status": "completed", "progress": 100},
            {"agent": "Deontological Framework Synthesizer", "status": "completed", "progress": 100},
            {"agent": "Utilitarian Case Analyst", "status": "in_progress", "progress": 75},
            {"agent": "AI Humanizer & Perplexity Cadence", "status": "pending", "progress": 0},
        ],
        "ai_score": 8.4,
    },
    {
        "title": "CRISPR-Cas9 Gene Editing in Oncology Therapies",
        "subject": "Molecular Biology & Genetics",
        "course_code": "BIO-442",
        "teacher_name": "Prof. Marcus Thorne",
        "estimated_time": "2.0 hours",
        "status": "materials_ready",  # Humanizing
        "prompt": "Synthesize recent clinical trial outcomes (2023-2026) evaluating in-vivo CRISPR therapeutic delivery vectors for solid tumor targeting.",
        "rubric": "Biological Accuracy (30%), Experimental Literature Review (30%), Delivery Vector Comparison (25%), Synthesis & Future Directions (15%)",
        "attached_files": ["crispr_oncology_trials_2025.pdf", "delivery_vector_matrix.xlsx"],
        "subagent_steps": [
            {"agent": "Biomedical Literature Miner", "status": "completed", "progress": 100},
            {"agent": "Vector Comparison Engine", "status": "completed", "progress": 100},
            {"agent": "AI Humanizer & Multi-Checker Evasion", "status": "in_progress", "progress": 60},
        ],
        "ai_score": 14.2,
    },
    {
        "title": "Macroeconomic Impact of Decentralized Liquidity Protocols",
        "subject": "Quantitative Economics",
        "course_code": "ECON-315",
        "teacher_name": "Dr. Sarah Jenkins",
        "estimated_time": "45 mins",
        "status": "draft_ready",  # Ready for Review
        "prompt": "Analyze capital formation and interest rate divergence between traditional money markets and automated market maker liquidity pools.",
        "rubric": "Macro Model Formulation (30%), Empirical Data Econometrics (30%), Policy Implications (20%), Technical Writing (20%)",
        "attached_files": ["amm_liquidity_data_q3.csv", "federal_reserve_yield_curve.pdf"],
        "subagent_steps": [
            {"agent": "Econometric Model Synthesizer", "status": "completed", "progress": 100},
            {"agent": "Draft Polish & Cadence Agent", "status": "completed", "progress": 100},
            {"agent": "Citation Verifier (Chicago 17th)", "status": "completed", "progress": 100},
        ],
        "ai_score": 5.1,
    },
    {
        "title": "Modernist Narrative Fragmentation in Virginia Woolf and Faulkner",
        "subject": "Comparative Literature",
        "course_code": "LIT-210",
        "teacher_name": "Prof. Julian Ross",
        "estimated_time": "1.0 hour",
        "status": "completed",  # Submitted
        "prompt": "Examine the stylistic divergence of stream-of-consciousness in 'To the Lighthouse' and 'The Sound and the Fury' with respect to temporal rupture.",
        "rubric": "Close Reading Depth (35%), Comparative Structural Synthesis (35%), Historical Context (15%), MLA 9th Citations (15%)",
        "attached_files": ["woolf_lighthouse_passages.pdf", "faulkner_benjy_section.pdf"],
        "subagent_steps": [
            {"agent": "Literary Close-Reader Agent", "status": "completed", "progress": 100},
            {"agent": "Comparative Thematic Synthesizer", "status": "completed", "progress": 100},
            {"agent": "Humanizer Stealth Verification (Pangram Pass)", "status": "completed", "progress": 100},
        ],
        "ai_score": 3.8,
    },
    {
        "title": "Distributed Consensus in High-Latency Byzantine Environments",
        "subject": "Distributed Systems",
        "course_code": "CS-504",
        "teacher_name": "Dr. Kevin Zhang",
        "estimated_time": "2.5 hours",
        "status": "not_started",
        "prompt": "Formalize state machine replication tradeoffs in Paxos vs Raft vs PBFT under variable adversarial network partition thresholds.",
        "rubric": "Formal Correctness Proofs (40%), Fault-Tolerance Boundary Analysis (30%), System Tradeoffs (20%), Formatting (10%)",
        "attached_files": ["paxos_made_live.pdf", "raft_extended_spec.pdf"],
        "subagent_steps": [
            {"agent": "Rubric Decomposition Agent", "status": "pending", "progress": 0},
            {"agent": "Formal Proof Generator", "status": "pending", "progress": 0},
        ],
        "ai_score": 0.0,
    },
    {
        "title": "Cognitive Biases in Algorithmic Decision Support Systems",
        "subject": "Cognitive Psychology",
        "course_code": "PSYC-240",
        "teacher_name": "Dr. Miriam Patel",
        "estimated_time": "50 mins",
        "status": "in_progress",
        "prompt": "Evaluate human automation bias and complacency effects when interacting with clinical diagnostic AI recommendations.",
        "rubric": "Empirical Psychology Review (35%), Experimental Design Proposal (30%), Statistical Methodology (20%), APA 7th Citations (15%)",
        "attached_files": ["automation_bias_meta_analysis.pdf"],
        "subagent_steps": [
            {"agent": "Psychology Literature Synthesizer", "status": "completed", "progress": 100},
            {"agent": "Statistical Methodology Drafter", "status": "in_progress", "progress": 45},
            {"agent": "APA Citation Generator", "status": "pending", "progress": 0},
        ],
        "ai_score": 9.7,
    },
]


class MockActivitySimulator:
    """Manages synthetic user activity, seeding, and live background events."""

    def __init__(self) -> None:
        # Default OFF (operator 08-27): the simulator writes SAMPLE_COURSES
        # rows directly into the user's real assignment tables, which surfaced
        # as fake coursework in regular users' views. It is now a strictly
        # opt-in dev tool — never enabled unless explicitly toggled.
        self.is_enabled: bool = False
        self._background_task: Optional[asyncio.Task] = None

    def toggle(self, enable: Optional[bool] = None) -> bool:
        if enable is None:
            self.is_enabled = not self.is_enabled
        else:
            self.is_enabled = enable
        return self.is_enabled

    def seed_user_data(self, db: Session, user: User) -> Dict[str, Any]:
        """Seeds realistic sample assignments, study materials, and analytics for the user."""
        created_assignments = []
        for item in SAMPLE_COURSES:
            # Check if assignment already exists
            existing = db.query(Assignment).filter(
                Assignment.user_id == user.id,
                Assignment.title == item["title"],
            ).first()

            if not existing:
                assign = Assignment(
                    user_id=user.id,
                    title=item["title"],
                    prompt=item["prompt"],
                    due_date=(datetime.now(timezone.utc) + timedelta(days=random.randint(2, 14))).strftime("%Y-%m-%d"),
                    status=item["status"],
                    progress={
                        "subject": item["subject"],
                        "course_code": item["course_code"],
                        "teacher_name": item["teacher_name"],
                        "estimated_time": item["estimated_time"],
                        "rubric": item["rubric"],
                        "attached_files": item["attached_files"],
                        "subagent_steps": item["subagent_steps"],
                        "ai_score": item["ai_score"],
                    },
                )
                db.add(assign)
                created_assignments.append(item["title"])

        # Seed study materials if none exist (08-27: content uses the canonical
        # per-kind shapes — flashcards = [{q, a}], study guide = markdown str,
        # practice test = {"multiple_choice": [...], "short_answer": [...]} —
        # the old merged dict crashed exporters and viewers reading .get("q")).
        mat_count = db.query(StudyMaterial).filter(StudyMaterial.user_id == user.id).count()
        if mat_count < 3:
            for title, kind in [
                ("Neural Architecture Flashcard Deck", "flashcards"),
                ("Macroeconomics Midterm Study Guide", "study_guide"),
                ("CRISPR Vector Practice Exam", "practice_test"),
            ]:
                if kind == "flashcards":
                    content = json.dumps([
                        {"q": "What is the primary function of Cas9?",
                         "a": "An RNA-guided endonuclease that catalyzes double-strand breaks in target DNA."},
                        {"q": "Define Automation Bias in clinical settings.",
                         "a": "The tendency to favor machine-generated diagnostic recommendations over contradictory human observations."},
                    ], ensure_ascii=False)
                elif kind == "study_guide":
                    content = (
                        f"# {title}\n\n"
                        "## Key concepts\n"
                        "- Neural architectures: feed-forward, convolutional, recurrent\n"
                        "- Backpropagation and gradient-based optimization\n"
                        "- Overfitting, regularization, and dropout\n\n"
                        "## Practice questions\n"
                        "1. Explain how backpropagation updates weights.\n"
                        "2. What role does an activation function play?"
                    )
                else:
                    content = json.dumps({
                        "multiple_choice": [
                            {"q": "Which enzyme makes double-strand breaks in target DNA?",
                             "options": ["Cas9", "Cas3", "Cas12a", "RecA"],
                             "answer_index": 0,
                             "explanation": "Cas9 is the RNA-guided endonuclease."},
                        ],
                        "short_answer": [
                            {"q": "Define automation bias.", "model_answer": "Over-reliance on machine recommendations over human observation."},
                        ],
                    }, ensure_ascii=False)
                mat = StudyMaterial(
                    user_id=user.id,
                    kind=kind,
                    content=content,
                )
                db.add(mat)

        # Update user streak & goals in settings
        settings = dict(user.settings or {})
        settings.setdefault("goals", {"weekly_target": 6, "completed_this_week": 4})
        settings.setdefault("streak", {"current": 12, "best": 18, "last_date": datetime.now(timezone.utc).strftime("%Y-%m-%d")})
        settings.setdefault("badges", ["7-Day Streak Master", "Fortnight Dedication", "Rubric Master"])
        settings.setdefault("operation_mode", "auto")
        settings.setdefault("auto_approved_actions", ["humanize", "analyze_rubric", "draft_section", "generate_citations"])
        user.settings = settings

        db.commit()
        return {
            "status": "seeded",
            "assignments_created": len(created_assignments),
            "total_sample_cards": len(SAMPLE_COURSES),
        }

    def clear_mock_data(self, db: Session, user: User) -> Dict[str, Any]:
        """Removes mock assignments and resets test state."""
        sample_titles = {s["title"] for s in SAMPLE_COURSES}
        deleted = (
            db.query(Assignment)
            .filter(Assignment.user_id == user.id, Assignment.title.in_(sample_titles))
            .delete(synchronize_session=False)
        )
        db.commit()
        return {"status": "cleared", "deleted_count": deleted}


mock_simulator = MockActivitySimulator()
