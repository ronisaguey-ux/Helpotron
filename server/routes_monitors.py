"""Monitors API: live health/overview + snapshot history.

Aggregate metrics only (traffic, activity counts, data lake rows, cost
totals) — no per-user or per-IP data, so these are safe to serve without
auth: the panel is an operational window onto the site itself.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from .monitors import get_history, get_live_snapshot

router = APIRouter(prefix="/api/monitors", tags=["monitors"])


@router.get("/overview")
def monitors_overview() -> dict:
    """Live counters + most recent persisted snapshot."""
    return get_live_snapshot()


@router.get("/history")
def monitors_history(limit: int = Query(default=100, ge=1, le=2000)) -> dict:
    """Recent snapshots (newest last)."""
    return {"snapshots": get_history(limit=limit)}
