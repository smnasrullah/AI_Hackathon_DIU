"""Observed synthetic data: floats, transactions, events, weather."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK, Money, TsTz, db_enum
from app.models.enums import EventType, TxnType


class FloatSnapshot(Base):
    """Hourly cash + e-money balance of one agent."""

    __tablename__ = "float_snapshots"
    __table_args__ = (
        UniqueConstraint("agent_id", "ts", name="uq_float_snapshots_agent_ts"),
        Index("ix_float_snapshots_ts", "ts"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    ts: Mapped[datetime] = mapped_column(TsTz)
    cash_balance: Mapped[Decimal] = mapped_column(Money)
    emoney_balance: Mapped[Decimal] = mapped_column(Money)
    is_holdout: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class Transaction(Base):
    """Cash-in / cash-out flow; one row may aggregate txn_count transactions in an hour."""

    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_agent_ts", "agent_id", "ts"),
        Index("ix_transactions_ts", "ts"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    ts: Mapped[datetime] = mapped_column(TsTz)
    txn_type: Mapped[TxnType] = mapped_column(db_enum(TxnType))
    amount_bdt: Mapped[Decimal] = mapped_column(Money)
    txn_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    is_holdout: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_window", "starts_at", "ends_at"),
        Index("ix_events_district", "district"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[EventType] = mapped_column(db_enum(EventType))
    name_en: Mapped[str] = mapped_column(Text)
    name_bn: Mapped[str] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(TsTz)
    ends_at: Mapped[datetime] = mapped_column(TsTz)
    # NULL = nationwide.
    district: Mapped[str | None] = mapped_column(Text)
    intensity: Mapped[Decimal] = mapped_column(Numeric(6, 3))


class WeatherDaily(Base):
    __tablename__ = "weather_daily"

    district: Mapped[str] = mapped_column(Text, primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    rain_mm: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    temp_c: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    severe: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
