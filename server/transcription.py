"""Transcription — lecture audio -> text.

Provider order: OpenAI-compatible whisper (if WHISPER_API_KEY set) -> local
faster-whisper (if installed). Raises a clear error when neither is available
instead of failing silently.
"""
from __future__ import annotations

import logging
import os
import uuid

import httpx

from .config import BASE_DIR, config

logger = logging.getLogger(__name__)

UPLOAD_DIR = BASE_DIR.parent / "uploads"  # repo-root/uploads


def save_upload(content: bytes, filename: str) -> str:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(filename)[1] or ".webm"
    path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(content)
    return str(path)


async def transcribe_audio(path: str, task: str = "transcribe") -> tuple[str, float | None]:
    """Returns (text, duration_seconds)."""

    if config.whisper_api_key:
        return await _transcribe_openai(path, task)

    # local fallback
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        raise RuntimeError(
            "No transcription backend configured: set WHISPER_API_KEY, or "
            "`pip install faster-whisper` for local transcription."
        )

    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, info = model.transcribe(path, task=task)
    text = " ".join(s.text.strip() for s in segments).strip()
    return text, float(info.duration)


async def _transcribe_openai(path: str, task: str) -> tuple[str, float | None]:
    url = f"{config.omniroute_api_base}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {config.whisper_api_key}"}
    with open(path, "rb") as f:
        files = {"file": (os.path.basename(path), f)}
        data = {"model": "whisper-1", "response_format": "verbose_json", "task": task}
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(url, headers=headers, files=files, data=data)
    if resp.status_code != 200:
        logger.warning("whisper endpoint returned %s: %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"whisper endpoint HTTP {resp.status_code}")
    data = resp.json()
    text = data.get("text", "")
    duration = data.get("duration")
    if not text.strip():
        raise RuntimeError("whisper returned empty text")
    return text, float(duration) if duration else None
