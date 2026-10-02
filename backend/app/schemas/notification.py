from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import NotificationSeverity, NotificationType

Param = str | int | float | bool | None


class NotificationItem(BaseModel):
    """Text is built client-side from `title_key` + `params` (bn/en i18n)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationType
    severity: NotificationSeverity
    title_key: str
    params: dict[str, Param]
    entity_type: str | None  # agent | swap | anomaly | distributor
    entity_id: str | None  # null: the list page of entity_type
    read_at: datetime | None
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationItem]
    total: int
    unread_count: int
    page: int
    page_size: int


class ReadAllResult(BaseModel):
    updated: int
