"""routes_agent_actions.py — My Agent action ledger API (list + undo)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .agent_actions import (
    agent_action_to_dict,
    list_agent_actions,
    undo_agent_action,
)
from .database import AgentAction, get_db
from .routes_user_settings import _get_current_user

router = APIRouter(prefix="/api/agent/actions", tags=["agent-actions"])


@router.get("")
async def get_actions(request: Request, db: Session = Depends(get_db)):
    """Recent agent actions for the current user, newest first, with an
    `undoable` flag per item (action status + snapshot presence)."""
    user = _get_current_user(request, db)
    rows = list_agent_actions(db, user, limit=40)
    return {"status": "success", "actions": [agent_action_to_dict(a) for a in rows]}


@router.post("/{action_id}/undo")
async def undo_action(action_id: int, request: Request, db: Session = Depends(get_db)):
    """Rolls back an agent action (delete re-creates, create removes,
    settings restores the old snapshot, reads revoke the subject)."""
    user = _get_current_user(request, db)
    action = db.query(AgentAction).filter_by(id=action_id, user_id=user.id).first()
    if not action:
        raise HTTPException(status_code=404, detail="action not found")
    result = undo_agent_action(db, user, action)
    if not result.get("ok"):
        raise HTTPException(status_code=422, detail=result.get("message", "cannot undo"))
    return {"status": "success", "message": result.get("message", "rolled back")}
