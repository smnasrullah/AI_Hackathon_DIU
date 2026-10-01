"""Advisory actions and human decisions: recommendations, swap suggestions, audit log."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Numeric, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK, JsonDoc, Money, TsTz, created_at_col, db_enum
from app.models.enums import FloatType, RecommendationKind, RecommendationStatus, SwapStatus


class Recommendation(Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        Index("ix_recommendations_agent_ts", "agent_id", "created_at"),
        Index("ix_recommendations_agent_status", "agent_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    model_version_id: Mapped[int | None] = mapped_column(ForeignKey("model_versions.id"))
    kind: Mapped[RecommendationKind] = mapped_column(db_enum(RecommendationKind))
    float_type: Mapped[FloatType] = mapped_column(db_enum(FloatType))
    amount_bdt: Mapped[Decimal] = mapped_column(Money)
    deadline_at: Mapped[datetime] = mapped_column(TsTz)
    rationale: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    status: Mapped[RecommendationStatus] = mapped_column(
        db_enum(RecommendationStatus), default=RecommendationStatus.open, server_default="open"
    )
    created_at: Mapped[datetime] = created_at_col()


class SwapSuggestion(Base):
    """Agent-to-agent float swap; a distributor approves or rejects it with a note."""

    __tablename__ = "swap_suggestions"
    __table_args__ = (
        CheckConstraint("donor_agent_id <> receiver_agent_id", name="ck_swap_suggestions_distinct"),
        Index("ix_swap_suggestions_status", "status"),
        Index("ix_swap_suggestions_donor", "donor_agent_id"),
        Index("ix_swap_suggestions_receiver", "receiver_agent_id"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    model_version_id: Mapped[int | None] = mapped_column(ForeignKey("model_versions.id"))
    donor_agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    receiver_agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    float_type: Mapped[FloatType] = mapped_column(db_enum(FloatType))
    amount_bdt: Mapped[Decimal] = mapped_column(Money)
    distance_km: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    van_trip_saved: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    score: Mapped[Decimal] = mapped_column(Numeric(10, 4))
    status: Mapped[SwapStatus] = mapped_column(
        db_enum(SwapStatus), default=SwapStatus.pending, server_default="pending"
    )
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(TsTz)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_entity", "entity_type", "entity_id"),
        Index("ix_audit_log_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    created_at: Mapped[datetime] = created_at_col()
