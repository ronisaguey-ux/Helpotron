"""API key HTTP surface (owner 2026-09-17).

The extension no longer logs in. A user generates a key here, copies it once,
pastes it into the extension, and can set limits or revoke it at any time.

    POST   /api/keys          create  -> returns the plaintext ONCE
    GET    /api/keys          list    -> never returns the secret
    PATCH  /api/keys/{id}     limits  -> spend cap, rate cap, label
    DELETE /api/keys/{id}     revoke

The plaintext is returned by POST and by nothing else, ever. Only a hash is
stored (see server/api_keys.py), so a lost key is replaced, not recovered.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import api_keys as keys
from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/keys", tags=["api-keys"])


async def _get_current_user(request: Request, db: Session):
    """Session/JWT auth only — an API key must NOT be able to mint another key.

    Minting a key from a key would make revocation meaningless: a leaked key
    could issue itself a fresh, unrestricted one before the user noticed.
    """
    from .security import get_current_user, require_session_auth
    # ORDER MATTERS: the guard reads request.state.auth_via_api_key, which only
    # exists once get_current_user has run. Checking first let a key mint another
    # key — caught by test_key_cannot_mint_another_key.
    user = await get_current_user(request=request)
    require_session_auth(request)
    return user


class CreateKeyIn(BaseModel):
    label: str = Field(default="", max_length=100)
    usage_limit_tokens: Optional[float] = Field(default=None, ge=0)
    rate_limit_per_min: Optional[int] = Field(default=None, ge=0)
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=3650)


class UpdateKeyIn(BaseModel):
    label: Optional[str] = Field(default=None, max_length=100)
    usage_limit_tokens: Optional[float] = Field(default=None, ge=0)
    rate_limit_per_min: Optional[int] = Field(default=None, ge=0)


@router.get("")
async def list_keys(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    user = await _get_current_user(request, db)
    return {"status": "success", "keys": keys.list_keys(db, user)}


@router.post("")
async def create_key(body: CreateKeyIn, request: Request,
                     db: Session = Depends(get_db)) -> Dict[str, Any]:
    user = await _get_current_user(request, db)
    row, plaintext = keys.generate_key(
        db, user,
        label=body.label,
        usage_limit_tokens=body.usage_limit_tokens,
        rate_limit_per_min=body.rate_limit_per_min,
        expires_in_days=body.expires_in_days,
    )
    # `key` appears in this response and nowhere else in the entire API. The UI
    # must present it as copy-once and say so plainly.
    return {
        "status": "success",
        "key": plaintext,
        "id": row.id,
        "prefix": row.key_prefix,
        "label": row.label,
        "warning": "This key is shown once and cannot be retrieved again.",
    }


@router.patch("/{key_id}")
async def update_key(key_id: int, body: UpdateKeyIn, request: Request,
                     db: Session = Depends(get_db)) -> Dict[str, Any]:
    user = await _get_current_user(request, db)
    ok = keys.update_limits(
        db, user, key_id,
        usage_limit_tokens=body.usage_limit_tokens,
        rate_limit_per_min=body.rate_limit_per_min,
        label=body.label,
    )
    if not ok:
        raise HTTPException(404, "key not found")
    return {"status": "success", "keys": keys.list_keys(db, user)}


@router.delete("/{key_id}")
async def revoke_key(key_id: int, request: Request,
                     db: Session = Depends(get_db)) -> Dict[str, Any]:
    user = await _get_current_user(request, db)
    if not keys.revoke_key(db, user, key_id):
        raise HTTPException(404, "key not found")
    return {"status": "success", "keys": keys.list_keys(db, user)}
