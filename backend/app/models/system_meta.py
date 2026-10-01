from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SystemMeta(Base):
    """Key/value store: seed, data_version, sim_now, bootstrap_state."""

    __tablename__ = "system_meta"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
