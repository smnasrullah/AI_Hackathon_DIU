import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Lang, Theme, UserRole

PASSWORD_MIN = 8


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class DemoLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: UserRole


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=128)


class ChangePasswordResponse(BaseModel):
    other_sessions_revoked: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    agent_id: int | None
    distributor_id: int | None
    lang: Lang
    theme: Theme
    digits: Lang
    notify_in_app: bool
    tour_done: bool
    display_name: str | None
    avatar_color: str | None
    last_login_at: datetime | None


class TokenResponse(BaseModel):
    """The refresh token is never in the body: it travels only in the httpOnly cookie."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut
