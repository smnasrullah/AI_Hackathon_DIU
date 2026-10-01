"""Login, refresh-token rotation (with reuse detection) and logout."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    burn_password_check,
    create_access_token,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.models import RefreshToken, User


class AuthError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class IssuedTokens:
    user: User
    access_token: str
    refresh_token: str
    expires_in: int


def _aware(ts: datetime) -> datetime:
    # SQLite drops tzinfo; stored values are always UTC.
    return ts if ts.tzinfo is not None else ts.replace(tzinfo=UTC)


def _issue(session: Session, user: User, settings: Settings, now: datetime) -> IssuedTokens:
    access, expires_in = create_access_token(user.id, user.role.value, settings, now)
    raw_refresh = new_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=now + timedelta(days=settings.jwt_refresh_ttl_days),
        )
    )
    return IssuedTokens(user, access, raw_refresh, expires_in)


def login(session: Session, email: str, password: str, settings: Settings) -> IssuedTokens:
    user = session.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        burn_password_check(password)
        raise AuthError("invalid_credentials")
    if not verify_password(password, user.password_hash) or not user.is_active:
        raise AuthError("invalid_credentials")
    tokens = _issue(session, user, settings, datetime.now(UTC))
    session.commit()
    return tokens


def _revoke_all(session: Session, user_id: uuid.UUID, now: datetime) -> None:
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def refresh(session: Session, raw_token: str, settings: Settings) -> IssuedTokens:
    now = datetime.now(UTC)
    row = session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    )
    if row is None:
        raise AuthError("invalid_refresh_token")
    if row.revoked_at is not None:
        # A rotated token came back: assume theft, end every session of this user.
        _revoke_all(session, row.user_id, now)
        session.commit()
        raise AuthError("invalid_refresh_token")
    user = session.get(User, row.user_id)
    if _aware(row.expires_at) <= now or user is None or not user.is_active:
        raise AuthError("invalid_refresh_token")
    row.revoked_at = now
    tokens = _issue(session, user, settings, now)
    session.commit()
    return tokens


def logout(session: Session, user: User, raw_token: str) -> None:
    """Revoke one refresh token of this user; unknown tokens are ignored."""
    row = session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(raw_token),
            RefreshToken.user_id == user.id,
        )
    )
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        session.commit()
