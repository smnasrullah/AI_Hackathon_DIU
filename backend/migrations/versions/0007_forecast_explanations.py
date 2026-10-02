"""forecast_explanations: TreeSHAP drivers per agent/float, cached with the forecast

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TSTZ = sa.DateTime(timezone=True)
BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _float_type() -> sa.Enum:
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.ENUM("cash", "emoney", name="float_type", create_type=False)
    return sa.Enum("cash", "emoney", name="float_type", native_enum=False)


def upgrade() -> None:
    op.create_table(
        "forecast_explanations",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("model_version_id", sa.Integer(), sa.ForeignKey("model_versions.id"),
                  nullable=False),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("agents.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("float_type", _float_type(), nullable=False),
        sa.Column("ts", TSTZ, nullable=False),
        sa.Column("window_h", sa.SmallInteger(), nullable=False),
        sa.Column("usual_bdt", sa.Numeric(14, 2), nullable=False),
        sa.Column("drivers", JSON_DOC, nullable=False),
        sa.Column("generated_at", TSTZ, nullable=False),
    )
    op.create_index("ix_forecast_explanations_agent_ts", "forecast_explanations",
                    ["agent_id", "ts"])


def downgrade() -> None:
    op.drop_table("forecast_explanations")
