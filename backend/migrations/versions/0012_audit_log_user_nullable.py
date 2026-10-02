"""audit_log.user_id nullable: denied demo-login attempts on an unknown account are audited too

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("audit_log") as batch:
        batch.alter_column("user_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM audit_log WHERE user_id IS NULL")
    with op.batch_alter_table("audit_log") as batch:
        batch.alter_column("user_id", existing_type=sa.Uuid(), nullable=False)
