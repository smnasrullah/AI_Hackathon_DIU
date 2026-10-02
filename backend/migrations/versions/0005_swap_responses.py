"""swaps: donor_response, receiver_response (agent accept / decline)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VALUES = ("accepted", "declined")
COLUMNS = ("donor_response", "receiver_response")


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if _is_pg():
        postgresql.ENUM(*VALUES, name="swap_response").create(op.get_bind(), checkfirst=True)
        kind: sa.Enum = postgresql.ENUM(*VALUES, name="swap_response", create_type=False)
    else:
        kind = sa.Enum(*VALUES, name="swap_response", native_enum=False)
    with op.batch_alter_table("swap_suggestions") as batch:
        for name in COLUMNS:
            batch.add_column(sa.Column(name, kind, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("swap_suggestions") as batch:
        for name in COLUMNS:
            batch.drop_column(name)
    if _is_pg():
        postgresql.ENUM(name="swap_response").drop(op.get_bind(), checkfirst=True)
