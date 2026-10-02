"""In-app notifications: i18n key + params per user, optional link to the entity it is about."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK, JsonDoc, TsTz, created_at_col, db_enum
from app.models.enums import NotificationSeverity, NotificationType


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", "created_at"),
        Index("ix_notifications_user_read", "user_id", "read_at"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationType] = mapped_column(db_enum(NotificationType))
    severity: Mapped[NotificationSeverity] = mapped_column(db_enum(NotificationSeverity))
    title_key: Mapped[str] = mapped_column(Text)
    params: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[str | None] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(TsTz)
    created_at: Mapped[datetime] = created_at_col()
