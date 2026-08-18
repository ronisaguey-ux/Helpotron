"""Audio Transcription System — powered by Gemini 3.1 Flash-Lite.

Transcribes lectures, notes, and browser audio into clean, structured
Markdown documents with timestamps, speaker separation, section headers,
and core takeaways.
"""
from __future__ import annotations

import base64
import logging
import os
import uuid
from typing import Optional, Tuple

import httpx

from .config import BASE_DIR, config
from .cost_tracking import cost_engine
from .database import SessionLocal

logger = logging.getLogger(__name__)

UPLOAD_DIR = BASE_DIR.parent / "uploads"  # repo-root/uploads


def save_upload(content: bytes, filename: str) -> str:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(filename)[1] or ".webm"
    path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(content)
    return str(path)


async def transcribe_audio(
    path: str,
    task: str = "transcribe",
    user_id: Optional[str] = None,
    preferred_model: Optional[str] = None,
) -> Tuple[str, float | None]:
    """Transcribes audio file to clean Markdown text with timestamps and speaker tags.

    Priority:
    1. Gemini 3.1 Flash-Lite (Cost-effective, highly structured Markdown output)
    2. OpenAI-compatible Whisper (if WHISPER_API_KEY set)
    3. Faster-Whisper local CPU/GPU (if installed)
    """
    model_name = preferred_model or config.gemini_flash_lite_model or "gemini-3.1-flash-lite"
    public_id = user_id or "RoniDev"

    # 1. Primary: Gemini 3.1 Flash-Lite Transcription
    if config.gemini_api_key or (config.omniroute_api_key and "gemini" in model_name):
        try:
            text, duration = await _transcribe_gemini(path, model_name)
            # Log usage & cost
            try:
                with SessionLocal() as db:
                    cost_engine.log_api_call(
                        db=db,
                        public_id=public_id,
                        tool_or_model=model_name,
                        category="transcription",
                        duration_seconds=duration or 30.0,
                        input_tokens=int((duration or 30.0) * 16),
                        output_tokens=len(text.split()),
                        metadata={"file_path": os.path.basename(path), "engine": "gemini-3.1-flash-lite"},
                    )
            except Exception as le:
                logger.warning("Cost log failed: %s", le)
            return text, duration
        except Exception as ge:
            logger.warning("Gemini 3.1 Flash-Lite transcription failed, attempting fallback: %s", ge)

    # 2. Secondary: OpenAI-compatible Whisper
    if config.whisper_api_key or config.openai_api_key:
        try:
            text, duration = await _transcribe_openai(path, task)
            try:
                with SessionLocal() as db:
                    cost_engine.log_api_call(
                        db=db,
                        public_id=public_id,
                        tool_or_model="openai-whisper",
                        category="transcription",
                        duration_seconds=duration or 30.0,
                        metadata={"file_path": os.path.basename(path), "engine": "whisper"},
                    )
            except Exception:
                pass
            return text, duration
        except Exception as we:
            logger.warning("Whisper transcription failed: %s", we)

    # 3. Local Faster-Whisper fallback
    try:
        from faster_whisper import WhisperModel  # type: ignore
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, info = model.transcribe(path, task=task)
        lines = []
        for s in segments:
            m, sec = divmod(int(s.start), 60)
            lines.append(f"[{m:02d}:{sec:02d}] {s.text.strip()}")
        text = "\n".join(lines).strip()
        return text, float(info.duration)
    except ImportError:
        pass

    # Clean error if no backend configured
    raise RuntimeError(
        "No transcription backend configured. Please set GEMINI_API_KEY (for Gemini 3.1 Flash-Lite), "
        "WHISPER_API_KEY, or install `faster-whisper`."
    )


async def _transcribe_gemini(path: str, model_name: str) -> Tuple[str, float | None]:
    """Transcribes audio using Gemini 3.1 Flash-Lite multimodal / audio endpoint."""
    api_key = config.gemini_api_key or config.omniroute_api_key
    base_url = config.omniroute_api_base if config.omniroute_api_key else "https://generativelanguage.googleapis.com/v1beta"

    with open(path, "rb") as f:
        audio_bytes = f.read()

    b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
    ext = os.path.splitext(path)[1].lower().replace(".", "")
    mime_type = f"audio/{ext}" if ext in ["mp3", "wav", "flac", "ogg", "webm", "m4a"] else "audio/mp3"
    if ext == "m4a":
        mime_type = "audio/mp4"

    system_prompt = (
        "You are an expert academic audio transcriber. Transcribe the audio precisely into clean, structured Markdown.\n"
        "Formatting Requirements:\n"
        "1. Insert timestamp markers in [MM:SS] format at logical paragraph pauses.\n"
        "2. Add Speaker Labels (e.g. `**Professor:**`, `**Student 1:**`) if detectable.\n"
        "3. Group related segments under descriptive Markdown headers (e.g. `## Lecture Introduction`, `## Key Concepts & Proofs`).\n"
        "4. Conclude with a `### Core Takeaways & Next Steps` bulleted section."
    )

    url = f"{base_url}/models/{model_name}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": system_prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_audio,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 8192,
        },
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code != 200:
        logger.error("Gemini audio transcription HTTP error %s: %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"Gemini transcription failed with status {resp.status_code}")

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini returned empty candidate list")

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise RuntimeError("Gemini returned blank transcript")

    # Estimate audio duration based on file size (~1MB = ~60s of compressed audio)
    est_duration = max(5.0, round(len(audio_bytes) / 16000.0, 1))
    return text, est_duration


async def _transcribe_openai(path: str, task: str) -> Tuple[str, float | None]:
    """Transcribes audio using OpenAI / OmniRoute Whisper endpoint."""
    url = f"{config.omniroute_api_base}/audio/transcriptions"
    key = config.whisper_api_key or config.openai_api_key
    headers = {"Authorization": f"Bearer {key}"}
    with open(path, "rb") as f:
        files = {"file": (os.path.basename(path), f)}
        data = {"model": "whisper-1", "response_format": "verbose_json", "task": task}
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(url, headers=headers, files=files, data=data)
    if resp.status_code != 200:
        logger.warning("Whisper endpoint returned %s: %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"Whisper endpoint HTTP {resp.status_code}")
    data = resp.json()
    text = data.get("text", "")
    duration = data.get("duration")
    if not text.strip():
        raise RuntimeError("Whisper returned empty text")
    return text, float(duration) if duration else None
