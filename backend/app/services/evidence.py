"""Evidence pack: compact, deterministic JSON of one agent/float for the LLM layer.

Holds only this agent's own facts (callers scope the agent first), every number exactly as the
template sentences quote it, and no volatile fields (generated_at), so replay hashes stay stable.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Agent,
    FloatSnapshot,
    Forecast,
    ForecastExplanation,
    ModelVersion,
    RiskLevel,
    StockoutPrediction,
)
from app.models.enums import FLOAT_DEMAND, FloatType
from ml.explain import drivers as drv

EVIDENCE_VERSION = 1


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def _stockout(session: Session, mv: ModelVersion, agent_id: int, ft: FloatType
              ) -> dict[str, Any] | None:
    s = session.scalar(select(StockoutPrediction).where(
        StockoutPrediction.model_version_id == mv.id, StockoutPrediction.agent_id == agent_id,
        StockoutPrediction.float_type == ft))
    if s is None:
        return None
    hours = None if s.hours_to_stockout is None else float(s.hours_to_stockout)
    return {"hours": hours, "confidence": float(s.confidence)}


def _risk(session: Session, mv: ModelVersion, agent_id: int, ft: FloatType
          ) -> list[dict[str, Any]]:
    found = session.scalars(select(RiskLevel).where(
        RiskLevel.model_version_id == mv.id, RiskLevel.agent_id == agent_id,
        RiskLevel.float_type == ft).order_by(RiskLevel.horizon_h))
    return [{"horizon_h": r.horizon_h, "level": r.level.value, "probability": float(r.probability)}
            for r in found]


def _balance(session: Session, agent_id: int, ft: FloatType, as_of: datetime) -> float | None:
    snap = session.scalar(select(FloatSnapshot).where(FloatSnapshot.agent_id == agent_id,
                                                      FloatSnapshot.ts == as_of))
    if snap is None:
        return None
    return float(snap.cash_balance if ft is FloatType.cash else snap.emoney_balance)


def evidence_pack(session: Session, agent: Agent, mv: ModelVersion, row: ForecastExplanation
                  ) -> dict[str, Any]:
    ft, as_of = row.float_type, _utc(row.ts)
    expected = session.scalar(select(func.sum(Forecast.q_mid)).where(
        Forecast.model_version_id == mv.id, Forecast.agent_id == agent.id,
        Forecast.float_type == ft, Forecast.horizon_h <= row.window_h))
    capacity = agent.cash_capacity if ft is FloatType.cash else agent.emoney_capacity
    reasons = drv.top([drv.Driver.from_json(x) for x in row.drivers])
    return {
        "v": EVIDENCE_VERSION,
        "agent": {"id": agent.id, "code": agent.code, "district": agent.district},
        "float_type": ft.value,
        "demand_type": FLOAT_DEMAND[ft].value,
        "unit": "BDT",
        "as_of": as_of.isoformat(),
        "model_version": mv.version,
        "window_h": row.window_h,
        "forecast": {"expected_bdt": None if expected is None else round(float(expected)),
                     "usual_bdt": round(float(row.usual_bdt))},
        "balance_bdt": _balance(session, agent.id, ft, as_of),
        "capacity_bdt": float(capacity),
        "stockout": _stockout(session, mv, agent.id, ft),
        "risk": _risk(session, mv, agent.id, ft),
        "drivers": [{"factor": d.factor, "impact_bdt": d.impact_bdt,
                     "direction": "up" if d.impact_bdt > 0 else "down", "share": d.share,
                     "facts": d.facts} for d in reasons],
    }
