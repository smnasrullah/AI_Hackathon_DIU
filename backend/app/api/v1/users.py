from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.schemas.auth import UserOut
from app.schemas.user import PreferencesUpdate, ProfileOut, ProfileUpdate
from app.services import profile

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me/preferences", response_model=UserOut)
def update_preferences(body: PreferencesUpdate, user: CurrentUser, session: SessionDep) -> UserOut:
    """Language, theme, digits, in-app notifications, onboarding tour; only sent fields change."""
    profile.update_preferences(session, user, body)
    session.commit()
    session.refresh(user)
    return UserOut.model_validate(user)


@router.get("/me/profile", response_model=ProfileOut)
def get_profile(user: CurrentUser, session: SessionDep) -> ProfileOut:
    return profile.profile(session, user)


@router.patch("/me/profile", response_model=ProfileOut)
def update_profile(body: ProfileUpdate, user: CurrentUser, session: SessionDep) -> ProfileOut:
    """Display name (no e-mail / phone numbers) and avatar colour token."""
    result = profile.update_profile(session, user, body)
    session.commit()
    return result
