"""notifications table; users: digits, notify_in_app, tour_done, display_name, avatar_color

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies of app.models.enums at this revision.
NEW_ENUMS: dict[str, tuple[str, ...]] = {
    "notification_type": ("risk_change", "swap_offer", "swap_decision", "anomaly", "system"),
    "notification_severity": ("info", "warning", "critical"),
}
LANG_VALUES = ("bn", "en")
BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
TSTZ = sa.DateTime(timezone=True)


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _enum(name: str, values: tuple[str, ...]) -> sa.Enum:
    if _is_pg():
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.Enum(*values, name=name, native_enum=False)


def upgrade() -> None:
    if _is_pg():
        for name, values in NEW_ENUMS.items():
            postgresql.ENUM(*values, name=name).create(op.get_bind(), checkfirst=True)
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("digits", _enum("lang_code", LANG_VALUES),
                                   server_default="bn", nullable=False))
        batch.add_column(sa.Column("notify_in_app", sa.Boolean(), server_default=sa.true(),
                                   nullable=False))
        batch.add_column(sa.Column("tour_done", sa.Boolean(), server_default=sa.false(),
                                   nullable=False))
        batch.add_column(sa.Column("display_name", sa.Text(), nullable=True))
        batch.add_column(sa.Column("avatar_color", sa.Text(), nullable=True))
    op.create_table(
        "notifications",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("type", _enum("notification_type", NEW_ENUMS["notification_type"]),
                  nullable=False),
        sa.Column("severity", _enum("notification_severity", NEW_ENUMS["notification_severity"]),
                  nullable=False),
        sa.Column("title_key", sa.Text(), nullable=False),
        sa.Column("params", JSON_DOC, nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=True),
        sa.Column("entity_id", sa.Text(), nullable=True),
        sa.Column("read_at", TSTZ, nullable=True),
        sa.Column("created_at", TSTZ, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at"])
    op.create_index("ix_notifications_user_read", "notifications", ["user_id", "read_at"])


def downgrade() -> None:
    op.drop_table("notifications")
    with op.batch_alter_table("users") as batch:
        for name in ("avatar_color", "display_name", "tour_done", "notify_in_app", "digits"):
            batch.drop_column(name)
    if _is_pg():
        for name in reversed(list(NEW_ENUMS)):
            postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
