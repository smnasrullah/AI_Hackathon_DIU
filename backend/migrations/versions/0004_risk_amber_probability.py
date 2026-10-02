"""risk: level yellow -> amber, risk_levels.probability

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RATIO = sa.Numeric(8, 4)


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _rename_level(old: str, new: str) -> None:
    if _is_pg():
        op.execute(f"ALTER TYPE risk_level RENAME VALUE '{old}' TO '{new}'")
    else:
        op.execute(f"UPDATE risk_levels SET level = '{new}' WHERE level = '{old}'")


def upgrade() -> None:
    _rename_level("yellow", "amber")
    # Precomputed at bootstrap; rows from before this revision have no probability.
    op.execute("DELETE FROM risk_levels")
    column = sa.Column("probability", RATIO, nullable=False)
    if _is_pg():
        op.add_column("risk_levels", column)
        return
    # SQLite cannot ADD a NOT NULL column without a default; rebuild the table instead.
    with op.batch_alter_table("risk_levels", recreate="always") as batch:
        batch.add_column(column)


def downgrade() -> None:
    with op.batch_alter_table("risk_levels") as batch:
        batch.drop_column("probability")
    _rename_level("amber", "yellow")
