"""users.is_pending (self-signup awaiting approval) + password_reset_tokens (hashed, single-use)

A pending signup is an agent with no agent link yet, so ck_users_role_scope allows that while
is_pending is true.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-03
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TSTZ = sa.DateTime(timezone=True)
CK = "ck_users_role_scope"
OLD_SCOPE = ("(role = 'agent' AND agent_id IS NOT NULL)"
             " OR (role = 'distributor' AND distributor_id IS NOT NULL)"
             " OR role = 'admin'")
NEW_SCOPE = ("(role = 'agent' AND (agent_id IS NOT NULL OR is_pending))"
             " OR (role = 'distributor' AND distributor_id IS NOT NULL)"
             " OR role = 'admin'")


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("is_pending", sa.Boolean(), server_default=sa.false(),
                                   nullable=False))
        batch.drop_constraint(CK, type_="check")
        batch.create_check_constraint(CK, NEW_SCOPE)
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", TSTZ, nullable=False),
        sa.Column("used_at", TSTZ, nullable=True),
        sa.Column("created_at", TSTZ, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.execute("DELETE FROM users WHERE is_pending")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint(CK, type_="check")
        batch.create_check_constraint(CK, OLD_SCOPE)
        batch.drop_column("is_pending")
