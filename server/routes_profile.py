"""routes_profile.py — the user's own account profile.

Owner (2026-09-21): *"give the ability to upload a pfp, edit username/public id
all be under account"*.

Two different things live here, and they are deliberately split by how dangerous
they are:

  * **Display name and avatar** — cosmetic. They change what the account is
    called on screen and nowhere else, so an API key may write them like any other
    preference.
  * **Public ID** — this is the LOGIN IDENTIFIER, not a username. Changing it
    changes what the account signs in with, so it requires a real session (never
    an API key), the current password, and it rewrites the user's own session rows
    so the change does not silently log them out of the tab they just used.

Storage note: display name and avatar live in `user.settings["profile"]`, which is
the namespace already used for the account's email/phone. No new columns, and
`filter_user_settings_payload` already governs what a client may write there.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import User, UserSession, get_db
from .routes_features import get_current_authenticated_user
from .security import require_session_auth, validate_public_id, verify_password

router = APIRouter(prefix="/api/user/profile", tags=["profile"])

# Display names are for display: kept short and stripped of control characters so
# a name cannot inject newlines into the places that render it (agent greetings,
# admin tables, Telegram handoffs).
MAX_DISPLAY_NAME = 64

# How long an avatar URL may be. It is either our own `/uploads/avatars/<hex>.png`
# or an absolute URL, so a generous cap that still refuses a payload.
MAX_AVATAR_URL = 512


def _profile_dict(user: User) -> dict:
    return dict((user.settings or {}).get("profile") or {})


def _write_profile(user: User, db: Session, updates: dict) -> dict:
    """Merge into settings['profile'] without clobbering sibling keys.

    `user.settings` is a JSON blob and a read-modify-write is not atomic, so the
    row is locked for the read. Without the lock two concurrent writes — e.g. an
    avatar upload racing a display-name save — each read the same dict and the
    second silently drops the first's key.
    """
    locked = db.query(User).filter(User.id == user.id).with_for_update().first() or user
    settings_now = dict(locked.settings or {})
    profile = dict(settings_now.get("profile") or {})
    profile.update(updates)
    settings_now["profile"] = profile
    locked.settings = settings_now
    db.commit()
    db.refresh(locked)
    return profile


@router.get("")
async def get_profile(user: User = Depends(get_current_authenticated_user)):
    """The account card's own data.

    Readable with an API key: the extension shows who is signed in, and none of
    this is more sensitive than `/api/extension/bootstrap`, which already returns
    the account's balance.
    """
    profile = _profile_dict(user)
    return {
        "status": "success",
        "public_id": user.public_id,
        "display_name": profile.get("display_name") or "",
        "avatar_url": profile.get("avatar_url") or "",
        "plan": user.plan,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "has_password": bool(user.password_hash),
        # The login identifier cannot be reserved/admin-ish, and an account
        # without a password has nothing to prove with, so it must not be
        # renameable by whoever happens to hold the session.
        "can_change_public_id": bool(user.password_hash),
    }


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=MAX_DISPLAY_NAME)
    avatar_url: Optional[str] = Field(default=None, max_length=MAX_AVATAR_URL)


@router.patch("")
async def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Set the display name and/or avatar. Cosmetic, self-service, always self."""
    updates: dict = {}

    if payload.display_name is not None:
        # Strip control characters rather than rejecting: a paste that carries a
        # newline is a mistake, not an attack, and a name is not worth an error
        # dialog. Everything rendering this treats it as text.
        cleaned = "".join(ch for ch in payload.display_name if ch.isprintable()).strip()
        updates["display_name"] = cleaned[:MAX_DISPLAY_NAME]

    if payload.avatar_url is not None:
        url = payload.avatar_url.strip()
        # An empty string is the "remove my picture" signal, so it is allowed.
        # Anything else must be one of ours or an absolute https URL — a
        # `javascript:` or `data:` URL here would be stored XSS the moment some
        # other surface renders it in an <img src>.
        if url and not (url.startswith("/uploads/avatars/") or url.startswith("https://")):
            raise HTTPException(
                400,
                "Avatar must be an uploaded image or an https:// URL.",
            )
        updates["avatar_url"] = url

    if not updates:
        raise HTTPException(400, "Nothing to update.")

    profile = _write_profile(user, db, updates)
    return {
        "status": "success",
        "display_name": profile.get("display_name") or "",
        "avatar_url": profile.get("avatar_url") or "",
    }


class PublicIdChange(BaseModel):
    new_public_id: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)


@router.post("/public-id")
async def change_public_id(
    payload: PublicIdChange,
    request: Request,
    user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Rename the account's login identifier.

    Deliberately hard, because this is the credential the account signs in with:

      * a real session is required (an API key can never take over an account by
        renaming it — `require_session_auth` refuses a key outright);
      * the current password must be supplied and verified, so a session left open
        on a shared machine cannot be used to lock the owner out of their own ID;
      * the new ID goes through the SAME validator signup uses, so a rename cannot
        reach a reserved or admin-looking name that registration would refuse;
      * uniqueness is enforced case-insensitively — `RoniDev` and `ronidev` must
        not both exist, or the login lookup becomes ambiguous.
    """
    # Order matters: require_session_auth reads request.state.auth_via_api_key,
    # which does not exist until the auth dependency above has run.
    require_session_auth(request)

    new_id = (payload.new_public_id or "").strip()

    if not user.password_hash:
        raise HTTPException(
            400,
            "This account has no password set, so its identifier cannot be changed here.",
        )
    if not verify_password(payload.password, user.password_hash, user.password_salt or ""):
        raise HTTPException(403, "Incorrect password.")

    if new_id == user.public_id:
        raise HTTPException(400, "That is already your public ID.")

    if not validate_public_id(new_id):
        raise HTTPException(
            400,
            "Public ID must be 3-64 characters of letters, numbers, hyphens or "
            "underscores, and cannot be a reserved name.",
        )

    # Case-insensitive uniqueness: the login lookup is on the stored value, so two
    # ids differing only in case would make the account ambiguous to sign in to.
    clash = (
        db.query(User)
        .filter(User.public_id.ilike(new_id), User.id != user.id)
        .first()
    )
    if clash:
        raise HTTPException(409, "That public ID is already taken.")

    old_id = user.public_id
    user.public_id = new_id

    # Carry the user's own live sessions across the rename. The session row caches
    # public_id, and leaving it stale would show the old name on the account and
    # break any lookup that trusts the cached copy — the user would appear to have
    # been renamed in one place and not another.
    db.query(UserSession).filter(UserSession.user_id == user.id).update(
        {UserSession.public_id: new_id}, synchronize_session=False
    )
    db.commit()
    db.refresh(user)

    return {
        "status": "success",
        "public_id": user.public_id,
        "previous_public_id": old_id,
        "message": (
            f"Your public ID is now {user.public_id}. Sign in with it from now on. "
            "If a browser extension is connected, update its API key if it stops working."
        ),
    }
