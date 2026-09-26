"""agent_actions.py — My Agent action ledger + rollback (helpotron).

Every action the agent executes (create/delete assignment, settings change,
team messages, content reads) is recorded with an undo snapshot, so the user
can roll it back from My Agent → Recent actions. Read-rollbacks also revoke
the subject so the agent treats the content as unseen going forward.

Undo rules are idempotent and user-scoped. This module is imported lazily
from overlord_agent (avoiding a circular import).
"""
from datetime import datetime, timezone

from .database import AgentAction, Assignment


def record_agent_action(db, user, action_type, summary, assignment_id=None, payload=None, undo_payload=None):
    row = AgentAction(
        user_id=user.id,
        assignment_id=assignment_id,
        action_type=action_type,
        summary=summary or action_type,
        payload=payload or {},
        undo_payload=undo_payload,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def set_undo_payload(db, row, undo_payload):
    row.undo_payload = undo_payload
    db.commit()


def list_agent_actions(db, user, limit=40):
    return (
        db.query(AgentAction)
        .filter(AgentAction.user_id == user.id)
        .order_by(AgentAction.id.desc())
        .limit(limit)
        .all()
    )


def agent_action_to_dict(a: AgentAction) -> dict:
    return {
        "id": a.id,
        "action_type": a.action_type,
        "summary": a.summary,
        "assignment_id": a.assignment_id,
        "status": a.status,
        "undoable": a.status == "done" and bool(a.undo_payload),
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def undo_agent_action(db, user, action: AgentAction) -> dict:
    if action.status != "done":
        return {"ok": False, "message": "already undone"}
    if not action.undo_payload:
        return {"ok": False, "message": "not undoable — no snapshot recorded"}

    kind = action.action_type

    if kind == "create_assignment":
        aid = action.undo_payload.get("delete_assignment_id")
        row = db.query(Assignment).filter_by(id=aid, user_id=user.id).first()
        if not row:
            return {"ok": False, "message": "assignment already gone"}
        db.delete(row)
        db.commit()

    elif kind == "delete_assignment":
        snap = action.undo_payload.get("restore") or {}
        if not snap.get("title"):
            return {"ok": False, "message": "no restore snapshot"}
        db.add(Assignment(
            user_id=user.id,
            canvas_id=snap.get("canvas_id"),
            title=snap["title"],
            due_date=snap.get("due_date"),
            prompt=snap.get("prompt", ""),
            file_urls=snap.get("file_urls") or [],
            status=snap.get("status", "in_progress"),
            progress=snap.get("progress") or {},
        ))
        db.commit()

    elif kind == "change_settings":
        old = action.undo_payload.get("old_settings")
        if not isinstance(old, dict):
            return {"ok": False, "message": "no settings snapshot"}
        user.settings = old
        db.commit()

    elif kind in ("message_assignment_team", "message_subagent"):
        aid = action.undo_payload.get("assignment_id")
        if aid:
            from . import overlord_agent as _oa
            _oa.overlord_agent.add_chat_message(
                aid, "overlord",
                "⏪ Retraction: the user has revoked the previous instruction. Disregard it.",
                user_id=user.id,
            )

    elif kind == "read_assignment":
        subj = str(action.payload.get("assignment_id", ""))
        if not subj:
            return {"ok": False, "message": "no subject to revoke"}
        settings = dict(user.settings or {})
        revoked = set(settings.get("revoked_subjects") or [])
        revoked.add(subj)
        settings["revoked_subjects"] = sorted(revoked)
        user.settings = settings
        db.commit()
        from . import overlord_agent as _oa
        _oa.overlord_agent.add_chat_message(
            action.assignment_id, "overlord",
            "⏪ The user revoked their read of this assignment. Treat its content as unseen and do not reference it again.",
            user_id=user.id,
        )

    else:
        return {"ok": False, "message": f"no undo implemented for '{kind}'"}

    action.status = "undone"
    action.undone_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"ok": True, "message": f"rolled back {kind}"}
