"""Advisory actions and human decisions: recommendations, requests, swaps, audit log."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Numeric, Text, false, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK, JsonDoc, Money, TsTz, created_at_col, db_enum
from app.models.enums import (
    FloatType,
    RecommendationChannel,
    RecommendationKind,
    RecommendationStatus,
    RequestStatus,
    SwapResponse,
    SwapStatus,
)


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
    # NULL only on rows written before the channel rule (migration 0006).
    channel: Mapped[RecommendationChannel | None] = mapped_column(db_enum(RecommendationChannel))
    van_route_id: Mapped[str | None] = mapped_column(Text)  # one van trip per cluster
    rationale: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    status: Mapped[RecommendationStatus] = mapped_column(
        db_enum(RecommendationStatus), default=RecommendationStatus.open, server_default="open"
    )
    created_at: Mapped[datetime] = created_at_col()


ACTIVE_REQUEST = "status IN ('requested', 'approved', 'fulfilled')"


class RecommendationRequest(Base):
    """Agent asks the distributor to act on a recommendation; the distributor decides.

    requested -> approved -> fulfilled; requested -> declined | cancelled. At most one active
    (requested / approved / fulfilled) request per recommendation.
    """

    __tablename__ = "recommendation_requests"
    __table_args__ = (
        Index("ix_recommendation_requests_status", "status"),
        Index("uq_recommendation_requests_active", "recommendation_id", unique=True,
              postgresql_where=text(ACTIVE_REQUEST), sqlite_where=text(ACTIVE_REQUEST)),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    recommendation_id: Mapped[int] = mapped_column(
        ForeignKey("recommendations.id", ondelete="CASCADE"))
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    channel: Mapped[RecommendationChannel | None] = mapped_column(db_enum(RecommendationChannel))
    amount_bdt: Mapped[Decimal] = mapped_column(Money)
    status: Mapped[RequestStatus] = mapped_column(
        db_enum(RequestStatus), default=RequestStatus.requested, server_default="requested"
    )
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()
    decided_at: Mapped[datetime | None] = mapped_column(TsTz)


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
    # Each agent's own answer; advisory input to the distributor's decision.
    donor_response: Mapped[SwapResponse | None] = mapped_column(db_enum(SwapResponse))
    receiver_response: Mapped[SwapResponse | None] = mapped_column(db_enum(SwapResponse))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(TsTz)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_entity", "entity_type", "entity_id"),
        Index("ix_audit_log_created_at", "created_at"),
        Index("ix_audit_log_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    # None only for denied demo-login attempts on an account that does not exist.
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    created_at: Mapped[datetime] = created_at_col()
