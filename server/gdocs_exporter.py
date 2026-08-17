"""Google Docs Humanized Streaming Exporter for Helpotron.

Streams completed and verified assignment content into a new Google Doc with
realistic, human-like typing cadence and discrete revision snapshots so that
the document's revision history reflects an organic writing process without any
AI metadata or bulk paste markers.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from typing import Any, Dict, Generator, List, Optional, Tuple

import aiohttp

logger = logging.getLogger("helpotron.gdocs")


class HumanizedTypingSimulator:
    """Generates realistic human typing bursts, pause intervals, and natural revisions."""

    def __init__(self, wpm: int = 65, typo_probability: float = 0.04):
        self.wpm = wpm
        self.typo_probability = typo_probability

    def generate_typing_events(self, full_text: str) -> List[Dict[str, Any]]:
        """Splits full text into a sequence of human typing actions.

        Actions include:
        - 'insert': type a burst of characters (3-25 chars)
        - 'pause': cognitive pause (planning, thinking, paragraph transition)
        - 'typo_correction': simulated misspelling and backspace correction
        """
        events: List[Dict[str, Any]] = []
        paragraphs = full_text.split("\n\n")

        for p_idx, para in enumerate(paragraphs):
            if not para.strip():
                events.append({"action": "insert", "text": "\n\n", "delay_ms": 200})
                continue

            # Split paragraph into sentences / clauses
            clauses = re.split(r'([,.;:!?\n]+)', para)
            current_clause = ""

            for part in clauses:
                if not part:
                    continue
                words = part.split()
                if not words:
                    events.append({"action": "insert", "text": part, "delay_ms": 80})
                    continue

                # Stream words in natural burst chunks (2 to 5 words per burst)
                i = 0
                while i < len(words):
                    chunk_size = random.randint(2, 5)
                    chunk_words = words[i:i + chunk_size]
                    chunk_text = (" " if (i > 0 or events) else "") + " ".join(chunk_words)

                    # Simulated typo injection
                    if random.random() < self.typo_probability and len(chunk_words[0]) > 3:
                        typo_word = chunk_words[0]
                        # Swap two adjacent letters
                        swap_pos = random.randint(1, len(typo_word) - 2)
                        misspelled = typo_word[:swap_pos] + typo_word[swap_pos + 1] + typo_word[swap_pos] + typo_word[swap_pos + 2:]
                        
                        events.append({"action": "insert", "text": (" " if i > 0 else "") + misspelled, "delay_ms": 150})
                        events.append({"action": "pause", "delay_ms": random.randint(300, 700), "reason": "notice_typo"})
                        events.append({"action": "delete", "chars": len(misspelled), "delay_ms": 120})
                        events.append({"action": "insert", "text": typo_word, "delay_ms": 100})
                        
                        # Continue with remaining words in chunk
                        if len(chunk_words) > 1:
                            remaining_text = " " + " ".join(chunk_words[1:])
                            events.append({"action": "insert", "text": remaining_text, "delay_ms": random.randint(80, 220)})
                    else:
                        delay = random.randint(90, 240)
                        events.append({"action": "insert", "text": chunk_text, "delay_ms": delay})

                    i += chunk_size

                    # Short pause between bursts
                    if random.random() < 0.35:
                        events.append({"action": "pause", "delay_ms": random.randint(400, 1200), "reason": "syntactic_pause"})

            # Paragraph thinking pause (2 to 4.5 seconds)
            if p_idx < len(paragraphs) - 1:
                events.append({"action": "insert", "text": "\n\n", "delay_ms": 150})
                events.append({"action": "pause", "delay_ms": random.randint(1800, 4500), "reason": "paragraph_transition"})

        return events


class GoogleDocsStreamer:
    """Streams humanized content directly into Google Docs via Google REST API."""

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
        simulation_speed: str = "fast",  # "fast" (accelerated bursts) | "realtime" (human pace)
        progress_callback: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Creates a Google Doc and streams content with human-like revision history."""
        # 1. Create fresh document
        doc_info = await self.create_document(access_token, title)
        doc_id = doc_info["document_id"]
        doc_url = doc_info["url"]

        simulator = HumanizedTypingSimulator()
        events = simulator.generate_typing_events(content)

        current_index = 1  # Google Docs 1-based index (body begins at index 1)
        batches_sent = 0

        # Group events into discrete Google Docs revision batches
        # (Each batchUpdate creates a distinct version history revision)
        delay_multiplier = 0.05 if simulation_speed == "fast" else 1.0

        for event in events:
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
                        batches_sent += 1

                # Apply realistic burst delay
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
                        batches_sent += 1

                delay_sec = (event.get("delay_ms", 100) / 1000.0) * delay_multiplier
                await asyncio.sleep(delay_sec)

            elif action == "pause":
                delay_sec = (event.get("delay_ms", 500) / 1000.0) * delay_multiplier
                await asyncio.sleep(delay_sec)

            if progress_callback and callable(progress_callback):
                await progress_callback(batches_sent, len(events), doc_url)

        return {
            "status": "success",
            "document_id": doc_id,
            "document_url": doc_url,
            "revisions_count": batches_sent,
            "total_events": len(events),
            "final_char_count": current_index - 1
        }


gdocs_streamer = GoogleDocsStreamer()
