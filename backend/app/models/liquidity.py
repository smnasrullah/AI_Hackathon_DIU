"""Liquidity help requests: one agent short of float asks several helpers, exactly one wins.

Coordination only: nothing here moves money. States and rules: app/rules/help_request_rules.py.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK, Money, TsTz, created_at_col, db_enum
from app.models.enums import FloatType, HelpOrigin, HelpResponse, HelpStatus, UserRole

ACTIVE_HELP = "status IN ('open', 'claimed')"


class LiquidityRequest(Base):
    __tablename__ = "liquidity_requests"
    __table_args__ = (
        CheckConstraint("amount_needed > 0", name="ck_liquidity_requests_amount"),
        Index("ix_liquidity_requests_requester_created", "requester_agent_id", "created_at"),
        Index("ix_liquidity_requests_status", "status"),
        # One active request per agent and float (dedupe_key = "<agent id>:<float type>").
        Index("uq_liquidity_requests_active", "dedupe_key", unique=True,
              postgresql_where=text(ACTIVE_HELP), sqlite_where=text(ACTIVE_HELP)),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    requester_agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    float_type: Mapped[FloatType] = mapped_column(db_enum(FloatType))
    amount_needed: Mapped[Decimal] = mapped_column(Money)
    needed_by: Mapped[datetime] = mapped_column(TsTz)
    reason_summary: Mapped[str | None] = mapped_column(Text)
    status: Mapped[HelpStatus] = mapped_column(
        db_enum(HelpStatus), default=HelpStatus.open, server_default="open")
    claimed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    claimed_at: Mapped[datetime | None] = mapped_column(TsTz)
    claim_expires_at: Mapped[datetime | None] = mapped_column(TsTz)
    fulfilled_at: Mapped[datetime | None] = mapped_column(TsTz)
    wave_number: Mapped[int] = mapped_column(SmallInteger, default=1, server_default="1")
    created_by: Mapped[HelpOrigin] = mapped_column(db_enum(HelpOrigin))
    dedupe_key: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = created_at_col()


class LiquidityRequestRecipient(Base):
    __tablename__ = "liquidity_request_recipients"
    __table_args__ = (
        UniqueConstraint("request_id", "recipient_user_id",
                         name="uq_liquidity_request_recipients_user"),
        Index("ix_liquidity_request_recipients_user", "recipient_user_id"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("liquidity_requests.id", ondelete="CASCADE"))
    recipient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"))
    recipient_role: Mapped[UserRole] = mapped_column(db_enum(UserRole))
    wave_number: Mapped[int] = mapped_column(SmallInteger, default=1, server_default="1")
    notified_at: Mapped[datetime | None] = mapped_column(TsTz)
    response: Mapped[HelpResponse] = mapped_column(
        db_enum(HelpResponse), default=HelpResponse.none, server_default="none")
    responded_at: Mapped[datetime | None] = mapped_column(TsTz)
    distance_km: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
