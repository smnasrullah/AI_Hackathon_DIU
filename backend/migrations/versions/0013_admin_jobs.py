"""admin_jobs: background data generation / retraining with progress

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-03
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "admin_jobs",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="queued", nullable=False),
        sa.Column("progress", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("step", sa.Text(), server_default="queued", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("result", JSON_DOC, nullable=False),
        sa.Column("started_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", TSTZ, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TSTZ, server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", TSTZ, nullable=True),
    )
    op.create_index("ix_admin_jobs_status", "admin_jobs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_admin_jobs_status", table_name="admin_jobs")
    op.drop_table("admin_jobs")
