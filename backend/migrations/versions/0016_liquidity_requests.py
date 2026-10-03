"""liquidity_requests + liquidity_request_recipients (broadcast help requests);
notification_type gains help_request

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-03
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies of app.models.enums at this revision.
NEW_ENUMS: dict[str, tuple[str, ...]] = {
    "help_status": ("open", "claimed", "fulfilled", "expired", "cancelled"),
    "help_response": ("none", "accepted", "declined", "expired", "superseded"),
    "help_origin": ("system", "user"),
}
OLD_ENUMS: dict[str, tuple[str, ...]] = {
    "float_type": ("cash", "emoney"),
    "user_role": ("agent", "distributor", "admin"),
}
OLD_NOTIFICATION_TYPES = ("risk_change", "swap_offer", "swap_decision", "anomaly", "system")
TSTZ = sa.DateTime(timezone=True)
BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
ACTIVE = "status IN ('open', 'claimed')"


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _enum(name: str) -> sa.Enum:
    values = NEW_ENUMS.get(name) or OLD_ENUMS[name]
    if _is_pg():
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.Enum(*values, name=name, native_enum=False)


def upgrade() -> None:
    if _is_pg():
        for name, values in NEW_ENUMS.items():
            postgresql.ENUM(*values, name=name).create(op.get_bind(), checkfirst=True)
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'help_request'")
    op.create_table(
        "liquidity_requests",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("requester_agent_id", sa.Integer(),
                  sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("float_type", _enum("float_type"), nullable=False),
        sa.Column("amount_needed", sa.Numeric(14, 2), nullable=False),
        sa.Column("needed_by", TSTZ, nullable=False),
        sa.Column("reason_summary", sa.Text(), nullable=True),
        sa.Column("status", _enum("help_status"), server_default="open", nullable=False),
        sa.Column("claimed_by_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("claimed_at", TSTZ, nullable=True),
        sa.Column("claim_expires_at", TSTZ, nullable=True),
        sa.Column("fulfilled_at", TSTZ, nullable=True),
        sa.Column("wave_number", sa.SmallInteger(), server_default="1", nullable=False),
        sa.Column("created_by", _enum("help_origin"), nullable=False),
        sa.Column("dedupe_key", sa.Text(), nullable=False),
        sa.Column("created_at", TSTZ, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TSTZ, server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_needed > 0", name="ck_liquidity_requests_amount"),
    )
    op.create_index("ix_liquidity_requests_requester_created", "liquidity_requests",
                    ["requester_agent_id", "created_at"])
    op.create_index("ix_liquidity_requests_status", "liquidity_requests", ["status"])
    op.create_index("uq_liquidity_requests_active", "liquidity_requests", ["dedupe_key"],
                    unique=True, postgresql_where=sa.text(ACTIVE), sqlite_where=sa.text(ACTIVE))
    op.create_table(
        "liquidity_request_recipients",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("request_id", BIGINT_PK,
                  sa.ForeignKey("liquidity_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_user_id", sa.Uuid(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_role", _enum("user_role"), nullable=False),
        sa.Column("wave_number", sa.SmallInteger(), server_default="1", nullable=False),
        sa.Column("notified_at", TSTZ, nullable=True),
        sa.Column("response", _enum("help_response"), server_default="none", nullable=False),
        sa.Column("responded_at", TSTZ, nullable=True),
        sa.Column("distance_km", sa.Numeric(8, 2), nullable=True),
        sa.UniqueConstraint("request_id", "recipient_user_id",
                            name="uq_liquidity_request_recipients_user"),
    )
    op.create_index("ix_liquidity_request_recipients_user", "liquidity_request_recipients",
                    ["recipient_user_id"])


def downgrade() -> None:
    op.drop_table("liquidity_request_recipients")
    op.drop_table("liquidity_requests")
    op.execute("DELETE FROM notifications WHERE type = 'help_request'")
    if _is_pg():
        for name in reversed(list(NEW_ENUMS)):
            postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
        # Postgres cannot drop one enum value: rebuild the type without it.
        values = ", ".join(f"'{v}'" for v in OLD_NOTIFICATION_TYPES)
        op.execute("ALTER TYPE notification_type RENAME TO notification_type_old")
        op.execute(f"CREATE TYPE notification_type AS ENUM ({values})")
        op.execute("ALTER TABLE notifications ALTER COLUMN type TYPE notification_type"
                   " USING type::text::notification_type")
        op.execute("DROP TYPE notification_type_old")
