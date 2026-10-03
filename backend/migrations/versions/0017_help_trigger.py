"""help trigger: wave start time and simulated flag on help requests; agent opt-out

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-03
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    with op.batch_alter_table("liquidity_requests") as batch:
        batch.add_column(sa.Column("wave_started_at", TSTZ, nullable=True))
        batch.add_column(sa.Column("simulated", sa.Boolean(), server_default=sa.false(),
                                   nullable=False))
    with op.batch_alter_table("agents") as batch:
        batch.add_column(sa.Column("help_opt_out", sa.Boolean(), server_default=sa.false(),
                                   nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("agents") as batch:
        batch.drop_column("help_opt_out")
    with op.batch_alter_table("liquidity_requests") as batch:
        batch.drop_column("simulated")
        batch.drop_column("wave_started_at")
