"""Self-signup: always a pending, inactive agent with no agent link. An admin approves it
(PATCH /admin/users/{id}, is_active + agent_id), which is when it can sign in."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import AuditLog, User
from app.models.enums import UserRole
from app.services.auth import AuthError

# Least-privileged role; the client never chooses it.
SIGNUP_ROLE = UserRole.agent


def _audit(session: Session, user: User | None, email: str, ip: str, outcome: str) -> None:
    session.add(AuditLog(user_id=user.id if user else None, action="auth.signup",
                         entity_type="user", entity_id=str(user.id) if user else email,
                         note=None, payload={"email": email, "ip": ip, "outcome": outcome,
                                             "role": SIGNUP_ROLE.value}))


def signup(session: Session, full_name: str, email: str, password: str, ip: str) -> User:
    """Create the pending account. A taken e-mail raises `signup_rejected` (the reply does not
    say why). The password is hashed first on both paths, so timing does not tell either."""
    password_hash = hash_password(password)
    taken = session.scalar(select(User.id).where(func.lower(User.email) == email)) is not None
    if taken:
        _audit(session, None, email, ip, "rejected")
        session.commit()
        raise AuthError("signup_rejected")
    user = User(email=email, full_name=full_name, password_hash=password_hash,
                role=SIGNUP_ROLE, agent_id=None, distributor_id=None,
                is_active=False, is_pending=True, is_demo=False)
    session.add(user)
    session.flush()
    _audit(session, user, email, ip, "pending")  # never the password
    session.commit()
    return user
