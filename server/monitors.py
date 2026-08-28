"""Persistent health monitors: traffic, activity, data lake, cost.

Runs inside the FastAPI process. Three pieces:

1. MonitorMiddleware — counts every HTTP request (method + endpoint
   template + status code) into in-memory counters. Aggregate only: no
   user ids, no raw payloads, no IPs.
2. run_monitors_loop() — background task started from the app lifespan.
   Every MONITORS_INTERVAL seconds it snapshots: traffic rates, data lake
   file row counts(+deltas), DB activity counts (study sessions, materials,
   transcripts, assignments) and API cost totals (api_usage_logs).
   Snapshots are appended to data_lake/monitors_history.jsonl (persists
   across restarts; trimmed to the last 2000).
3. get_live_snapshot() / get_history() — what /api/monitors/* serve.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .database import SessionLocal, Assignment, StudyMaterial, StudySession, Transcript, ApiUsageLog
from .datalake import DATALAKE_DIR, TELEMETRY_DIR, FEEDBACK_DIR, CORPUS_DIR

logger = logging.getLogger("monitors")

MONITORS_INTERVAL = 60  # seconds between history snapshots
HISTORY_FILE = DATALAKE_DIR / "monitors_history.jsonl"
HISTORY_MAX_LINES = 2000

# ── live request counters (aggregate only) ──────────────────────────────────
_lock = threading.Lock()
_started_ts = time.time()
_req_total = 0
_req_by_path: Dict[str, int] = {}
_req_by_status: Dict[int, int] = {}
_last_snapshot: Dict[str, Any] = {}
_last_snapshot_ts: Optional[float] = None
_snap_requests = 0  # requests seen since last snapshot (for rate)


def _template_path(path: str) -> str:
    """Collapse numeric path segments so /assignments/123 and /assignments/456
    count into one endpoint line."""
    segments = re.split(r"/", path)
    norm = []
    for s in segments:
        if s.isdigit() and len(s) < 16:
            s = "{id}"
        norm.append(s)
    return "/".join(norm)


class MonitorMiddleware(BaseHTTPMiddleware):
    """Count every request (method + endpoint + status)."""

    async def dispatch(self, request: Request, call_next):
        global _req_total, _snap_requests
        route = getattr(request.scope.get("route"), "path", None)
        path = _template_path(route or request.url.path)
        method = request.method
        try:
            response: Response = await call_next(request)
        except Exception:
            status = 500
            raise
        else:
            status = response.status_code
        with _lock:
            _req_total += 1
            _snap_requests += 1
            key = f"{method} {path}"
            _req_by_path[key] = _req_by_path.get(key, 0) + 1
            _req_by_status[status] = _req_by_status.get(status, 0) + 1
        return response


# ── count helpers ───────────────────────────────────────────────────────────
def _count_lines(path: Path) -> int:
    try:
        if not path.exists():
            return 0
        return sum(1 for _ in path.open("r", encoding="utf-8"))
    except Exception:
        return 0


def _datalake_counts() -> Dict[str, int]:
    return {
        "operational_events": _count_lines(TELEMETRY_DIR / "operational_events.jsonl"),
        "user_feedback": _count_lines(FEEDBACK_DIR / "user_feedback.jsonl"),
        "humanized_samples": _count_lines(CORPUS_DIR / "humanized_samples.jsonl"),
        "microcredit_submissions": _count_lines(DATALAKE_DIR / "microcredit_submissions.jsonl"),
    }


def _activity_counts() -> Dict[str, int]:
    """DB row counts (totals + last 24 h) — the site's real usage signals."""
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    try:
        db = SessionLocal()
        try:
            def cnt(model, since_col=None):
                q = db.query(model)
                if since_col is not None:
                    q = q.filter(since_col >= since)
                return q.count()
            return {
                "study_sessions": cnt(StudySession),
                "study_sessions_24h": cnt(StudySession, StudySession.created_at),
                "study_materials": cnt(StudyMaterial),
                "transcripts": cnt(Transcript),
                "assignments": cnt(Assignment),
                "assignments_24h": cnt(Assignment, Assignment.created_at),
            }
        finally:
            db.close()
    except Exception as e:
        logger.error("activity count failed: %s", e)
        return {}


def _cost_counts() -> Dict[str, Any]:
    """API cost totals from api_usage_logs (charged USD + tokens)."""
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    try:
        from sqlalchemy import func
        db = SessionLocal()
        try:
            row = db.query(
                func.coalesce(func.sum(ApiUsageLog.charged_cost_usd), 0.0),
                func.coalesce(func.sum(ApiUsageLog.input_tokens), 0),
                func.coalesce(func.sum(ApiUsageLog.output_tokens), 0),
                func.count(ApiUsageLog.id),
            ).one()
            row24 = db.query(
                func.coalesce(func.sum(ApiUsageLog.charged_cost_usd), 0.0),
                func.count(ApiUsageLog.id),
            ).filter(ApiUsageLog.created_at >= since).one()
            return {
                "cost_usd": round(float(row[0]), 4),
                "cost_usd_24h": round(float(row24[0]), 4),
                "calls": int(row[3]),
                "calls_24h": int(row24[1]),
                "input_tokens": int(row[1]),
                "output_tokens": int(row[2]),
            }
        finally:
            db.close()
    except Exception as e:
        logger.error("cost count failed: %s", e)
        return {}


def _deltas(cur: Dict[str, int], prev: Dict[str, int]) -> Dict[str, int]:
    """Per-key delta between two counter dicts (entries ingested since last
    snapshot)."""
    return {k: max(0, cur.get(k, 0) - prev.get(k, 0)) for k in cur}


def _snapshot() -> Dict[str, Any]:
    with _lock:
        total = _req_total
        snap_reqs = _snap_requests
        by_path = dict(_req_by_path)
        by_status = dict(_req_by_status)
    prev = _last_snapshot.get("traffic", {}) if _last_snapshot else {}
    dl_now = _datalake_counts()
    dl_prev = _last_snapshot.get("datalake_counts", {}) if _last_snapshot else {}
    top = sorted(by_path.items(), key=lambda kv: -kv[1])[:10]
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": int(time.time() - _started_ts),
        "traffic": {
            "total_requests": total,
            "requests_last_window": snap_reqs,
            "requests_per_min": round(snap_reqs / (MONITORS_INTERVAL / 60), 2),
            "top_endpoints": [{"endpoint": k, "count": v} for k, v in top],
            "status_counts": {str(k): v for k, v in sorted(by_status.items())},
        },
        "datalake_counts": dl_now,
        "datalake": {**dl_now, "deltas_last_window": _deltas(dl_now, dl_prev)},
        "activity": _activity_counts(),
        "cost": _cost_counts(),
    }


def _persist(snap: Dict[str, Any]) -> None:
    try:
        DATALAKE_DIR.mkdir(parents=True, exist_ok=True)
        with HISTORY_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(snap, ensure_ascii=False) + "\n")
        _trim_history()
    except Exception as e:
        logger.error("persist snapshot failed: %s", e)


def _trim_history() -> None:
    try:
        lines = HISTORY_FILE.read_text(encoding="utf-8").splitlines()
        if len(lines) > HISTORY_MAX_LINES:
            HISTORY_FILE.write_text("\n".join(lines[-HISTORY_MAX_LINES:]) + "\n", encoding="utf-8")
    except Exception:
        pass


async def run_monitors_loop() -> None:
    """Background task (lifespan-managed): snapshot every MONITORS_INTERVAL."""
    global _last_snapshot, _last_snapshot_ts, _snap_requests
    snapshot_once()
    while True:
        await asyncio.sleep(MONITORS_INTERVAL)
        snapshot_once()


def snapshot_once() -> Dict[str, Any]:
    """Take + persist one snapshot, also usable synchronously (tests)."""
    global _last_snapshot, _last_snapshot_ts, _snap_requests
    snap = _snapshot()
    _persist(snap)
    _last_snapshot = snap
    _last_snapshot_ts = time.time()
    with _lock:
        _snap_requests = 0
    return snap


def get_live_snapshot() -> Dict[str, Any]:
    """Live counters + the most recent persisted snapshot."""
    live = _snapshot()
    live["last_snapshot_ts"] = _last_snapshot_ts
    live["live"] = True
    return live


def get_history(limit: int = 100) -> List[Dict[str, Any]]:
    try:
        if not HISTORY_FILE.exists():
            return []
        lines = HISTORY_FILE.read_text(encoding="utf-8").splitlines()
        out = []
        for line in lines[-limit:]:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except Exception:
                    continue
        return out
    except Exception:
        return []
