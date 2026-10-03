"""Admin background jobs (synthetic data generation, model retraining) with progress."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, SmallInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK, JsonDoc, TsTz, created_at_col


class AdminJob(Base):
    """One run. status: queued -> running -> succeeded | failed. progress 0..100."""

    __tablename__ = "admin_jobs"
    __table_args__ = (Index("ix_admin_jobs_status", "status"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    kind: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="queued", server_default="queued")
    progress: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    step: Mapped[str] = mapped_column(Text, default="queued", server_default="queued")
    error: Mapped[str | None] = mapped_column(Text)
    result: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    started_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = created_at_col()
    finished_at: Mapped[datetime | None] = mapped_column(TsTz)
