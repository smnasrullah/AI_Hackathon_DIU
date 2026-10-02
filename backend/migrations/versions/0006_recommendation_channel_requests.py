"""recommendations: channel + van_route_id; recommendation_requests (agent -> distributor)

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENUMS = {
    "recommendation_channel": ("swap", "top_up", "van", "self_fetch", "urgent_manual"),
    "request_status": ("requested", "approved", "declined", "fulfilled", "cancelled"),
}
TSTZ = sa.DateTime(timezone=True)
BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
ACTIVE = "status IN ('requested', 'approved', 'fulfilled')"


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _enum(name: str) -> sa.Enum:
    if _is_pg():
        return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)
    return sa.Enum(*ENUMS[name], name=name, native_enum=False)


def upgrade() -> None:
    if _is_pg():
        for name, values in ENUMS.items():
            postgresql.ENUM(*values, name=name).create(op.get_bind(), checkfirst=True)
    with op.batch_alter_table("recommendations") as batch:
        batch.add_column(sa.Column("channel", _enum("recommendation_channel"), nullable=True))
        batch.add_column(sa.Column("van_route_id", sa.Text(), nullable=True))
    op.create_table(
        "recommendation_requests",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("recommendation_id", BIGINT_PK,
                  sa.ForeignKey("recommendations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requested_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("channel", _enum("recommendation_channel"), nullable=True),
        sa.Column("amount_bdt", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", _enum("request_status"), server_default="requested",
                  nullable=False),
        sa.Column("decided_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", TSTZ, server_default=sa.func.now(), nullable=False),
        sa.Column("decided_at", TSTZ, nullable=True),
    )
    op.create_index("ix_recommendation_requests_status", "recommendation_requests", ["status"])
    op.create_index("uq_recommendation_requests_active", "recommendation_requests",
                    ["recommendation_id"], unique=True, postgresql_where=sa.text(ACTIVE),
                    sqlite_where=sa.text(ACTIVE))


def downgrade() -> None:
    op.drop_table("recommendation_requests")
    with op.batch_alter_table("recommendations") as batch:
        batch.drop_column("van_route_id")
        batch.drop_column("channel")
    if _is_pg():
        for name in ENUMS:
            postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
