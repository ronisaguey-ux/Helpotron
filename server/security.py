import jwt
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from server.config import config

logger = logging.getLogger('helpotron.security')

JWT_SECRET = getattr(config, 'JWT_SECRET', 'helpotron_production_super_secret_key_change_me_in_env')
JWT_ALGORITHM = getattr(config, 'JWT_ALGORITHM', 'HS256')
JWT_EXPIRATION_HOURS = 24

def create_jwt_token(user_id: int, role: str = 'user', expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=JWT_EXPIRATION_HOURS))
    payload = {
        'sub': user_id,
        'role': role,
        'exp': expire,
        'iat': datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={'verify_exp': True, 'verify_signature': True, 'verify_sub': False}
            # verify_sub=False: PyJWT>=2.10 rejects integer `sub` claims by
            # default ("Subject must be a string"), but the app contract (and
            # the remediation plan's verification) uses `sub` as the int user
            # id — `User.id == payload['sub']` queries need the int form.
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning('Expired JWT token signature presented')
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f'Invalid JWT token presented: {e}')
        return None
