"""Permanent agent memory — one JSON file per user.

The personal agent always reads these entries (injected into the chat system
prompt) and the user can add / edit / delete them freely. Storage is a plain
JSON file per public_id under uploads/agent_memory/ so memory survives server
restarts without touching the DB. (My Agent experience, 08-22.)
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_MEMORY_DIR = Path("./uploads/agent_memory")


def _safe_id(public_id: str) -> str:
    """Filesystem-safe user key (never trust a public id in a path)."""
    return re.sub(r"[^A-Za-z0-9_-]", "_", public_id or "guest")[:80]


def _path(public_id: str) -> Path:
    return _MEMORY_DIR / f"{_safe_id(public_id)}.json"


def load_memory(public_id: str) -> List[Dict[str, Any]]:
    """All memory entries for a user, oldest first."""
    p = _path(public_id)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []
    entries = data.get("entries", []) if isinstance(data, dict) else []
    return [e for e in entries if isinstance(e, dict) and e.get("text")]


def append_memory(public_id: str, text: str) -> Dict[str, Any]:
    """Add one entry and return it."""
    _MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    entry = {
        "id": f"m_{uuid.uuid4().hex[:10]}",
        "text": text.strip()[:4000],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    entries = load_memory(public_id)
    entries.append(entry)
    _path(public_id).write_text(
        json.dumps({"entries": entries}, indent=2), encoding="utf-8"
    )
    return entry


def replace_memory(public_id: str, entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Full replace (used when the agent rewrites memory itself)."""
    _MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    clean: List[Dict[str, Any]] = []
    for e in entries:
        if not isinstance(e, dict) or not e.get("text"):
            continue
        clean.append({
            "id": str(e.get("id") or f"m_{uuid.uuid4().hex[:10]}"),
            "text": str(e["text"]).strip()[:4000],
            "created_at": str(e.get("created_at") or datetime.now(timezone.utc).isoformat()),
        })
    _path(public_id).write_text(
        json.dumps({"entries": clean}, indent=2), encoding="utf-8"
    )
    return clean


def delete_memory(public_id: str, entry_id: str) -> bool:
    """Remove one entry. Returns True if anything was removed."""
    entries = load_memory(public_id)
    kept = [e for e in entries if e.get("id") != entry_id]
    if len(kept) == len(entries):
        return False
    _path(public_id).write_text(
        json.dumps({"entries": kept}, indent=2), encoding="utf-8"
    )
    return True


def memory_summary(public_id: str, limit: int = 30) -> Optional[str]:
    """Compact text block for chat system-prompt injection."""
    entries = load_memory(public_id)
    if not entries:
        return None
    return "\n".join(f"- {e['text']}" for e in entries[-limit:])
