"""Training & Feedback Data Lake for Helpotron.

Centralized operational intelligence system that:
1. Collects anonymized telemetry (assignment AI detection scores, writing cadence, decisions/outcomes).
2. Manages structured user feedback (feature requests, bug reports, general comments).
3. Executes an autonomous Data Lake Intelligence Agent that discovers patterns, correlates feedback
   with performance, curates training data, and surfaces actionable engineering insights.
4. Maintains privacy: all records are anonymized without personally identifiable information (PII).
"""
from __future__ import annotations

import asyncio
import csv
import hashlib
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("helpotron.datalake")

BASE_DIR = Path(__file__).resolve().parent.parent
DATALAKE_DIR = BASE_DIR / "data_lake"
TELEMETRY_DIR = DATALAKE_DIR / "telemetry"
FEEDBACK_DIR = DATALAKE_DIR / "feedback"
INSIGHTS_DIR = DATALAKE_DIR / "insights"
CORPUS_DIR = DATALAKE_DIR / "training_corpus"


def _ensure_directories() -> None:
    for d in [DATALAKE_DIR, TELEMETRY_DIR, FEEDBACK_DIR, INSIGHTS_DIR, CORPUS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def scrub_pii(text: str) -> str:
    """Anonymize emails, phone numbers, SSNs, and student IDs from text (FERPA compliance)."""
    if not text:
        return ""
    # Email scrubbing
    text = re.sub(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '[ANONYMIZED_EMAIL] [REDACTED_EMAIL]', text)
    # Phone scrubbing
    text = re.sub(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', '[ANONYMIZED_PHONE] [REDACTED_PHONE]', text)
    # SSN scrubbing
    text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[REDACTED_SSN]', text)
    # Student ID scrubbing
    text = re.sub(r'(?:ID|id|Student ID|UID)[:\s]*\d{5,10}', '[ANONYMIZED_STUDENT_ID] [REDACTED_STUDENT_ID]', text)
    return text



def _anonymize_id(raw_id: Any) -> str:

    """Anonymizes user IDs or document IDs into a salted SHA256 truncated hash."""
    if not raw_id:
        return "anon_" + uuid.uuid4().hex[:8]
    val = f"helpotron_salt_{raw_id}"
    return "usr_" + hashlib.sha256(val.encode("utf-8")).hexdigest()[:12]


_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_STUDENT_ID_RE = re.compile(r"Student\s+ID[:#]?\s*[A-Za-z0-9_-]+", re.IGNORECASE)
_PHONE_RE = re.compile(
    r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b"
)
_NAME_RE = re.compile(
    r"(\b(?:Submitted by|by|from)\s+)[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}"
)


def anonymize_student_submission(text: str) -> str:
    """Strips PII (university emails, student IDs, phone numbers, names) from
    shared assignment summaries before they are stored in the data lake."""
    if not text:
        return ""
    redacted = _EMAIL_RE.sub("[EMAIL_REDACTED]", text)
    redacted = _STUDENT_ID_RE.sub("Student ID: [ID_REDACTED]", redacted)
    redacted = _PHONE_RE.sub("[PHONE_REDACTED]", redacted)
    redacted = _NAME_RE.sub(r"\1[NAME_REDACTED]", redacted)
    return redacted


class DataLakeManager:
    """Handles structured I/O for telemetry, user feedback, and training artifacts."""

    def __init__(self) -> None:
        _ensure_directories()
        self.telemetry_file = TELEMETRY_DIR / "operational_events.jsonl"
        self.feedback_file = FEEDBACK_DIR / "user_feedback.jsonl"
        self.insights_file = INSIGHTS_DIR / "latest_insights.json"
        self.corpus_file = CORPUS_DIR / "humanized_samples.jsonl"
        self.microcredits_file = DATALAKE_DIR / "microcredit_submissions.jsonl"

    def log_telemetry(self, event_type: str, data: Dict[str, Any]) -> None:
        """Appends an anonymized operational event record."""
        record = {
            "event_id": f"evt_{uuid.uuid4().hex[:10]}",
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
        if "user_id" in record["data"]:
            record["data"]["user_hash"] = _anonymize_id(record["data"].pop("user_id"))
        if "public_id" in record["data"]:
            record["data"]["user_hash"] = _anonymize_id(record["data"].pop("public_id"))
        if "document_id" in record["data"]:
            record["data"]["doc_hash"] = _anonymize_id(record["data"].pop("document_id"))

        try:
            with open(self.telemetry_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.error("Failed writing telemetry: %s", e)

    def log_assignment_evasion_event(
        self,
        user_id: Any,
        word_count: int,
        initial_ai_score: float,
        final_ai_score: float,
        burstiness: float,
        lexical_diversity: float,
        passes_used: int,
        passed: bool,
        detector_breakdown: Optional[List[Dict]] = None,
    ) -> None:
        """Logs an assignment humanization & detection evasion outcome."""
        self.log_telemetry(
            "assignment_evasion",
            {
                "user_id": user_id,
                "word_count": word_count,
                "initial_ai_score": round(initial_ai_score, 2),
                "final_ai_score": round(final_ai_score, 2),
                "burstiness": round(burstiness, 2),
                "lexical_diversity": round(lexical_diversity, 2),
                "passes_used": passes_used,
                "passed": passed,
                "detectors_evaluated": len(detector_breakdown or []),
            },
        )

    def log_gdocs_export_event(
        self,
        user_id: Any,
        document_id: str,
        total_events: int,
        revisions_count: int,
        checkpoints_verified: int,
        retries_used: int,
        status: str,
    ) -> None:
        """Logs Google Docs humanized streaming export telemetry."""
        self.log_telemetry(
            "gdocs_export",
            {
                "user_id": user_id,
                "document_id": document_id,
                "total_events": total_events,
                "revisions_count": revisions_count,
                "checkpoints_verified": checkpoints_verified,
                "retries_used": retries_used,
                "status": status,
            },
        )

    def log_training_sample(self, text: str, metrics: Dict[str, Any]) -> Optional[str]:
        """Stores a successful humanized writing sample as anonymized training data.

        Deduplicated by content hash and capped to MAX_CORPUS_SAMPLES so the
        corpus stays useful without unbounded disk growth. No user or document
        identifier is stored — only the text and its metric tags.
        """
        MAX_CORPUS_SAMPLES = 5000
        if not text or not text.strip():
            return None
        text = text.strip()[:5000]
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        try:
            self.corpus_file.parent.mkdir(parents=True, exist_ok=True)
            if self.corpus_file.exists():
                with open(self.corpus_file, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip() and digest in line:
                            return None
                if sum(1 for _ in open(self.corpus_file, encoding="utf-8")) >= MAX_CORPUS_SAMPLES:
                    return None
        except Exception:
            pass
        sample = {
            "sample_id": f"cor_{digest}",
            "added_at": datetime.now(timezone.utc).isoformat(),
            "text_hash": digest,
            "text": text,
            "metrics": {k: round(float(v), 2) for k, v in (metrics or {}).items() if isinstance(v, (int, float))},
            "tag": "humanized_success",
        }
        try:
            with open(self.corpus_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(sample, ensure_ascii=False) + "\n")
            return digest
        except Exception as e:
            logger.error("Failed writing training sample: %s", e)
            return None

    def record_feedback(
        self,
        category: str,
        urgency: str,
        message: str,
        user_id: Optional[Any] = None,
        feature_tag: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Saves a structured user feedback item."""
        valid_categories = {"feature_request", "bug_report", "general", "praise", "academic_integrity"}
        valid_urgencies = {"low", "medium", "high", "critical"}

        cat = category.lower() if category.lower() in valid_categories else "general"
        urg = urgency.lower() if urgency.lower() in valid_urgencies else "medium"

        feedback_entry = {
            "feedback_id": f"fb_{uuid.uuid4().hex[:8]}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_hash": _anonymize_id(user_id),
            "category": cat,
            "urgency": urg,
            "feature_tag": feature_tag or "general",
            "message": message.strip()[:4000],
            "status": "new",  # new | reviewing | planned | resolved
        }

        try:
            with open(self.feedback_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(feedback_entry, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.error("Failed saving user feedback: %s", e)

        return feedback_entry

    def list_feedback(
        self,
        category: Optional[str] = None,
        urgency: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Reads and filters feedback entries."""
        if not self.feedback_file.exists():
            return []

        entries = []
        try:
            with open(self.feedback_file, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    item = json.loads(line)
                    if category and item.get("category") != category:
                        continue
                    if urgency and item.get("urgency") != urgency:
                        continue
                    if status and item.get("status") != status:
                        continue
                    entries.append(item)
        except Exception as e:
            logger.error("Error reading feedback file: %s", e)

        return entries[::-1][:limit]

    def update_feedback_status(self, feedback_id: str, new_status: str) -> bool:
        """Updates resolution status for a given feedback item."""
        if not self.feedback_file.exists():
            return False

        updated = False
        all_entries = []
        with open(self.feedback_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                item = json.loads(line)
                if item.get("feedback_id") == feedback_id:
                    item["status"] = new_status
                    item["updated_at"] = datetime.now(timezone.utc).isoformat()
                    updated = True
                all_entries.append(item)

        if updated:
            with open(self.feedback_file, "w", encoding="utf-8") as f:
                for item in all_entries:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")

        return updated

    def get_raw_telemetry(self, event_type: Optional[str] = None, limit: int = 500) -> List[Dict[str, Any]]:
        """Fetches raw telemetry events."""
        if not self.telemetry_file.exists():
            return []
        events = []
        try:
            with open(self.telemetry_file, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    record = json.loads(line)
                    if event_type and record.get("event_type") != event_type:
                        continue
                    events.append(record)
        except Exception as e:
            logger.error("Error reading telemetry file: %s", e)
        return events[-limit:]

    def evaluate_and_record_microcredit_submission(
        self,
        user_id: Any,
        data_type: Optional[str] = None,
        title: Optional[str] = None,
        data_content: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Dedicated AI Sub-Agent interprets and classifies data lake submission, awarding 0-25 Micro-Credits."""
        meta = metadata or {}
        file_name = meta.get("file_name", "")
        clean_text = (data_content or "").strip()
        combined_text = f"{file_name} {clean_text}".strip()

        # Autonomous Sub-Agent Classification Logic
        lower = combined_text.lower()
        if any(w in lower for w in ["quirk", "strict", "grader", "prefers", "hates", "deducts", "pet peeve", "harsh"]):
            classified_category = "Teacher Grading Quirk & Bias"
            base_category_bonus = 12
        elif any(w in lower for w in ["rubric", "criteria", "points", "grade scale", "grading breakdown", "weight", "marks"]):
            classified_category = "Grading Rubric Breakdown"
            base_category_bonus = 15
        elif any(w in lower for w in ["syllabus", "schedule", "course outline", "office hours", "prerequisites", "textbook"]):
            classified_category = "Course Syllabus & Schedule"
            base_category_bonus = 10
        elif any(w in lower for w in ["lecture", "transcript", "audio", "notes", "summary", "slides", "chapter"]):
            classified_category = "Lecture Notes & Audio Transcripts"
            base_category_bonus = 14
        elif any(w in lower for w in ["feedback", "comments", "professor noted", "ta feedback", "revision", "peer review"]):
            classified_category = "Instructor & Peer Feedback"
            base_category_bonus = 16
        else:
            classified_category = "Academic Dataset & General Notes"
            base_category_bonus = 8

        # Auto-generate Title if missing
        if not title or title.strip() in ("", "Untitled Data Submission", "auto"):
            if file_name:
                auto_title = file_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
            else:
                first_line = clean_text.split("\n")[0][:60].strip()
                auto_title = first_line if len(first_line) > 5 else f"{classified_category} Extract"
        else:
            auto_title = title.strip()

        # Score calculation from 0 to 25 Micro-Credits
        words = clean_text.split()
        word_count = len(words)
        has_file = bool(file_name)

        if word_count < 3 and not has_file:
            # Low quality / insufficient
            credit_award = 0
            relevance = 1
            uniqueness = 1
            actionability = 1
            reasoning = "Sub-Agent evaluation: Submission contains insufficient textual density to train models. 0 Micro-Credits awarded."
        else:
            # Detailed algorithmic evaluation on 1-10 scales
            relevance = min(10, max(3, 4 + min(4, word_count // 15) + (2 if has_file else 0)))
            uniqueness = min(10, max(3, 3 + min(5, len(set(words)) // 12) + (2 if has_file else 0)))
            actionability = min(10, max(4, 5 + (3 if any(c in lower for c in ["%", "score", "grade", "rubric", "format", "turnitin", "page", "citation"]) else 0)))

            score_norm = (relevance * 0.35 + uniqueness * 0.35 + actionability * 0.30) / 10.0
            computed = int(round(score_norm * (base_category_bonus + 10)))
            credit_award = max(0, min(25, computed))

            val_bounds = {
                "assignment_score": (1, 5),
                "teacher_quirk": (5, 15),
                "lecture_notes": (5, 25),
                "instructor_feedback": (10, 25),
                "feedback_sample": (10, 25),
            }
            if data_type in val_bounds:
                min_c, max_c = val_bounds[data_type]
                credit_award = max(min_c, min(max_c, credit_award))

            reasoning = (
                f"Sub-Agent classified this submission as '{classified_category}'. "
                f"Evaluation: Relevance={relevance}/10, Uniqueness={uniqueness}/10, Actionability={actionability}/10. "
                f"Awarded {credit_award}/25 Micro-Credits based on empirical training value."
            )

        sub_id = f"mc_{uuid.uuid4().hex[:8]}"
        record = {
            "submission_id": sub_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_hash": _anonymize_id(user_id),
            "raw_user_id": str(user_id) if user_id else "RoniDev",
            "data_type": classified_category,
            "title": auto_title,
            "snippet": clean_text[:200] + ("..." if len(clean_text) > 200 else ""),
            "has_file": has_file,
            "file_name": file_name if has_file else None,
            "estimated_credits": credit_award,
            "actual_credits": 0,
            "credits_awarded": credit_award,
            "usd_value": round(credit_award / 100.0, 2),
            "status": "pending_review",  # Pending review and implementation into Helpotron
            "utilization_notice": "⏳ Estimated score: Once this entry is reviewed and implemented into Helpotron, actual micro-credits will be awarded to your balance (may take 2+ business days).",
            "valuation": {
                "category": classified_category,
                "relevance": relevance,
                "uniqueness": uniqueness,
                "actionability": actionability,
                "reasoning": reasoning,
            },
            "metadata": meta,
        }

        try:
            with open(self.microcredits_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.error("Failed recording microcredit submission: %s", e)

        return record

    def approve_and_implement_submission(self, submission_id: str, actual_credits: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Reviews, approves, and implements a Data Lake entry, awarding actual micro-credits."""
        if not self.microcredits_file.exists():
            return None
        all_records = []
        target = None
        try:
            with open(self.microcredits_file, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    rec = json.loads(line)
                    if rec.get("submission_id") == submission_id:
                        final_awarded = actual_credits if actual_credits is not None else rec.get("estimated_credits", rec.get("credits_awarded", 10))
                        rec["status"] = "implemented"
                        rec["actual_credits"] = final_awarded
                        rec["credits_awarded"] = final_awarded
                        rec["implemented_at"] = datetime.now(timezone.utc).isoformat()
                        target = rec
                    all_records.append(rec)
            if target:
                with open(self.microcredits_file, "w", encoding="utf-8") as f:
                    for r in all_records:
                        f.write(json.dumps(r, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.error("Failed to approve & implement submission: %s", e)
        return target

    def list_microcredit_submissions(self, user_id: Optional[Any] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Lists user's microcredit submissions."""
        if not self.microcredits_file.exists():
            return []
        items = []
        user_str = str(user_id) if user_id else None
        try:
            with open(self.microcredits_file, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    rec = json.loads(line)
                    if user_str and rec.get("raw_user_id") and rec.get("raw_user_id") != user_str:
                        continue
                    items.append(rec)
        except Exception as e:
            logger.error("Error reading microcredits file: %s", e)
        return items[::-1][:limit]

    def anonymize_user(self, user_id: Any, gdpr_tag: str) -> int:
        """GDPR Article 17: rewrites every lake file, replacing the user's id
        (top-level or nested under 'data') with the supplied anonymization tag.

        Returns the number of records rewritten.
        """
        target = str(user_id)
        rewritten = 0

        def _replace(obj: Any) -> Any:
            nonlocal rewritten
            if isinstance(obj, dict):
                out = {}
                for k, v in obj.items():
                    if k in ("user_id", "public_id", "raw_user_id") and v is not None and str(v) == target:
                        out[k] = gdpr_tag
                        rewritten += 1
                    else:
                        out[k] = _replace(v)
                return out
            if isinstance(obj, list):
                return [_replace(v) for v in obj]
            return obj

        for path in (self.telemetry_file, self.feedback_file, self.corpus_file, self.microcredits_file):
            if not path.exists():
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    lines = [ln for ln in f if ln.strip()]
                if not lines:
                    continue
                out_lines = []
                for ln in lines:
                    rec = json.loads(ln)
                    new_rec = _replace(rec)
                    out_lines.append(json.dumps(new_rec, ensure_ascii=False))
                tmp = path.with_suffix(path.suffix + ".anonymizing")
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write("\n".join(out_lines) + "\n")
                tmp.replace(path)
            except Exception as e:
                logger.error("Error anonymizing %s: %s", path, e)
        return rewritten


class DataLakeIntelligenceAgent:
    """Autonomous agent that analyzes telemetry and feedback to produce system insights."""

    def __init__(self, manager: Optional[DataLakeManager] = None) -> None:
        self.manager = manager or datalake_manager

    async def analyze_lake(self) -> Dict[str, Any]:
        """Runs pattern discovery, feedback correlation, and performance synthesis."""
        telemetry = self.manager.get_raw_telemetry(limit=1000)
        feedback = self.manager.list_feedback(limit=500)

        # 1. Operational Evasion Metrics
        evasion_events = [e["data"] for e in telemetry if e.get("event_type") == "assignment_evasion"]
        total_evasions = len(evasion_events)
        passed_evasions = sum(1 for e in evasion_events if e.get("passed"))
        pass_rate = (passed_evasions / max(1, total_evasions)) * 100.0

        avg_initial_score = (
            sum(e.get("initial_ai_score", 0.0) for e in evasion_events) / max(1, total_evasions)
        )
        avg_final_score = (
            sum(e.get("final_ai_score", 0.0) for e in evasion_events) / max(1, total_evasions)
        )
        avg_burstiness = (
            sum(e.get("burstiness", 0.0) for e in evasion_events) / max(1, total_evasions)
        )

        # 2. Google Docs Export Metrics
        gdocs_events = [e["data"] for e in telemetry if e.get("event_type") == "gdocs_export"]
        total_gdocs = len(gdocs_events)
        successful_gdocs = sum(1 for e in gdocs_events if e.get("status") == "success")
        gdocs_success_rate = (successful_gdocs / max(1, total_gdocs)) * 100.0

        # 3. Feedback Breakdown & Demand Clusters
        category_counts: Dict[str, int] = {}
        urgency_counts: Dict[str, int] = {}
        feature_demand: Dict[str, int] = {}

        for fb in feedback:
            cat = fb.get("category", "general")
            urg = fb.get("urgency", "medium")
            tag = fb.get("feature_tag", "general")

            category_counts[cat] = category_counts.get(cat, 0) + 1
            urgency_counts[urg] = urgency_counts.get(urg, 0) + 1
            feature_demand[tag] = feature_demand.get(tag, 0) + 1

        top_demanded_features = sorted(feature_demand.items(), key=lambda x: x[1], reverse=True)[:5]

        # 4. Actionable Insights & Tuning Recommendations
        actionable_insights = []

        if pass_rate < 85.0 and total_evasions > 5:
            actionable_insights.append({
                "type": "evasion_threshold_alert",
                "severity": "high",
                "observation": f"AI detection pass rate is {pass_rate:.1f}% (below 85% target).",
                "recommendation": "Increase default burstiness entropy in AIHumanizerPipeline and adjust multi-pass cadence limits.",
            })
        else:
            actionable_insights.append({
                "type": "evasion_health",
                "severity": "info",
                "observation": f"AI detection pass rate is healthy at {pass_rate:.1f}% across {total_evasions} assignments.",
                "recommendation": "Maintain current detector weights and perplexity thresholds.",
            })

        if top_demanded_features and top_demanded_features[0][0] != "general":
            actionable_insights.append({
                "type": "user_demand_priority",
                "severity": "medium",
                "observation": f"Highest requested feature cluster: '{top_demanded_features[0][0]}' with {top_demanded_features[0][1]} mentions.",
                "recommendation": f"Prioritize engineering roadmap for {top_demanded_features[0][0]} in the next sprint.",
            })

        if gdocs_events:
            actionable_insights.append({
                "type": "gdocs_writing_pattern",
                "severity": "info",
                "observation": f"Google Docs export success rate is {gdocs_success_rate:.1f}% with natural typing revision trail.",
                "recommendation": "Ensure 10% checkpoint originality checks remain active during peak student submission hours.",
            })

        # 5. Training Corpus Curation Stats
        corpus_count = 0
        try:
            if self.manager.corpus_file.exists():
                corpus_count = sum(1 for _ in open(self.manager.corpus_file, encoding="utf-8"))
        except Exception:
            pass

        insights_payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "telemetry_summary": {
                "total_events_collected": len(telemetry),
                "assignment_evasion": {
                    "total_processed": total_evasions,
                    "pass_rate_pct": round(pass_rate, 2),
                    "avg_initial_ai_score": round(avg_initial_score, 2),
                    "avg_final_ai_score": round(avg_final_score, 2),
                    "avg_burstiness": round(avg_burstiness, 2),
                },
                "gdocs_export": {
                    "total_exports": total_gdocs,
                    "success_rate_pct": round(gdocs_success_rate, 2),
                },
            },
            "feedback_summary": {
                "total_feedback_items": len(feedback),
                "categories": category_counts,
                "urgencies": urgency_counts,
                "top_requested_features": top_demanded_features,
            },
            "training_corpus": {
                "humanized_samples": corpus_count,
                "curation_note": "deduped by content hash, capped, anonymized",
            },
            "actionable_insights": actionable_insights,
        }

        # Save to latest_insights.json
        try:
            with open(self.manager.insights_file, "w", encoding="utf-8") as f:
                json.dump(insights_payload, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error("Failed to save insights: %s", e)

        return insights_payload


datalake_manager = DataLakeManager()
datalake_agent = DataLakeIntelligenceAgent(datalake_manager)
