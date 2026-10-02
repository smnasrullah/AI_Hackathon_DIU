"""stockout_predictions.prob_by_hour: P(stockout by hour h), h = 0..72, for the map time scrubber

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("stockout_predictions", sa.Column("prob_by_hour", JSON_DOC, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("stockout_predictions") as batch:
        batch.drop_column("prob_by_hour")
