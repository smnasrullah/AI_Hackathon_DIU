"""Forgot / reset password with single-use, hashed, short-lived tokens.

The request answer never says whether the account exists. A reset revokes every refresh token
of the user (all signed-in sessions) and every other open reset link. Passwords are never
logged or audited.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_password, hash_refresh_token
from app.models import AuditLog, LoginFailure, PasswordResetToken, RefreshToken, User
from app.services.auth import AuthError
from app.services.mailer import Mailer

ENTITY = "user"


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo is not None else ts.replace(tzinfo=UTC)


def _audit(session: Session, action: str, user: User | None, entity_id: str,
           payload: dict[str, str]) -> None:
    session.add(AuditLog(user_id=user.id if user else None, action=action, entity_type=ENTITY,
                         entity_id=entity_id, note=None, payload=payload))


def _recent_requests(session: Session, user_id: uuid.UUID, since: datetime) -> int:
    count = session.scalar(select(func.count()).select_from(PasswordResetToken).where(
        PasswordResetToken.user_id == user_id, PasswordResetToken.created_at >= since))
    return int(count or 0)


def request_reset(session: Session, email: str, ip: str, settings: Settings,
                  mailer: Mailer) -> None:
    """Issue and mail a link when an active account has this e-mail; otherwise do nothing.
    The caller answers the same either way."""
    now = datetime.now(UTC)
    email = email.strip().lower()
    user = session.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not user.is_active:
        outcome = "no_active_account"
    elif _recent_requests(session, user.id, now - timedelta(hours=1)) \
            >= settings.reset_per_account_per_hour:
        outcome = "throttled"
    else:
        outcome = "issued"
        raw = secrets.token_urlsafe(32)
        # Only the newest link works.
        session.execute(update(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
            .values(used_at=now))
        session.add(PasswordResetToken(
            user_id=user.id, token_hash=hash_refresh_token(raw), created_at=now,
            expires_at=now + timedelta(minutes=settings.reset_token_ttl_min)))
        # Fragment, not query: the token never reaches a server or proxy access log.
        link = f"{settings.public_base_url.rstrip('/')}/reset-password#token={raw}"
        mailer.send_password_reset(user.email, link, settings.reset_token_ttl_min)
    _audit(session, "auth.password_reset_request", user if outcome != "no_active_account" else None,
           str(user.id) if user else email, {"email": email, "ip": ip, "outcome": outcome})
    session.commit()


def reset_password(session: Session, raw_token: str, new_password: str, ip: str) -> None:
    """Spend the token and set the password. Unknown, used and expired tokens all raise the
    same `invalid_reset_token`."""
    now = datetime.now(UTC)
    row = session.scalar(select(PasswordResetToken).where(
        PasswordResetToken.token_hash == hash_refresh_token(raw_token)))
    user = session.get(User, row.user_id) if row is not None else None
    if (row is None or row.used_at is not None or _aware(row.expires_at) <= now
            or user is None or not user.is_active):
        raise AuthError("invalid_reset_token")
    user.password_hash = hash_password(new_password)
    session.execute(update(PasswordResetToken).where(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now))
    revoked = session.execute(update(RefreshToken).where(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now))
    session.execute(delete(LoginFailure).where(LoginFailure.email == user.email))
    _audit(session, "auth.password_reset", user, str(user.id),
           {"ip": ip, "sessions_revoked": str(int(getattr(revoked, "rowcount", 0) or 0))})
    session.commit()
