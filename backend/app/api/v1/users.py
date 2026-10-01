from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.schemas.auth import UserOut
from app.schemas.user import PreferencesUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me/preferences", response_model=UserOut)
def update_preferences(body: PreferencesUpdate, user: CurrentUser, session: SessionDep) -> UserOut:
    user.lang = body.lang
    session.commit()
    session.refresh(user)
    return UserOut.model_validate(user)
