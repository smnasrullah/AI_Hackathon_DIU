"""impact_results: one row per scenario, distributor and holdout day (+ turned-away value)

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK = "fk_impact_results_distributor_id"


def upgrade() -> None:
    with op.batch_alter_table("impact_results") as batch:
        batch.add_column(sa.Column("distributor_id", sa.Integer(),
                                   sa.ForeignKey("distributors.id", name=FK),
                                   nullable=True))
        batch.add_column(sa.Column("value_lost_bdt", sa.Numeric(14, 2), server_default="0",
                                   nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("impact_results") as batch:
        batch.drop_column("value_lost_bdt")
        batch.drop_column("distributor_id")
