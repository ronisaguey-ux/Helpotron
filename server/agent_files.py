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
    disk_name = f"{uuid.uuid4().hex}{suffix}"
    disk_path = _AGENT_FILES_DIR / disk_name
    disk_path.write_bytes(content)
    try:
        os.chmod(disk_path, 0o600)
    except OSError:
        pass

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


# Per-file character cap when injecting content into chat prompts. The full
# text beyond this is still readable through GET /api/agent/files/{id}; the
# prompt gets enough that a personality/rule/skill file actually shapes the
# model rather than just sitting in the file list.
_FULL_SUMMARY_MAX_PER_FILE = 6000
_FULL_SUMMARY_MAX_TOTAL = 30000
_FULL_SUMMARY_MAX_FILES = 15

_KIND_HEADERS = {
    "personality": "PERSONALITY (BINDING — the user loaded this as HOW YOU MUST SPEAK AND ACT; follow it entirely)",
    "rule": "RULE (BINDING — always follow this, it overrides your defaults)",
    "skill": "SKILL (capability instructions — apply where relevant)",
    "automation": "AUTOMATION (background behavior definition)",
}


def agent_files_full_summary(
    user_id: int,
    max_per_file: int = _FULL_SUMMARY_MAX_PER_FILE,
    max_total: int = _FULL_SUMMARY_MAX_TOTAL,
    limit: int = _FULL_SUMMARY_MAX_FILES,
) -> Optional[List[str]]:
    """Full CONTENT blocks for agent system-prompt injection.

    Operator 08-28 fix: `agent_files_summary` injected only
    "[kind] file_name" strings, so loaded personality/rule/skill files never
    actually reached the model. This reads each file's disk content (uuid hex
    disk_name — never the client filename) and returns complete, readable
    text blocks, identity-bearing kinds (personality, rule) first, each
    truncated sensibly with a visible marker.
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(AgentFile)
            .filter(AgentFile.user_id == user_id)
            .order_by(AgentFile.created_at.desc())
            .limit(limit)
            .all()
        )
        metas = [
            {"id": r.id, "file_name": r.file_name, "kind": r.kind,
             "disk_name": r.disk_name, "created_at": r.created_at}
            for r in rows
        ]
    finally:
        db.close()
    if not metas:
        return None
    _prio = {"personality": 0, "rule": 1, "skill": 2, "automation": 3}
    metas.sort(key=lambda m: (_prio.get(m["kind"], 3), str(m["created_at"] or "")))
    out: List[str] = []
    used = 0
    for m in metas:
        budget = max(0, max_total - used)
        if budget <= 0:
            break
        body = ""
        try:
            p = _AGENT_FILES_DIR / m["disk_name"]
            if p.exists():
                body = p.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            body = ""
        if not body:
            out.append(f"=== [FILE: {m['kind'].upper()}] {m['file_name']} (unreadable/empty — name only) ===")
            continue
        truncated = len(body) > max_per_file
        cap = min(max_per_file, budget)
        shown = body[:cap]
        if (truncated or len(body) > cap) and cap < len(body):
            shown = shown + "\n…[truncated]"
        header = f"=== FILE [{m['kind'].upper()}] {m['file_name']}"
        note = _KIND_HEADERS.get(m["kind"])
        if note:
            header += f" — {note}"
        out.append(f"{header} ===\n{shown}\n=== END FILE {m['file_name']} ===\n")
        used += len(shown) + 160  # header/footer overhead
    return out
