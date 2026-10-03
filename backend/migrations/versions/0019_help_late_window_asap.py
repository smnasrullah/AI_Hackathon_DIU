"""help requests: expired_at (late-confirm grace window) and deadline_after_stockout (the
deadline floor put needed_by after the forecast stock-out: "as soon as possible")

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-03
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("liquidity_requests") as batch:
        batch.add_column(sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("deadline_after_stockout", sa.Boolean(),
                                   server_default=sa.false(), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("liquidity_requests") as batch:
        batch.drop_column("deadline_after_stockout")
        batch.drop_column("expired_at")
