"""Model registry and ML outputs: forecasts, stockout, risk, anomalies, impact."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK, JsonDoc, Money, Ratio, TsTz, created_at_col, db_enum
from app.models.enums import AnomalyStatus, FloatType, ImpactScenario, RiskLevelCode


class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (
        UniqueConstraint("model_name", "version", name="uq_model_versions_name_version"),
        Index("ix_model_versions_is_active", "is_active"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    model_name: Mapped[str] = mapped_column(Text)
    version: Mapped[str] = mapped_column(Text)
    trained_at: Mapped[datetime] = mapped_column(TsTz)
    artifact_sha256: Mapped[str] = mapped_column(Text)
    metrics: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = created_at_col()


class Forecast(Base):
    """Hourly quantile forecast (q10/q50/q90) of one float at target ts."""

    __tablename__ = "forecasts"
    __table_args__ = (
        Index("ix_forecasts_agent_ts", "agent_id", "ts"),
        Index("ix_forecasts_agent_float_ts", "agent_id", "float_type", "ts"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"))
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    float_type: Mapped[FloatType] = mapped_column(db_enum(FloatType))
    ts: Mapped[datetime] = mapped_column(TsTz)
    horizon_h: Mapped[int] = mapped_column(SmallInteger)
    q_low: Mapped[Decimal] = mapped_column(Money)
    q_mid: Mapped[Decimal] = mapped_column(Money)
    q_high: Mapped[Decimal] = mapped_column(Money)
    generated_at: Mapped[datetime] = mapped_column(TsTz)


class StockoutPrediction(Base):
    __tablename__ = "stockout_predictions"
    __table_args__ = (Index("ix_stockout_predictions_agent_ts", "agent_id", "ts"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"))
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    float_type: Mapped[FloatType] = mapped_column(db_enum(FloatType))
    # Simulated "now" the prediction was made for.
    ts: Mapped[datetime] = mapped_column(TsTz)
    # NULL = no stockout inside the 72 h horizon.
    stockout_at: Mapped[datetime | None] = mapped_column(TsTz)
    hours_to_stockout: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    confidence: Mapped[Decimal] = mapped_column(Ratio)
    generated_at: Mapped[datetime] = mapped_column(TsTz)


class RiskLevel(Base):
    __tablename__ = "risk_levels"
    __table_args__ = (
        CheckConstraint("horizon_h IN (6, 24, 72)", name="ck_risk_levels_horizon"),
        Index("ix_risk_levels_agent_ts", "agent_id", "ts"),
        Index("ix_risk_levels_level", "level"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"))
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    float_type: Mapped[FloatType] = mapped_column(db_enum(FloatType))
    ts: Mapped[datetime] = mapped_column(TsTz)
    horizon_h: Mapped[int] = mapped_column(SmallInteger)
    level: Mapped[RiskLevelCode] = mapped_column(db_enum(RiskLevelCode))
    # P(stockout within horizon_h); level comes from it via app/rules/risk_rules.py.
    probability: Mapped[Decimal] = mapped_column(Ratio)
    confidence: Mapped[Decimal] = mapped_column(Ratio)
    shap_top: Mapped[list[dict[str, Any]]] = mapped_column(JsonDoc, default=list)
    generated_at: Mapped[datetime] = mapped_column(TsTz)


class Anomaly(Base):
    """Isolation Forest flag; human review fields filled via audit-logged action."""

    __tablename__ = "anomalies"
    __table_args__ = (
        Index("ix_anomalies_agent_ts", "agent_id", "window_start"),
        Index("ix_anomalies_status_score", "status", "score"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"))
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    window_start: Mapped[datetime] = mapped_column(TsTz)
    window_end: Mapped[datetime] = mapped_column(TsTz)
    score: Mapped[Decimal] = mapped_column(Ratio)
    features: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    status: Mapped[AnomalyStatus] = mapped_column(
        db_enum(AnomalyStatus), default=AnomalyStatus.open, server_default="open"
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(TsTz)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()


class ImpactResult(Base):
    __tablename__ = "impact_results"
    __table_args__ = (Index("ix_impact_results_version_scenario", "model_version_id", "scenario"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"))
    scenario: Mapped[ImpactScenario] = mapped_column(db_enum(ImpactScenario))
    window_start: Mapped[datetime] = mapped_column(TsTz)
    window_end: Mapped[datetime] = mapped_column(TsTz)
    stockout_hours: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    value_saved_bdt: Mapped[Decimal] = mapped_column(Money)
    van_trips: Mapped[int] = mapped_column(Integer)
    params: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    created_at: Mapped[datetime] = created_at_col()
