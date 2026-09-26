"""routes_hygiene.py — privacy/hygiene cleanser for the helpotron stack.

Proxies files to the local watermarks-remover service (vendor/watermarks-remover,
http://127.0.0.1:8765 by default). The service strips invisible provenance
marks — invisible Unicode, bidi/tag chars, C2PA/EXIF/XMP metadata — from files
the user owns, before they are exported or shared. Stdlib-only external
dependency (httpx is already used across the server).

Endpoints (authenticated via get_current_user session/Bearer):
  POST /api/hygiene/inspect — multipart file -> findings report JSON
  POST /api/hygiene/clean   — multipart file -> cleaned file bytes (+ X-Hygiene-Report)
"""
import asyncio
import base64
import json
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response

from .database import User
from .security import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/hygiene", tags=["hygiene"])

SERVICE_URL = os.getenv("HYGIENE_SERVICE_URL", "http://127.0.0.1:8765")


def _service_health() -> dict:
    try:
        r = httpx.get(f"{SERVICE_URL}/health", timeout=2.0)
        return r.json()
    except Exception:
        return {"ok": False}


@router.get("/status")
async def status(current_user: User | None = Depends(get_current_user_optional)):
    # Same defect as _forward had, at a second call site — a sync httpx call inside an
    # `async def`. A 2 s timeout is shorter than 240 s, but it is still a blocking call on the
    # event loop, so a wedged sidecar stalls every concurrent request for 2 s per probe. The
    # first fix covered _forward and missed this one; run it in a worker thread too.
    return await asyncio.to_thread(_service_health)


async def _forward(file: UploadFile, endpoint: str) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    payload = {"file": base64.b64encode(data).decode(), "name": file.filename or "file"}
    try:
        # 2026-09-18: this was a sync call with a 240 s timeout inside an
        # `async def` handler. It blocked the whole event loop, so ONE request
        # to /api/hygiene with an unresponsive sidecar froze every other client
        # (including /api/health) for up to four minutes — a single-request DoS.
        # Run it in a worker thread so the loop stays free.
        r = await asyncio.to_thread(
            lambda: httpx.post(f"{SERVICE_URL}{endpoint}", json=payload, timeout=240.0)
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"hygiene service unreachable: {e}") from e
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"hygiene service error {r.status_code}: {r.text[:300]}")
    return r.json()


@router.post("/inspect")
async def inspect(file: UploadFile, current_user: User = Depends(get_current_user)):
    """Reporting only: which provenance marks were found (no rewrite)."""
    return await _forward(file, "/inspect")


@router.post("/clean")
async def clean(file: UploadFile, current_user: User = Depends(get_current_user)):
    """Returns the cleaned file with the same media type, plus an
    X-Hygiene-Report header with the cleanup summary."""
    res = await _forward(file, "/clean")
    cleaned_b64 = res.get("cleaned")
    if not cleaned_b64:
        raise HTTPException(status_code=502, detail="service returned no cleaned payload")
    media = file.content_type or "application/octet-stream"
    return Response(
        content=base64.b64decode(cleaned_b64),
        media_type=media,
        headers={"X-Hygiene-Report": json.dumps(res.get("report", {}))[:400]},
    )
