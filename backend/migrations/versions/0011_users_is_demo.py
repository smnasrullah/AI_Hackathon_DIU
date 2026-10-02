"""users.is_demo: only flagged accounts can be used by POST /auth/demo-login

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copy of app.services.seed.DEMO_ACCOUNTS at this revision (the seed keeps it in sync).
DEMO_EMAILS = ("agent.mirpur@agentpulse.demo", "dist.dhaka@agentpulse.demo",
               "admin@agentpulse.demo")


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("is_demo", sa.Boolean(), server_default=sa.false(),
                                   nullable=False))
    users = sa.table("users", sa.column("email", sa.Text()), sa.column("is_demo", sa.Boolean()))
    op.execute(users.update().where(users.c.email.in_(DEMO_EMAILS)).values(is_demo=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("is_demo")
