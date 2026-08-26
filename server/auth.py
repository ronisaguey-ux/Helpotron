"""JWT and authentication utilities.
"""

from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import config
from .database import User, get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

def verify_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, config.jwt_secret, algorithms=["HS256"])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def require_admin_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_jwt_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    user = db.query(User).filter(User.public_id == user_id).first()
    if not user or getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user
