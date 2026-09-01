"""Import an assignment from ANY url — "Scrape from anywhere" (feature #79).

Layout from the approved plan: the heavy work (ScrapeGraphAI SmartScraperGraph
in its own venv) happens in the scrape sidecar at 127.0.0.1:9778. This route
is the trusted gatekeeper — auth, SSRF, feature flag, token budget — then
feeds the extracted content through the SAME assignment-dump pipeline file
uploads use, so a scraped assignment lands as a real bubble and everything
downstream (route, finalize, study materials) works with no new code.

Guardrails enforced here (never in the sidecar):
  * validate_safe_url() — SSRF gate (server/ssrf.py).
  * Feature flag import_from_url_enabled (env IMPORT_FROM_URL_ENABLED).
  * Token budget — identical gate to dump finalize (admin/elite exempt).
  * Cost ledger — sidecar usage recorded via record_routing_telemetry()
    (sub-cent per scrape on the FREE deepseek flash; the paid key is never
    routed here).
"""
from __future__ import annotations

import logging
import os
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .assignment_dump import classify_assignment_meta
from .config import settings
from .database import Assignment, UniversalDumpItem, User, get_db
from .llm import record_routing_telemetry
from .routes_features import get_current_authenticated_user
from .security import is_admin_user
from .ssrf import validate_safe_url

logger = logging.getLogger("helpotron")

router = APIRouter(prefix="/api/assignments", tags=["import_url"])

SIDECAR_URL = settings.scrape_sidecar_url.rstrip("/")

# Env value of the form 1/0/yes/no/on/off (Python 3.12: distutils is gone,
# so parse manually).
_TRUE = {"1", "true", "yes", "on", "y", "t"}


def _feature_enabled() -> bool:
    return os.getenv("IMPORT_FROM_URL_ENABLED",
                     str(getattr(settings, "import_from_url_enabled", True))).strip().lower() in _TRUE


class ImportFromUrlPayload(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    description: str = Field("", max_length=5000)


@router.post("/import-from-url")
async def import_from_url(
    payload: ImportFromUrlPayload,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Scrape a pasted link (optionally with the user's own description),
    build the assignment, and land it in the right subject bubble."""
    if not _feature_enabled():
        raise HTTPException(
            403, "Import from URL is turned off by the operator right now.")

    url = (payload.url or "").strip()
    # SSRF gate first — never call the sidecar with a hostile URL.
    try:
        validate_safe_url(url)
    except Exception as e:
        raise HTTPException(400, f"Refusing that URL: {e}") from e

    description = (payload.description or "").strip()[:5000]

    # Token budget: the scrape costs one LLM call — same gate as dump
    # finalize so zero-token accounts cannot run up operator spend.
    if not is_admin_user(current_user) and current_user.plan != "elite":
        token_bal = float((current_user.settings or {}).get("token_balance", 0) or 0)
        if token_bal < 5:
            return {
                "status": "insufficient_tokens",
                "detail": "⚠️ Insufficient tokens — the operator hasn't granted you "
                          "any tokens yet. Ask them to grant you tokens (or upgrade) "
                          "to import assignments from links.",
            }

    # ── Scrape via the sidecar (bounded one-shot; never fan out). ──
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            resp = await client.post(
                f"{SIDECAR_URL}/scrape",
                json={"url": url, "description": description},
            )
    except httpx.ConnectError as e:
        logger.warning("import-from-url: sidecar unreachable at %s", SIDECAR_URL)
        raise HTTPException(
            503, "The scraping service is offline — try again in a minute.") from e
    except httpx.TimeoutException as e:
        raise HTTPException(504, "The page took too long to scrape — try again.") from e

    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise HTTPException(502, f"Scraping failed: {detail}")

    data = resp.json()
    instructions = ((data.get("instructions") or "").strip() or description)
    if not instructions:
        raise HTTPException(
            502, "Could not extract assignment text from that page — "
                 "paste the description manually and try again.")

    host = urlparse(url).netloc or "url"
    title_hint = data.get("title") or ""

    # ── Land it through the existing dump pipeline. ──
    item = UniversalDumpItem(
        user_id=current_user.id,
        file_name=(title_hint[:100] or host),
        file_type="url",
        file_size_bytes=len(instructions),
        status="manual_routed",
        extracted_text=instructions,
        overlord_notes=(
            f"Imported from {url} via ScrapeGraphAI sidecar (fetched_by="
            f"{data.get('fetched_by', 'static')}).")
    )
    db.add(item)
    db.flush()

    meta = await classify_assignment_meta(instructions, title_hint or host)
    assignment_title = (meta.get("title") or title_hint or f"Assignment from {host}")[:500]
    subject = meta.get("subject") or data.get("subject") or "General Academic"

    assignment = Assignment(
        user_id=current_user.id,
        title=assignment_title,
        prompt=instructions,
        # 09-01 lifecycle: new assignments await the user's direction.
        status="pending_approval",
        progress={
            "created_from_dump": True,
            "dump_file_id": item.id,
            "source_url": url,
            "due_date": data.get("due_date") or "",
            "subject": subject,
            "course_code": meta.get("course_code") or "GEN-101",
            "import_via": "scrape_url",
        },
    )
    db.add(assignment)
    db.flush()

    item.matched_assignment_id = assignment.id
    item.auto_match_confidence = 1.0

    # Cost ledger (estimated usage from the sidecar — it reports tokens).
    try:
        await record_routing_telemetry(
            db,
            current_user.id,
            {"model": data.get("usage", {}).get("model", "scrapegraphai-sidecar"),
             "engine": "smartscraper",
             "provider": "openrouter"},
            data.get("usage") or {},
        )
    except Exception as e:  # never fail the import over telemetry
        logger.warning("import-from-url: telemetry failed: %s", e)

    db.commit()
    db.refresh(assignment)

    logger.info("import-from-url: assignment %s for user %s from %s",
                assignment.id, current_user.public_id, host)

    return {
        "status": "success",
        "assignment_id": assignment.id,
        "title": assignment_title,
        "subject": subject,
        "due_date": data.get("due_date") or "",
        "source_url": url,
        "fetched_by": data.get("fetched_by", "static"),
        "instructions_chars": len(instructions),
    }
