"""help requests: structured reason (code, params, coarse category), urgent flag, stock-out time,
last timed-out claimant (late delivery)

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-03
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TSTZ = sa.DateTime(timezone=True)
JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
# Frozen copy of app.models.enums.HelpReasonCategory at this revision.
CATEGORY = ("salary_day", "eid", "holiday", "market_day", "weather", "high_demand", "unknown")


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _category() -> sa.Enum:
    if _is_pg():
        return postgresql.ENUM(*CATEGORY, name="help_reason_category", create_type=False)
    return sa.Enum(*CATEGORY, name="help_reason_category", native_enum=False)


def upgrade() -> None:
    if _is_pg():
        postgresql.ENUM(*CATEGORY, name="help_reason_category").create(op.get_bind(),
                                                                        checkfirst=True)
    with op.batch_alter_table("liquidity_requests") as batch:
        batch.add_column(sa.Column("reason_code", sa.Text(), nullable=True))
        batch.add_column(sa.Column("reason_params", JSON_DOC, nullable=True))
        batch.add_column(sa.Column("reason_category", _category(), server_default="unknown",
                                   nullable=False))
        batch.add_column(sa.Column("stockout_at", TSTZ, nullable=True))
        batch.add_column(sa.Column("urgent", sa.Boolean(), server_default=sa.false(),
                                   nullable=False))
        batch.add_column(sa.Column("lapsed_claimant_user_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key("fk_liquidity_requests_lapsed_claimant", "users",
                                 ["lapsed_claimant_user_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("liquidity_requests") as batch:
        batch.drop_constraint("fk_liquidity_requests_lapsed_claimant", type_="foreignkey")
        batch.drop_column("lapsed_claimant_user_id")
        batch.drop_column("urgent")
        batch.drop_column("stockout_at")
        batch.drop_column("reason_category")
        batch.drop_column("reason_params")
        batch.drop_column("reason_code")
    if _is_pg():
        postgresql.ENUM(name="help_reason_category").drop(op.get_bind(), checkfirst=True)
