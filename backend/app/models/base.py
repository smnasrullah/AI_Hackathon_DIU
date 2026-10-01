from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, BigInteger, DateTime, Enum, Integer, Numeric, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.models.enums import PG_ENUM_NAMES

# BIGINT on Postgres; INTEGER on SQLite so the rowid autoincrement still works.
BigIntPK = BigInteger().with_variant(Integer(), "sqlite")
JsonDoc = JSON().with_variant(JSONB(), "postgresql")
Money = Numeric(14, 2)
Ratio = Numeric(8, 4)
TsTz = DateTime(timezone=True)


def db_enum(enum_cls: type[StrEnum]) -> Enum:
    """Store enum *values* in a named PG enum type (created by the migration)."""
    return Enum(
        enum_cls,
        name=PG_ENUM_NAMES[enum_cls],
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )


def created_at_col() -> Mapped[datetime]:
    return mapped_column(TsTz, server_default=func.now(), nullable=False)


class Base(DeclarativeBase):
    pass
