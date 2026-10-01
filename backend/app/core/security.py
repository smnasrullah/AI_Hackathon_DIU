"""Passwords (bcrypt), access JWTs (HS256) and opaque refresh tokens (stored hashed)."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import bcrypt
import jwt

from app.core.config import Settings

JWT_ALGORITHM = "HS256"


class TokenError(Exception):
    """Access token rejected; `code` is `token_expired` or `invalid_token`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False


@lru_cache
def _dummy_hash() -> str:
    return hash_password(secrets.token_hex(16))


def burn_password_check(password: str) -> None:
    """Spend one bcrypt check so unknown emails take as long as wrong passwords."""
    verify_password(password, _dummy_hash())


def create_access_token(
    user_id: uuid.UUID, role: str, settings: Settings, now: datetime | None = None
) -> tuple[str, int]:
    """Return (jwt, ttl seconds)."""
    issued = now or datetime.now(UTC)
    ttl = timedelta(minutes=settings.jwt_access_ttl_min)
    claims = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": issued,
        "exp": issued + ttl,
        "jti": secrets.token_hex(8),
    }
    token = jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm=JWT_ALGORITHM)
    return token, int(ttl.total_seconds())


def decode_access_token(token: str, settings: Settings) -> uuid.UUID:
    """Return the user id in a valid access token; raise TokenError otherwise."""
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("invalid_token") from exc
    if claims.get("type") != "access":
        raise TokenError("invalid_token")
    try:
        return uuid.UUID(str(claims["sub"]))
    except ValueError as exc:
        raise TokenError("invalid_token") from exc


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
