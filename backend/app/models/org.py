"""Organisation: distributors, agents, users, refresh tokens."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    Uuid,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Money, TsTz, created_at_col, db_enum
from app.models.enums import Lang, UrbanRural, UserRole


class Distributor(Base):
    __tablename__ = "distributors"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    region: Mapped[str] = mapped_column(Text)
    district: Mapped[str] = mapped_column(Text)
    hub_lat: Mapped[float] = mapped_column(Float)
    hub_lng: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = created_at_col()


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (
        CheckConstraint("tier BETWEEN 1 AND 3", name="ck_agents_tier"),
        Index("ix_agents_distributor_id", "distributor_id"),
        Index("ix_agents_region_district", "region", "district"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    distributor_id: Mapped[int] = mapped_column(ForeignKey("distributors.id", ondelete="RESTRICT"))
    region: Mapped[str] = mapped_column(Text)
    district: Mapped[str] = mapped_column(Text)
    upazila: Mapped[str | None] = mapped_column(Text)
    urban_rural: Mapped[UrbanRural] = mapped_column(db_enum(UrbanRural))
    # 1 = high-volume agent, 3 = small agent.
    tier: Mapped[int] = mapped_column(SmallInteger)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    cash_capacity: Mapped[Decimal] = mapped_column(Money)
    emoney_capacity: Mapped[Decimal] = mapped_column(Money)
    opened_on: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    created_at: Mapped[datetime] = created_at_col()


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "(role = 'agent' AND agent_id IS NOT NULL)"
            " OR (role = 'distributor' AND distributor_id IS NOT NULL)"
            " OR role = 'admin'",
            name="ck_users_role_scope",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(Text, unique=True)
    full_name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[UserRole] = mapped_column(db_enum(UserRole))
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"))
    distributor_id: Mapped[int | None] = mapped_column(
        ForeignKey("distributors.id")
    )
    lang: Mapped[Lang] = mapped_column(db_enum(Lang), default=Lang.bn, server_default="bn")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    created_at: Mapped[datetime] = created_at_col()


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    expires_at: Mapped[datetime] = mapped_column(TsTz)
    revoked_at: Mapped[datetime | None] = mapped_column(TsTz)
    created_at: Mapped[datetime] = created_at_col()
