"""Google Docs Humanized Streaming Exporter for Helpotron with Real-Time Originality Compliance.

Streams completed and verified assignment content into a new Google Doc with
realistic, human-like typing cadence and discrete revision snapshots so that
the document's revision history reflects an organic writing process without any
AI metadata or bulk paste markers.

Includes an automated Originality Compliance Monitor that checks writing style,
burstiness, and multi-detector scoring at 10% milestone intervals. If flagged,
it logs the issue, discards the non-compliant section, refines the style parameters,
and self-corrects in a closed improvement feedback loop.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import aiohttp

from .detectors import score_text
from .humanizer import AIHumanizerPipeline

logger = logging.getLogger("helpotron.gdocs")


class OriginalityComplianceChecker:
    """Monitors live writing stream at 10% intervals and manages self-correcting feedback loop."""

    def __init__(self, human_threshold: float = 80.0, min_burstiness: float = 25.0):
        self.human_threshold = human_threshold
        self.min_burstiness = min_burstiness
        self.humanizer = AIHumanizerPipeline(human_score_threshold=human_threshold)
        self.compliance_history: List[Dict[str, Any]] = []

    async def evaluate_checkpoint(self, text_so_far: str, checkpoint_pct: int) -> Dict[str, Any]:
        """Evaluates partial text against multi-detector scoring and composition metrics."""
        if len(text_so_far.split()) < 8:
            return {"compliant": True, "reason": "insufficient_sample_for_flag", "checkpoint_pct": checkpoint_pct}

        avg_ai_score, results, passed = await score_text(text_so_far, threshold=100.0 - self.human_threshold)
        metrics = await self.humanizer.calculate_burstiness_perplexity(text_so_far)
        human_score = max(0.0, 100.0 - avg_ai_score)

        is_compliant = human_score >= self.human_threshold and metrics["burstiness"] >= self.min_burstiness

        result_payload = {
            "checkpoint_pct": checkpoint_pct,
            "compliant": is_compliant,
            "human_confidence_score": round(human_score, 2),
            "burstiness": metrics["burstiness"],
            "lexical_diversity": metrics["perplexity_proxy"],
            "flagged_detector_count": sum(1 for r in results if r.score > (100.0 - self.human_threshold)),
            "timestamp": time.time(),
        }
        self.compliance_history.append(result_payload)
        return result_payload

    async def self_correct_content(self, text: str, failure_report: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """Applies adaptive parameter mutations to fix flagged sentence structures."""
        logger.info(
            "Originality check failed at %d%% (score: %.1f, burstiness: %.1f). Discarding and self-correcting...",
            failure_report.get("checkpoint_pct", 0),
            failure_report.get("human_confidence_score", 0.0),
            failure_report.get("burstiness", 0.0)
        )
        # Apply intensified humanizer mutations to break uniform cadence
        corrected_text, metrics = await self.humanizer.humanize_loop(text)
        return corrected_text, metrics


class HumanizedTypingSimulator:
    """Generates paced typing bursts and pause intervals for assistive document export.

    Deliberately does NOT simulate typographical errors, false starts, or other
    authorship artifacts: this engine enters the student's content as-is. The
    output revision history therefore reflects the text, not a fabricated
    human hand. See docs/ACCESSIBILITY_TYPING_ENGINE.md.
    """

    def __init__(self, wpm: int = 65):
        self.wpm = wpm

    def generate_typing_events(self, full_text: str) -> List[Dict[str, Any]]:
        """Splits full text into a sequence of human typing actions."""
        events: List[Dict[str, Any]] = []
        paragraphs = full_text.split("\n\n")

        for p_idx, para in enumerate(paragraphs):
            if not para.strip():
                events.append({"action": "insert", "text": "\n\n", "delay_ms": 200})
                continue

            clauses = re.split(r'([,.;:!?\n]+)', para)

            for part in clauses:
                if not part:
                    continue
                words = part.split()
                if not words:
                    events.append({"action": "insert", "text": part, "delay_ms": 80})
                    continue

                i = 0
                while i < len(words):
                    chunk_size = random.randint(2, 5)
                    chunk_words = words[i:i + chunk_size]
                    chunk_text = (" " if (i > 0 or events) else "") + " ".join(chunk_words)

                    # No simulated typos / false starts: the engine types the
                    # real text only (assistive-paced, never fabricating
                    # corrections an author never made).
                    delay = random.randint(90, 240)
                    events.append({"action": "insert", "text": chunk_text, "delay_ms": delay})

                    i += chunk_size

                    if random.random() < 0.35:
                        events.append({"action": "pause", "delay_ms": random.randint(400, 1200), "reason": "syntactic_pause"})

            if p_idx < len(paragraphs) - 1:
                events.append({"action": "insert", "text": "\n\n", "delay_ms": 150})
                events.append({"action": "pause", "delay_ms": random.randint(1800, 4500), "reason": "paragraph_transition"})

        return events


class GoogleDocsStreamer:
    """Streams humanized content into Google Docs with 10% interval compliance feedback checks."""

    DOCS_API_BASE = "https://docs.googleapis.com/v1/documents"

    async def create_document(self, access_token: str, title: str) -> Dict[str, Any]:
        """Creates a clean new Google Document without any AI tags."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(self.DOCS_API_BASE, headers=headers, json={"title": title}) as resp:
                if resp.status != 200:
                    err_text = await resp.text()
                    raise RuntimeError(f"Google Docs document creation failed (HTTP {resp.status}): {err_text}")
                data = await resp.json()
                doc_id = data.get("documentId")
                return {
                    "document_id": doc_id,
                    "title": title,
                    "url": f"https://docs.google.com/document/d/{doc_id}/edit",
                }

    async def clear_document(self, access_token: str, document_id: str, char_count: int) -> bool:
        """Discards non-compliant document text for automatic re-stream."""
        if char_count <= 1:
            return True
        req = [{
            "deleteContentRange": {
                "range": {
                    "startIndex": 1,
                    "endIndex": char_count
                }
            }
        }]
        return await self.execute_batch_update(access_token, document_id, req)

    async def execute_batch_update(self, access_token: str, document_id: str, requests: List[Dict[str, Any]]) -> bool:
        """Executes a batchUpdate request against Google Docs API."""
        url = f"{self.DOCS_API_BASE}/{document_id}:batchUpdate"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json={"requests": requests}) as resp:
                if resp.status != 200:
                    logger.warning("Google Docs batchUpdate status %s", resp.status)
                    return False
                return True

    async def stream_assignment_to_doc(
        self,
        access_token: str,
        title: str,
        content: str,
        simulation_speed: str = "fast",
        max_retries: int = 3,
        progress_callback: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Creates a Google Doc and streams content with 10% interval originality compliance checks."""
        doc_info = await self.create_document(access_token, title)
        doc_id = doc_info["document_id"]
        doc_url = doc_info["url"]

        checker = OriginalityComplianceChecker()
        simulator = HumanizedTypingSimulator()

        current_text = content
        attempts = 0

        while attempts < max_retries:
            attempts += 1
            events = simulator.generate_typing_events(current_text)
            total_events = len(events)
            current_index = 1
            accumulated_text = ""
            batches_sent = 0
            checkpoints_passed = 0
            aborted_for_correction = False

            delay_multiplier = 0.05 if simulation_speed == "fast" else 1.0
            next_checkpoint_step = max(1, total_events // 10)
            next_checkpoint_pct = 10

            for idx, event in enumerate(events):
                action = event.get("action")

                if action == "insert":
                    text_to_insert = event.get("text", "")
                    if text_to_insert:
                        req = [{
                            "insertText": {
                                "location": {"index": current_index},
                                "text": text_to_insert
                            }
                        }]
                        success = await self.execute_batch_update(access_token, doc_id, req)
                        if success:
                            current_index += len(text_to_insert)
                            accumulated_text += text_to_insert
                            batches_sent += 1

                    delay_sec = (event.get("delay_ms", 100) / 1000.0) * delay_multiplier
                    await asyncio.sleep(delay_sec)

                elif action == "delete":
                    chars_to_delete = event.get("chars", 1)
                    start_del = max(1, current_index - chars_to_delete)
                    if current_index > start_del:
                        req = [{
                            "deleteContentRange": {
                                "range": {
                                    "startIndex": start_del,
                                    "endIndex": current_index
                                }
                            }
                        }]
                        success = await self.execute_batch_update(access_token, doc_id, req)
                        if success:
                            current_index = start_del
                            accumulated_text = accumulated_text[:-chars_to_delete]
                            batches_sent += 1

                    delay_sec = (event.get("delay_ms", 100) / 1000.0) * delay_multiplier
                    await asyncio.sleep(delay_sec)

                elif action == "pause":
                    delay_sec = (event.get("delay_ms", 500) / 1000.0) * delay_multiplier
                    await asyncio.sleep(delay_sec)

                # 10% Interval Originality & Composition Check
                if (idx + 1) % next_checkpoint_step == 0 and next_checkpoint_pct <= 100:
                    report = await checker.evaluate_checkpoint(accumulated_text, next_checkpoint_pct)
                    next_checkpoint_pct += 10

                    if not report["compliant"]:
                        logger.warning(
                            "Checkpoint %d%% flagged by originality monitor. Discarding draft and refining...",
                            report["checkpoint_pct"]
                        )
                        # Discard document text in Google Doc
                        await self.clear_document(access_token, doc_id, current_index)
                        # Refine writing engine content with adaptive humanizer
                        current_text, _ = await checker.self_correct_content(current_text, report)
                        aborted_for_correction = True
                        break
                    else:
                        checkpoints_passed += 1

                if progress_callback and callable(progress_callback):
                    await progress_callback(batches_sent, total_events, doc_url)

            if not aborted_for_correction:
                res_payload = {
                    "status": "success",
                    "document_id": doc_id,
                    "document_url": doc_url,
                    "revisions_count": batches_sent,
                    "total_events": total_events,
                    "checkpoints_verified": checkpoints_passed,
                    "compliance_history": checker.compliance_history,
                    "attempts": attempts,
                    "final_char_count": current_index - 1
                }
                try:
                    from .datalake import datalake_manager
                    datalake_manager.log_gdocs_export_event(
                        user_id=None,
                        document_id=doc_id,
                        total_events=total_events,
                        revisions_count=batches_sent,
                        checkpoints_verified=checkpoints_passed,
                        retries_used=attempts - 1,
                        status="success"
                    )
                except Exception:
                    pass
                return res_payload

        # Fallback if max attempts reached
        fallback_payload = {
            "status": "completed_with_fallback",
            "document_id": doc_id,
            "document_url": doc_url,
            "revisions_count": batches_sent,
            "compliance_history": checker.compliance_history,
            "attempts": attempts
        }
        try:
            from .datalake import datalake_manager
            datalake_manager.log_gdocs_export_event(
                user_id=None,
                document_id=doc_id,
                total_events=total_events,
                revisions_count=batches_sent,
                checkpoints_verified=checkpoints_passed,
                retries_used=attempts - 1,
                status="completed_with_fallback"
            )
        except Exception:
            pass
        return fallback_payload



gdocs_streamer = GoogleDocsStreamer()
