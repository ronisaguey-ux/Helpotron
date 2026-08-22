"""API routes for Chrome Extension version tracking, update alerts, and zip packaging."""
from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .config import BASE_DIR

router = APIRouter(prefix="/api/extension", tags=["extension"])

EXTENSION_DIR = BASE_DIR / "extension" if (BASE_DIR / "extension").exists() else BASE_DIR.parent / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"


def get_current_manifest() -> Dict[str, Any]:
    if MANIFEST_PATH.exists():
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"version": "2.0.0", "name": "Helpotron Universal Automator"}


class VersionCheckRequest(BaseModel):
    current_version: Optional[str] = Field(None, description="Current version installed in the browser")
    client_id: Optional[str] = None


@router.get("/version")
async def get_extension_version():
    """Returns the latest available extension version, changelog, and download metadata."""
    manifest = get_current_manifest()
    latest_version = manifest.get("version", "2.0.0")

    return {
        "status": "success",
        "latest_version": latest_version,
        "minimum_supported_version": "1.0.0",
        "release_date": "2026-08-18",
        "is_critical_update": False,
        "release_notes": [
            "✨ Added Deterministic Python Math Evaluation (exact calculations with zero hallucination).",
            "🛡️ Enhanced Kimhons 38-Pattern and Jalaalrd Anti-AI-Slop evasion heuristics.",
            "🎙️ Optimized lecture audio recording with chunked streaming upload.",
            "⚡ Added real-time version update alerts and 1-click zip bundle download.",
            "🔒 Hardened session token security and eliminated insecure headers.",
        ],
        "download_url": "/api/extension/download",
        "setup_guide_url": "/extension-guide",
    }


@router.post("/check-update")
async def check_extension_update(req: VersionCheckRequest):
    """Compares the client extension version with the latest server version."""
    manifest = get_current_manifest()
    latest = manifest.get("version", "2.0.0")
    current = req.current_version or "0.0.0"

    is_outdated = current != latest

    return {
        "status": "success",
        "current_version": current,
        "latest_version": latest,
        "update_available": is_outdated,
        "message": "A new version of the Helpotron Extension is available!" if is_outdated else "Your extension is up to date.",
        "download_url": "/api/extension/download",
    }


@router.get("/download")
async def download_extension_zip():
    """Packages the extension/ folder into a clean .zip file for instant 1-click download."""
    if not EXTENSION_DIR.exists():
        raise HTTPException(status_code=404, detail="Extension directory not found")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(EXTENSION_DIR):
            for file in files:
                # Exclude temporary, cache, or git files
                if file.startswith(".") or file.endswith((".pyc", ".tmp", ".log")):
                    continue
                file_path = Path(root) / file
                archive_name = file_path.relative_to(EXTENSION_DIR)
                zip_file.write(file_path, arcname=str(archive_name))

    zip_buffer.seek(0)
    manifest = get_current_manifest()
    version = manifest.get("version", "2.0.0")
    filename = f"helpotron-extension-v{version}.zip"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Access-Control-Expose-Headers": "Content-Disposition",
    }
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)
