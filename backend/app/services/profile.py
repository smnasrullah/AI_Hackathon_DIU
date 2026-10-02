"""The caller's own profile and preferences. No real PII is stored (synthetic demo accounts)."""

from typing import get_args

from sqlalchemy.orm import Session

from app.models import Agent, Distributor, User
from app.schemas.user import AvatarColor, LinkedEntity, PreferencesUpdate, ProfileOut, ProfileUpdate
from app.services.forecast import _utc

_COLORS: tuple[AvatarColor, ...] = get_args(AvatarColor)


def _avatar(value: str | None) -> AvatarColor | None:
    for color in _COLORS:
        if value == color:
            return color
    return None


def profile(session: Session, user: User) -> ProfileOut:
    agent = session.get(Agent, user.agent_id) if user.agent_id is not None else None
    dist_id = agent.distributor_id if agent is not None else user.distributor_id
    dist = session.get(Distributor, dist_id) if dist_id is not None else None
    return ProfileOut(
        id=user.id, email=user.email, role=user.role,
        display_name=user.display_name or user.full_name, avatar_color=_avatar(user.avatar_color),
        agent=LinkedEntity(id=agent.id, code=agent.code, name=agent.name) if agent else None,
        distributor=LinkedEntity(id=dist.id, code=dist.code, name=dist.name) if dist else None,
        last_login_at=_utc(user.last_login_at) if user.last_login_at else None,
        created_at=_utc(user.created_at),
    )


def update_profile(session: Session, user: User, body: ProfileUpdate) -> ProfileOut:
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.avatar_color is not None:
        user.avatar_color = body.avatar_color
    session.flush()
    return profile(session, user)


def update_preferences(session: Session, user: User, body: PreferencesUpdate) -> None:
    if body.language is not None:
        user.lang = body.language
    if body.theme is not None:
        user.theme = body.theme
    if body.digits is not None:
        user.digits = body.digits
    if body.notify_in_app is not None:
        user.notify_in_app = body.notify_in_app
    if body.tour_done is not None:
        user.tour_done = body.tour_done
    session.flush()
