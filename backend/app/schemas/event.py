from datetime import datetime, timedelta
from typing import Annotated

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.enums import EventType

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
MAX_SPAN = timedelta(days=60)


class EventIn(BaseModel):
    type: EventType
    name_en: Name
    name_bn: Name
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    district: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1,
                                               max_length=80)] | None = None  # None = nationwide
    # Peak demand multiplier (2.3 = x2.3; 0.7 = -30%).
    intensity: Annotated[float, Field(gt=0, le=10)] = 1.0

    @model_validator(mode="after")
    def _window(self) -> "EventIn":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if self.ends_at - self.starts_at > MAX_SPAN:
            raise ValueError("event may span at most 60 days")
        return self


class EventItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: EventType
    name_en: str
    name_bn: str
    starts_at: datetime
    ends_at: datetime
    district: str | None
    intensity: float


class EventPage(BaseModel):
    items: list[EventItem]
    total: int
    page: int
    page_size: int
