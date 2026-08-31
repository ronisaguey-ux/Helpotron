"""Audio transcription via Gemini through OpenRouter.

OpenRouter is the sole LLM/audio upstream. Audio is sent as an
input_audio part to a Gemini audio-capable model using the OpenAI-compatible
chat completions endpoint. Whisper is no longer a required backend.
"""
from __future__ import annotations

import base64
import logging
import os
import uuid
from typing import Optional, Tuple

import httpx

try:
    from .config import BASE_DIR, config
    from .cost_tracking import cost_engine
    from .database import SessionLocal
except (ImportError, ValueError):
    from server.config import BASE_DIR, config
    from server.cost_tracking import cost_engine
    from server.database import SessionLocal

logger = logging.getLogger(__name__)

UPLOAD_DIR = BASE_DIR / "uploads"  # repo-root/uploads

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
GEMINI_AUDIO_MODEL = "google/gemini-2.0-flash"


def save_upload(content: bytes, filename: str) -> str:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(filename)[1] or ".webm"
    path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(content)
    return str(path)


def _audio_mime_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower().replace(".", "")
    if ext in ["mp3", "wav", "flac", "ogg", "webm", "m4a", "aac", "mp4"]:
        if ext == "m4a":
            return "audio/mp4"
        return f"audio/{ext}"
    return "audio/mp3"


def _openrouter_api_key() -> str:
    key = (
        os.getenv("OPENROUTER_API_KEY")
        or getattr(config, "openrouter_api_key", "")
        or getattr(config, "omniroute_api_key", "")
    ).strip()
    return key


async def transcribe_audio(
    path: str,
    task: str = "transcribe",
    user_id: Optional[str] = None,
    preferred_model: Optional[str] = None,
) -> Tuple[str, float | None]:
    """Transcribe audio with Gemini through OpenRouter.

    Hard-fails with a clear message when OPENROUTER_API_KEY is missing.
    """
    api_key = _openrouter_api_key()
    if not api_key:
        raise RuntimeError(
            "Transcription is not configured: OPENROUTER_API_KEY is missing. "
            "Add it to helpotron/.env to enable Gemini audio transcription."
        )

    model_name = preferred_model or GEMINI_AUDIO_MODEL
    public_id = user_id or getattr(config, "admin_public_id", "default_user")
    text, duration = await _transcribe_gemini_openrouter(path, model_name, api_key)

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
                metadata={"file_path": os.path.basename(path), "engine": "openrouter-gemini-audio"},
            )
    except Exception as le:
        logger.warning("Cost log failed: %s", le)
    return text, duration


async def _transcribe_gemini_openrouter(path: str, model_name: str, api_key: str) -> Tuple[str, float | None]:
    from .agent_prompt import sandbox_math_rule  # operator 08-31 standing rule
    """Send audio as an input_audio part to OpenRouter's chat completions."""
    with open(path, "rb") as f:
        audio_bytes = f.read()
    b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
    mime_type = _audio_mime_type(path)

    system_prompt = (
        "You are an expert academic audio transcriber. Transcribe the audio precisely into clean, structured Markdown.\n"
        "Formatting Requirements:\n"
        "1. Insert timestamp markers in [MM:SS] format at logical paragraph pauses.\n"
        "2. Add Speaker Labels (e.g. `**Professor:**`, `**Student 1:**`) if detectable.\n"
        "3. Group related segments under descriptive Markdown headers (e.g. `## Lecture Introduction`, `## Key Concepts & Proofs`).\n"
        "4. Conclude with a `### Core Takeaways & Next Steps` bulleted section.\n"
        + sandbox_math_rule()
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": system_prompt},
                    {
                        "type": "input_audio",
                        "input_audio": {"data": b64_audio, "format": mime_type.split("/")[-1]},
                    },
                ],
            }
        ],
        "temperature": 0.2,
        "max_tokens": 8192,
    }

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(OPENROUTER_CHAT_URL, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        logger.error("OpenRouter audio transcription request failed: %s", exc)
        raise RuntimeError(f"Gemini transcription request failed: {exc}") from exc

    if resp.status_code != 200:
        logger.error("OpenRouter audio transcription HTTP %s: %s", resp.status_code, resp.text[:400])
        raise RuntimeError(f"Gemini transcription failed with status {resp.status_code}")

    try:
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        logger.error("Unexpected OpenRouter audio response: %s", resp.text[:400])
        raise RuntimeError("Gemini transcription returned an unexpected response") from exc

    text = (text or "").strip()
    if not text:
        raise RuntimeError("Gemini returned blank transcript")

    est_duration = max(5.0, round(len(audio_bytes) / 16000.0, 1))
    return text, est_duration


import subprocess
from pathlib import Path as _Path


def convert_audio_to_wav(input_path: str, output_path: str) -> str:
    """Convert audio file to WAV using ffmpeg with shell injection protection."""
    inp = _Path(input_path).resolve()
    outp = _Path(output_path).resolve()

    allowed_exts = {".mp3", ".m4a", ".wav", ".ogg", ".webm", ".aac", ".mp4"}
    if inp.suffix.lower() not in allowed_exts or outp.suffix.lower() != ".wav":
        raise ValueError("Invalid audio format extension")

    if not inp.exists() or not inp.is_file():
        raise FileNotFoundError(f"Input audio file does not exist: {inp}")

    args = [
        "ffmpeg", "-y", "-nostdin",
        "-i", str(inp),
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(outp),
    ]

    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg conversion failed: {result.stderr[:300]}")
    return str(outp)


def extract_audio_wav(input_path: str, output_path: str) -> bool:
    cmd = ["ffmpeg", "-y", "-i", str(input_path), "-vn", "-ar", "16000", "-ac", "1", str(output_path)]
    res = subprocess.run(cmd, capture_output=True, text=True, shell=False)
    return res.returncode == 0
