"""Voice routes — local Voicebox integration (08-27, all 3 phases).

Voicebox (MIT, github.com/jamiepine/voicebox) is a local voice studio on
127.0.0.1:17493:
  POST /transcribe — multipart file=audio (+ optional language/model) -> {"text": ...}
  POST /generate   — JSON GenerationRequest {profile_id, text, engine, language,
                     model_size} -> GenerationResponse; audio bytes at GET /audio/{id}
  POST /speak      — JSON {profile?} -> plays through the box's speakers

These routes wire helpotron to it:
  Phase 1 (agent can talk): voicebox MCP server in mcp/claude_bridge_config.json
                            -> `voicebox.speak` tool for the claude bridge.
  Phase 2 (dictation): POST /api/voice/transcribe — mic recording -> text.
  Phase 3 (spoken replies): POST /api/voice/tts — reply text -> audio for the browser.
"""

import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .routes_features import get_current_authenticated_user
from .upload_limits import read_upload_capped

VOICEBOX = "http://127.0.0.1:17493"
router = APIRouter(prefix="/api/voice", tags=["voice"])
logger = logging.getLogger("helpotron")

# Audit 08-30: every failure path here interpolated the upstream error — host,
# port, status line and body — straight into the HTTPException detail, which
# the SPA renders to the user. That hands a browser the internal topology and
# tells the user nothing they can act on. The cause goes to the log; the
# client gets one sentence about what to do next.
_VOICE_UNAVAILABLE = (
    "Voice isn't available right now. The local voice service isn't responding — "
    "type your message instead, or try again in a moment."
)


def _voice_unavailable(action: str, cause: object) -> HTTPException:
    logger.warning("voicebox %s failed: %s", action, cause)
    return HTTPException(503, _VOICE_UNAVAILABLE)


async def _voicebox_reachable() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{VOICEBOX}/profiles", timeout=3.0)
            return r.status_code < 500
    except Exception:
        return False


@router.get("/status")
async def voice_status(current_user=Depends(get_current_authenticated_user)):
    return {"available": await _voicebox_reachable()}


@router.post("/transcribe")
async def voice_transcribe(
    file: UploadFile = File(...),
    current_user=Depends(get_current_authenticated_user),
):
    """Dictation: mic recording -> text, relayed to Voicebox's local Whisper."""
    # Was an uncapped `await file.read()`: any size went straight into memory and
    # was then re-sent to Voicebox. Same 100MB ceiling as /api/transcribe.
    data = await read_upload_capped(file, 100 * 1024 * 1024, "Audio upload exceeds 100MB limit")
    name = file.filename or "audio.webm"
    mime = file.content_type or "audio/webm"
    try:
        async with httpx.AsyncClient(timeout=300.0) as c:
            r = await c.post(
                f"{VOICEBOX}/transcribe",
                files={"file": (name, data, mime)},
            )
            if r.status_code != 200:
                raise _voice_unavailable("transcribe", f"HTTP {r.status_code}: {r.text[:200]}")
            text = ((r.json() or {}).get("text") or "").strip()
            if not text:
                raise _voice_unavailable("transcribe", "empty transcription")
            return {"text": text}
    except httpx.HTTPError as e:
        raise _voice_unavailable("request", f"{type(e).__name__}: {e}")


class TtsIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    engine: str = Field(
        default="kokoro",
        pattern="^(qwen|qwen_custom_voice|luxtts|chatterbox|chatterbox_turbo|tada|kokoro)$",
    )
    profile_id: str = "default"


@router.post("/tts")
async def voice_tts(body: TtsIn, current_user=Depends(get_current_authenticated_user)):
    """Spoken reply: agent text -> audio blob (browser plays it inline)."""
    try:
        async with httpx.AsyncClient(timeout=600.0) as c:
            g = await c.post(
                f"{VOICEBOX}/generate",
                json={
                    "profile_id": body.profile_id,
                    "text": body.text,
                    "engine": body.engine,
                    "language": "en",
                    "model_size": "0.6B",
                    "normalize": True,
                },
            )
            if g.status_code != 200:
                raise _voice_unavailable("generate", f"HTTP {g.status_code}: {g.text[:200]}")
            gid = (g.json() or {}).get("id")
            if not gid:
                raise _voice_unavailable("generate", "response missing generation id")
            # generation may be queued — poll the audio endpoint briefly
            for _ in range(20):
                a = await c.get(f"{VOICEBOX}/audio/{gid}")
                if a.status_code == 200 and a.content:
                    return Response(
                        content=a.content,
                        media_type=a.headers.get("content-type", "audio/wav"),
                    )
                if a.status_code >= 500:
                    break
                await asyncio.sleep(3)
            raise _voice_unavailable("audio", "not ready within the polling window")
    except httpx.HTTPError as e:
        raise _voice_unavailable("request", f"{type(e).__name__}: {e}")
