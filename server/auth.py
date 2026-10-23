"""JWT and authentication utilities.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import config
from .database import User, get_db
from .security import (
    JWT_SECRET,
    JWT_ALGORITHM,
    verify_jwt_token as _sec_verify_jwt_token,
    is_admin_user,
    is_user_banned,
    SessionStore,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def verify_jwt_token(token: str) -> dict:
    """Verifies a JWT token, enforcing revocation and signature checks."""
    payload = _sec_verify_jwt_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def require_admin_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Requires an authenticated admin user via bearer token or session."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Strip 'Bearer ' if present in the token string
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    user = None
    # 1. Try JWT verification
    payload = _sec_verify_jwt_token(token)
    if payload and "sub" in payload:
        sub_val = payload["sub"]
        if str(sub_val).isdigit():
            user = db.query(User).filter(User.id == int(sub_val)).first()
        else:
            user = db.query(User).filter(User.public_id == str(sub_val)).first()

    # 2. Try DB-backed session token if not valid JWT
    if not user:
        sess = SessionStore.get_session(token)
        if sess and "user_id" in sess:
            user = db.query(User).filter(User.id == sess["user_id"]).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    if is_user_banned(user):
        raise HTTPException(status_code=403, detail="Account suspended by the operator")

    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin privileges required")

    return user
