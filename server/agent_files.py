"""Personal-agent file store — skills, rules, automations, personalities.

Files the user uploads into their agent (skill files, always-follow rule
files, automation definitions, personality/voice files). Content lives on
disk under uploads/agent_files/ with random hex names (never the client
filename); the DB row (AgentFile) is the index. (My Agent experience, 08-22.)
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any, Dict, List

from .database import AgentFile, SessionLocal, User

# AGENT_FILES_DIR env (run_native.sh) keeps all user uploads in data/uploads/;
# default stays relative for dev/legacy runs.
_AGENT_FILES_DIR = Path(os.getenv("AGENT_FILES_DIR", "./uploads/agent_files"))

ALLOWED_KINDS = {"skill", "rule", "automation", "personality"}
# Never allow client-supplied paths: disk name is always uuid4 hex.
_MAX_BYTES = 20 * 1024 * 1024  # 20 MB


def _kind_of(kind: str) -> str:
    return kind if kind in ALLOWED_KINDS else "skill"


async def save_agent_file(user: User, filename: str, kind: str, content: bytes, db) -> Dict[str, Any]:
    """Persist one uploaded file; returns the file row as a dict."""
    if len(content) > _MAX_BYTES:
        raise ValueError("File too large (max 20 MB)")
    _AGENT_FILES_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = (filename or "upload.bin").split("/")[-1][:512]
    suffix = Path(safe_name).suffix[:12]
    disk_name = uuid.uuid4().hex + suffix
    (_AGENT_FILES_DIR / disk_name).write_bytes(content)

    row = AgentFile(
        user_id=user.id,
        file_name=safe_name,
        kind=_kind_of(kind),
        disk_name=disk_name,
        size_bytes=len(content),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "file_name": row.file_name,
        "kind": row.kind,
        "size_bytes": row.size_bytes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_agent_files(user_id: int) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = (
            db.query(AgentFile)
            .filter(AgentFile.user_id == user_id)
            .order_by(AgentFile.created_at.desc())
            .all()
        )
        return [
            {
                "id": r.id,
                "file_name": r.file_name,
                "kind": r.kind,
                "size_bytes": r.size_bytes,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    finally:
        db.close()


def delete_agent_file(user_id: int, file_id: int) -> bool:
    db = SessionLocal()
    try:
        row = (
            db.query(AgentFile)
            .filter(AgentFile.id == file_id, AgentFile.user_id == user_id)
            .first()
        )
        if not row:
            return False
        disk_path = _AGENT_FILES_DIR / row.disk_name
        try:
            disk_path.unlink(missing_ok=True)
        except OSError:
            pass
        db.delete(row)
        db.commit()
        return True
    finally:
        db.close()


def agent_files_summary(user_id: int, limit: int = 20) -> List[str]:
    """Compact list for chat system-prompt injection."""
    return [f"[{f['kind']}] {f['file_name']}" for f in list_agent_files(user_id)[:limit]]
