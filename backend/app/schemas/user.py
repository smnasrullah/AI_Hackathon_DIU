import re
import uuid
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints, model_validator

from app.models.enums import Lang, Theme, UserRole

AvatarColor = Literal["teal", "indigo", "amber", "rose", "emerald", "sky", "violet", "slate"]
# Phone-number-like runs (any script's digits) and e-mail addresses are refused.
_PII = re.compile(r"@|\d[\d\s-]{5,}\d")


def _no_pii(value: str) -> str:
    if _PII.search(value) or not value.isprintable():
        raise ValueError("display_name_not_allowed")
    return value


DisplayName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40),
    AfterValidator(_no_pii),
]


class PreferencesUpdate(BaseModel):
    """Only fields sent (non-null) change. `lang` is accepted as an alias of `language`."""

    model_config = ConfigDict(extra="forbid")

    language: Lang | None = None
    theme: Theme | None = None
    digits: Lang | None = None
    notify_in_app: bool | None = None
    tour_done: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def _lang_alias(cls, data: object) -> object:
        if isinstance(data, dict) and "lang" in data and "language" not in data:
            return {("language" if k == "lang" else k): v for k, v in data.items()}
        return data

    @model_validator(mode="after")
    def _not_empty(self) -> Self:
        if all(getattr(self, f) is None for f in type(self).model_fields):
            raise ValueError("empty_update")
        return self


class LinkedEntity(BaseModel):
    id: int
    code: str
    name: str


class ProfileOut(BaseModel):
    id: uuid.UUID
    email: str  # synthetic demo address
    role: UserRole
    display_name: str  # falls back to the seeded demo name
    avatar_color: AvatarColor | None
    agent: LinkedEntity | None
    distributor: LinkedEntity | None
    last_login_at: datetime | None
    created_at: datetime


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName | None = None
    avatar_color: AvatarColor | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> Self:
        if self.display_name is None and self.avatar_color is None:
            raise ValueError("empty_update")
        return self
