"""core schema: org, time series, predictions, actions, audit, llm, knowledge

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-01
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copy of app.models.enums at this revision.
ENUMS: dict[str, tuple[str, ...]] = {
    "user_role": ("agent", "distributor", "admin"),
    "urban_rural": ("urban", "peri_urban", "rural"),
    "float_type": ("cash", "emoney"),
    "txn_type": ("cash_in", "cash_out"),
    "event_type": ("salary", "eid", "hat_bazar", "weather", "holiday"),
    "risk_level": ("green", "yellow", "red"),
    "recommendation_kind": ("add_cash", "add_emoney", "swap", "van"),
    "recommendation_status": ("open", "requested", "done", "expired"),
    "swap_status": ("pending", "approved", "rejected"),
    "anomaly_status": ("open", "confirmed", "dismissed"),
    "impact_scenario": ("model", "baseline"),
    "llm_intent": (
        "copilot",
        "narrate",
        "agent_briefing",
        "distributor_briefing",
        "anomaly_narrative",
    ),
    "generated_by": ("llm", "template", "replay"),
    "guard_result": ("pass", "numbers_fail", "injection", "schema_fail", "timeout", "error"),
    "lang_code": ("bn", "en"),
    "chat_role": ("user", "assistant"),
}

TABLES_IN_CREATE_ORDER: tuple[str, ...] = (
    "distributors",
    "agents",
    "users",
    "refresh_tokens",
    "float_snapshots",
    "transactions",
    "events",
    "weather_daily",
    "model_versions",
    "forecasts",
    "stockout_predictions",
    "risk_levels",
    "anomalies",
    "impact_results",
    "recommendations",
    "swap_suggestions",
    "audit_log",
    "llm_call_log",
    "llm_cache",
    "copilot_messages",
    "knowledge_docs",
)

BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
MONEY = sa.Numeric(14, 2)
RATIO = sa.Numeric(8, 4)
TSTZ = sa.DateTime(timezone=True)


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _enum(name: str) -> sa.Enum:
    if _is_pg():
        # Types are created once up front; never per table.
        return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)
    return sa.Enum(*ENUMS[name], name=name, native_enum=False)


def _big_id() -> sa.Column:
    return sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True)


def _int_id() -> sa.Column:
    return sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True)


def _created_at(name: str = "created_at") -> sa.Column:
    return sa.Column(name, TSTZ, server_default=sa.func.now(), nullable=False)


def _fk(name: str, target: str, nullable: bool = False, ondelete: str | None = None) -> sa.Column:
    col_type = sa.Uuid() if target == "users.id" else sa.Integer()
    if target in {"llm_call_log.id"}:
        col_type = BIGINT_PK
    return sa.Column(
        name, col_type, sa.ForeignKey(target, ondelete=ondelete), nullable=nullable
    )


def _create_org() -> None:
    op.create_table(
        "distributors",
        _int_id(),
        sa.Column("code", sa.Text(), nullable=False, unique=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("region", sa.Text(), nullable=False),
        sa.Column("district", sa.Text(), nullable=False),
        sa.Column("hub_lat", sa.Float(), nullable=False),
        sa.Column("hub_lng", sa.Float(), nullable=False),
        _created_at(),
    )
    op.create_table(
        "agents",
        _int_id(),
        sa.Column("code", sa.Text(), nullable=False, unique=True),
        sa.Column("name", sa.Text(), nullable=False),
        _fk("distributor_id", "distributors.id", ondelete="RESTRICT"),
        sa.Column("region", sa.Text(), nullable=False),
        sa.Column("district", sa.Text(), nullable=False),
        sa.Column("upazila", sa.Text(), nullable=True),
        sa.Column("urban_rural", _enum("urban_rural"), nullable=False),
        sa.Column("tier", sa.SmallInteger(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("cash_capacity", MONEY, nullable=False),
        sa.Column("emoney_capacity", MONEY, nullable=False),
        sa.Column("opened_on", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        _created_at(),
        sa.CheckConstraint("tier BETWEEN 1 AND 3", name="ck_agents_tier"),
    )
    op.create_index("ix_agents_distributor_id", "agents", ["distributor_id"])
    op.create_index("ix_agents_region_district", "agents", ["region", "district"])
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column("full_name", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", _enum("user_role"), nullable=False),
        _fk("agent_id", "agents.id", nullable=True),
        _fk("distributor_id", "distributors.id", nullable=True),
        sa.Column("lang", _enum("lang_code"), server_default="bn", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        _created_at(),
        sa.CheckConstraint(
            "(role = 'agent' AND agent_id IS NOT NULL)"
            " OR (role = 'distributor' AND distributor_id IS NOT NULL)"
            " OR role = 'admin'",
            name="ck_users_role_scope",
        ),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _fk("user_id", "users.id", ondelete="CASCADE"),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", TSTZ, nullable=False),
        sa.Column("revoked_at", TSTZ, nullable=True),
        _created_at(),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def _create_timeseries() -> None:
    op.create_table(
        "float_snapshots",
        _big_id(),
        _fk("agent_id", "agents.id", ondelete="CASCADE"),
        sa.Column("ts", TSTZ, nullable=False),
        sa.Column("cash_balance", MONEY, nullable=False),
        sa.Column("emoney_balance", MONEY, nullable=False),
        sa.Column("is_holdout", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.UniqueConstraint("agent_id", "ts", name="uq_float_snapshots_agent_ts"),
    )
    op.create_index("ix_float_snapshots_ts", "float_snapshots", ["ts"])
    op.create_table(
        "transactions",
        _big_id(),
        _fk("agent_id", "agents.id", ondelete="CASCADE"),
        sa.Column("ts", TSTZ, nullable=False),
        sa.Column("txn_type", _enum("txn_type"), nullable=False),
        sa.Column("amount_bdt", MONEY, nullable=False),
        sa.Column("txn_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_holdout", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index("ix_transactions_agent_ts", "transactions", ["agent_id", "ts"])
    op.create_index("ix_transactions_ts", "transactions", ["ts"])
    op.create_table(
        "events",
        _int_id(),
        sa.Column("type", _enum("event_type"), nullable=False),
        sa.Column("name_en", sa.Text(), nullable=False),
        sa.Column("name_bn", sa.Text(), nullable=False),
        sa.Column("starts_at", TSTZ, nullable=False),
        sa.Column("ends_at", TSTZ, nullable=False),
        sa.Column("district", sa.Text(), nullable=True),
        sa.Column("intensity", sa.Numeric(6, 3), nullable=False),
    )
    op.create_index("ix_events_window", "events", ["starts_at", "ends_at"])
    op.create_index("ix_events_district", "events", ["district"])
    op.create_table(
        "weather_daily",
        sa.Column("district", sa.Text(), primary_key=True),
        sa.Column("date", sa.Date(), primary_key=True),
        sa.Column("rain_mm", sa.Numeric(7, 2), nullable=False),
        sa.Column("temp_c", sa.Numeric(5, 2), nullable=False),
        sa.Column("severe", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def _create_predictions() -> None:
    op.create_table(
        "model_versions",
        _int_id(),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("version", sa.Text(), nullable=False),
        sa.Column("trained_at", TSTZ, nullable=False),
        sa.Column("artifact_sha256", sa.Text(), nullable=False),
        sa.Column("metrics", JSON_DOC, nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.false(), nullable=False),
        _created_at(),
        sa.UniqueConstraint("model_name", "version", name="uq_model_versions_name_version"),
    )
    op.create_index("ix_model_versions_is_active", "model_versions", ["is_active"])
    op.create_table(
        "forecasts",
        _big_id(),
        _fk("model_version_id", "model_versions.id"),
        _fk("agent_id", "agents.id", ondelete="CASCADE"),
        sa.Column("float_type", _enum("float_type"), nullable=False),
        sa.Column("ts", TSTZ, nullable=False),
        sa.Column("horizon_h", sa.SmallInteger(), nullable=False),
        sa.Column("q_low", MONEY, nullable=False),
        sa.Column("q_mid", MONEY, nullable=False),
        sa.Column("q_high", MONEY, nullable=False),
        sa.Column("generated_at", TSTZ, nullable=False),
    )
    op.create_index("ix_forecasts_agent_ts", "forecasts", ["agent_id", "ts"])
    op.create_index("ix_forecasts_agent_float_ts", "forecasts", ["agent_id", "float_type", "ts"])
    op.create_table(
        "stockout_predictions",
        _big_id(),
        _fk("model_version_id", "model_versions.id"),
        _fk("agent_id", "agents.id", ondelete="CASCADE"),
        sa.Column("float_type", _enum("float_type"), nullable=False),
        sa.Column("ts", TSTZ, nullable=False),
        sa.Column("stockout_at", TSTZ, nullable=True),
        sa.Column("hours_to_stockout", sa.Numeric(6, 2), nullable=True),
        sa.Column("confidence", RATIO, nullable=False),
        sa.Column("generated_at", TSTZ, nullable=False),
    )
    op.create_index(
        "ix_stockout_predictions_agent_ts", "stockout_predictions", ["agent_id", "ts"]
    )
    op.create_table(
        "risk_levels",
        _big_id(),
        _fk("model_version_id", "model_versions.id"),
        _fk("agent_id", "agents.id", ondelete="CASCADE"),
        sa.Column("float_type", _enum("float_type"), nullable=False),
        sa.Column("ts", TSTZ, nullable=False),
        sa.Column("horizon_h", sa.SmallInteger(), nullable=False),
        sa.Column("level", _enum("risk_level"), nullable=False),
        sa.Column("confidence", RATIO, nullable=False),
        sa.Column("shap_top", JSON_DOC, nullable=False),
        sa.Column("generated_at", TSTZ, nullable=False),
        sa.CheckConstraint("horizon_h IN (6, 24, 72)", name="ck_risk_levels_horizon"),
    )
    op.create_index("ix_risk_levels_agent_ts", "risk_levels", ["agent_id", "ts"])
    op.create_index("ix_risk_levels_level", "risk_levels", ["level"])
    op.create_table(
        "anomalies",
        _big_id(),
        _fk("model_version_id", "model_versions.id"),
        _fk("agent_id", "agents.id", ondelete="CASCADE"),
        sa.Column("window_start", TSTZ, nullable=False),
        sa.Column("window_end", TSTZ, nullable=False),
        sa.Column("score", RATIO, nullable=False),
        sa.Column("features", JSON_DOC, nullable=False),
        sa.Column("status", _enum("anomaly_status"), server_default="open", nullable=False),
        _fk("reviewed_by", "users.id", nullable=True),
        sa.Column("reviewed_at", TSTZ, nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        _created_at(),
    )
    op.create_index("ix_anomalies_agent_ts", "anomalies", ["agent_id", "window_start"])
    op.create_index("ix_anomalies_status_score", "anomalies", ["status", "score"])
    op.create_table(
        "impact_results",
        _int_id(),
        _fk("model_version_id", "model_versions.id"),
        sa.Column("scenario", _enum("impact_scenario"), nullable=False),
        sa.Column("window_start", TSTZ, nullable=False),
        sa.Column("window_end", TSTZ, nullable=False),
        sa.Column("stockout_hours", sa.Numeric(10, 2), nullable=False),
        sa.Column("value_saved_bdt", MONEY, nullable=False),
        sa.Column("van_trips", sa.Integer(), nullable=False),
        sa.Column("params", JSON_DOC, nullable=False),
        _created_at(),
    )
    op.create_index(
        "ix_impact_results_version_scenario", "impact_results", ["model_version_id", "scenario"]
    )


def _create_actions() -> None:
    op.create_table(
        "recommendations",
        _big_id(),
        _fk("agent_id", "agents.id", ondelete="CASCADE"),
        _fk("model_version_id", "model_versions.id", nullable=True),
        sa.Column("kind", _enum("recommendation_kind"), nullable=False),
        sa.Column("float_type", _enum("float_type"), nullable=False),
        sa.Column("amount_bdt", MONEY, nullable=False),
        sa.Column("deadline_at", TSTZ, nullable=False),
        sa.Column("rationale", JSON_DOC, nullable=False),
        sa.Column(
            "status", _enum("recommendation_status"), server_default="open", nullable=False
        ),
        _created_at(),
    )
    op.create_index("ix_recommendations_agent_ts", "recommendations", ["agent_id", "created_at"])
    op.create_index("ix_recommendations_agent_status", "recommendations", ["agent_id", "status"])
    op.create_table(
        "swap_suggestions",
        _big_id(),
        _fk("model_version_id", "model_versions.id", nullable=True),
        _fk("donor_agent_id", "agents.id", ondelete="CASCADE"),
        _fk("receiver_agent_id", "agents.id", ondelete="CASCADE"),
        sa.Column("float_type", _enum("float_type"), nullable=False),
        sa.Column("amount_bdt", MONEY, nullable=False),
        sa.Column("distance_km", sa.Numeric(8, 2), nullable=False),
        sa.Column("van_trip_saved", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("score", sa.Numeric(10, 4), nullable=False),
        sa.Column("status", _enum("swap_status"), server_default="pending", nullable=False),
        _fk("decided_by", "users.id", nullable=True),
        sa.Column("decided_at", TSTZ, nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        _created_at(),
        sa.CheckConstraint(
            "donor_agent_id <> receiver_agent_id", name="ck_swap_suggestions_distinct"
        ),
    )
    op.create_index("ix_swap_suggestions_status", "swap_suggestions", ["status"])
    op.create_index("ix_swap_suggestions_donor", "swap_suggestions", ["donor_agent_id"])
    op.create_index("ix_swap_suggestions_receiver", "swap_suggestions", ["receiver_agent_id"])
    op.create_table(
        "audit_log",
        _big_id(),
        _fk("user_id", "users.id"),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("payload", JSON_DOC, nullable=False),
        _created_at(),
    )
    op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])


def _create_llm() -> None:
    op.create_table(
        "llm_call_log",
        _big_id(),
        _fk("user_id", "users.id", nullable=True),
        sa.Column("intent", _enum("llm_intent"), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("lang", _enum("lang_code"), nullable=False),
        sa.Column("evidence_hash", sa.Text(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("generated_by", _enum("generated_by"), nullable=False),
        sa.Column("guard_result", _enum("guard_result"), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        _created_at(),
    )
    op.create_index("ix_llm_call_log_created_at", "llm_call_log", ["created_at"])
    op.create_index(
        "ix_llm_call_log_intent_generated_by", "llm_call_log", ["intent", "generated_by"]
    )
    op.create_table(
        "llm_cache",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("intent", _enum("llm_intent"), nullable=False),
        sa.Column("response", JSON_DOC, nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        _created_at(),
        sa.Column("expires_at", TSTZ, nullable=True),
    )
    op.create_index("ix_llm_cache_expires_at", "llm_cache", ["expires_at"])
    op.create_table(
        "copilot_messages",
        _big_id(),
        _fk("user_id", "users.id", ondelete="CASCADE"),
        _fk("agent_id", "agents.id", ondelete="CASCADE"),
        sa.Column("role", _enum("chat_role"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("lang", _enum("lang_code"), nullable=False),
        sa.Column("generated_by", _enum("generated_by"), nullable=True),
        _fk("llm_call_id", "llm_call_log.id", nullable=True),
        _created_at(),
    )
    op.create_index(
        "ix_copilot_messages_user_created", "copilot_messages", ["user_id", "created_at"]
    )
    op.create_table(
        "knowledge_docs",
        _int_id(),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("lang", _enum("lang_code"), nullable=False),
        sa.Column("chunk_idx", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("source_path", sa.Text(), nullable=False),
        sa.Column("checksum", sa.Text(), nullable=False),
        _created_at("updated_at"),
        sa.UniqueConstraint("slug", "lang", "chunk_idx", name="uq_knowledge_docs_slug_lang_chunk"),
    )


def upgrade() -> None:
    if _is_pg():
        bind = op.get_bind()
        for name, values in ENUMS.items():
            postgresql.ENUM(*values, name=name).create(bind, checkfirst=True)
    _create_org()
    _create_timeseries()
    _create_predictions()
    _create_actions()
    _create_llm()


def downgrade() -> None:
    # Dropping a table drops its indexes and constraints.
    for table in reversed(TABLES_IN_CREATE_ORDER):
        op.drop_table(table)
    if _is_pg():
        bind = op.get_bind()
        for name in reversed(list(ENUMS)):
            postgresql.ENUM(name=name).drop(bind, checkfirst=True)
