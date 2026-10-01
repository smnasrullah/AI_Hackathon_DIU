"""auth sessions: refresh token chain + user agent, user theme + last login, login failures

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

THEME_VALUES = ("light", "dark", "system")
TSTZ = sa.DateTime(timezone=True)
BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _theme_enum() -> sa.Enum:
    if _is_pg():
        return postgresql.ENUM(*THEME_VALUES, name="theme_pref", create_type=False)
    return sa.Enum(*THEME_VALUES, name="theme_pref", native_enum=False)


def upgrade() -> None:
    if _is_pg():
        postgresql.ENUM(*THEME_VALUES, name="theme_pref").create(op.get_bind(), checkfirst=True)
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("theme", _theme_enum(), server_default="system", nullable=False)
        )
        batch.add_column(sa.Column("last_login_at", TSTZ, nullable=True))
    with op.batch_alter_table("refresh_tokens") as batch:
        batch.add_column(sa.Column("replaced_by", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("user_agent", sa.Text(), nullable=True))
        batch.create_foreign_key(
            "fk_refresh_tokens_replaced_by",
            "refresh_tokens",
            ["replaced_by"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_table(
        "login_failures",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("ip", sa.Text(), nullable=False),
        sa.Column("created_at", TSTZ, server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_login_failures_email_ip_ts", "login_failures", ["email", "ip", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("login_failures")
    with op.batch_alter_table("refresh_tokens") as batch:
        batch.drop_constraint("fk_refresh_tokens_replaced_by", type_="foreignkey")
        batch.drop_column("user_agent")
        batch.drop_column("replaced_by")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("last_login_at")
        batch.drop_column("theme")
    if _is_pg():
        postgresql.ENUM(name="theme_pref").drop(op.get_bind(), checkfirst=True)
