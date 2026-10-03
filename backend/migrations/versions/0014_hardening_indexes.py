"""indexes for hot lookups: users by agent / distributor, risk by model version, audit by user

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-03
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEXES = [
    ("ix_users_agent_id", "users", ["agent_id"]),
    ("ix_users_distributor_id", "users", ["distributor_id"]),
    ("ix_risk_levels_version_horizon", "risk_levels", ["model_version_id", "horizon_h"]),
    ("ix_audit_log_user_id", "audit_log", ["user_id"]),
]


def upgrade() -> None:
    for name, table, cols in INDEXES:
        op.create_index(name, table, cols)


def downgrade() -> None:
    for name, table, _cols in reversed(INDEXES):
        op.drop_index(name, table_name=table)
