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


def _anonymize_id(raw_id: Any) -> str:
    """Anonymizes user IDs or document IDs into a salted SHA256 truncated hash."""
    if not raw_id:
        return "anon_" + uuid.uuid4().hex[:8]
    val = f"helpotron_salt_{raw_id}"
    return "usr_" + hashlib.sha256(val.encode("utf-8")).hexdigest()[:12]


class DataLakeManager:
    """Handles structured I/O for telemetry, user feedback, and training artifacts."""

    def __init__(self) -> None:
        _ensure_directories()
        self.telemetry_file = TELEMETRY_DIR / "operational_events.jsonl"
        self.feedback_file = FEEDBACK_DIR / "user_feedback.jsonl"
        self.insights_file = INSIGHTS_DIR / "latest_insights.json"

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


class DataLakeIntelligenceAgent:
    """Autonomous agent that analyzes telemetry and feedback to produce system insights."""

    def __init__(self, manager: Optional[DataLakeManager] = None) -> None:
        self.manager = manager or DataLakeManager()

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
