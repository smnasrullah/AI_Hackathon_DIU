import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.enums import Lang, Theme, UserRole

PASSWORD_MIN = 8
Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3,
                                         max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class DemoLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: UserRole


class SignupRequest(BaseModel):
    """No role field: self-signup always creates a pending agent. Extra fields are rejected."""

    model_config = ConfigDict(extra="forbid")

    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1,
                                                max_length=120)]
    email: Email
    password: str = Field(min_length=PASSWORD_MIN, max_length=128)


class SignupResponse(BaseModel):
    status: Literal["pending_approval"] = "pending_approval"


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)


class ForgotPasswordResponse(BaseModel):
    """Same body whether or not the account exists."""

    status: Literal["reset_requested"] = "reset_requested"


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=16, max_length=128)
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=128)


class ResetPasswordResponse(BaseModel):
    status: Literal["password_reset"] = "password_reset"


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
