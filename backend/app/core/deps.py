"""Request dependencies: current user, role gate, agent scoping.

Scoping: agent -> own agent_id only; distributor -> agents of own distributor_id; admin -> all.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_session
from app.core.security import TokenError, decode_access_token
from app.models import Agent, User
from app.models.enums import UserRole

_bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[Session, Depends(get_session)]


def _unauthorized(code: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail=code, headers={"WWW-Authenticate": "Bearer"}
    )


def forbidden() -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")


def get_current_user(
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if creds is None:
        raise _unauthorized("not_authenticated")
    try:
        user_id = decode_access_token(creds.credentials, get_settings())
    except TokenError as exc:
        raise _unauthorized(exc.code) from exc
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("invalid_token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    allowed = frozenset(roles)

    def _check(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise forbidden()
        return user

    return _check


def can_access_agent(user: User, agent: Agent) -> bool:
    if user.role == UserRole.admin:
        return True
    if user.role == UserRole.distributor:
        return user.distributor_id is not None and agent.distributor_id == user.distributor_id
    return user.agent_id is not None and agent.id == user.agent_id


def scoped_agents_query(user: User) -> Select[tuple[Agent]]:
    query = select(Agent).order_by(Agent.code)
    if user.role == UserRole.distributor:
        return query.where(Agent.distributor_id == user.distributor_id)
    if user.role == UserRole.agent:
        return query.where(Agent.id == user.agent_id)
    return query


def get_scoped_agent(agent_id: int, user: CurrentUser, session: SessionDep) -> Agent:
    """Path `{agent_id}` resolved within the caller's scope.

    Out-of-scope and unknown ids both give 403 for non-admins, so ids cannot be probed.
    """
    agent = session.get(Agent, agent_id)
    if agent is not None and can_access_agent(user, agent):
        return agent
    if agent is None and user.role == UserRole.admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="agent_not_found")
    raise forbidden()


ScopedAgent = Annotated[Agent, Depends(get_scoped_agent)]
