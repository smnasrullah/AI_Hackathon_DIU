"""Stockout + risk cache: projected at bootstrap from the forecast cache and balances at SIM_NOW."""

import logging
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.models import FloatSnapshot, Forecast, RiskLevel, StockoutPrediction, SystemMeta
from app.models.enums import FloatType
from app.rules.risk_rules import HORIZONS, RiskConfig, level_confidence, level_for
from app.services import forecast
from app.services.model_registry import active_model
from ml.inference.stockout import StockoutConfig, project
from ml.registry import FORECAST_MODEL

log = logging.getLogger(__name__)
CACHE_KEY = "risk_cache"
METHOD = "mc-copula-1"
FLOAT_INDEX = {FloatType.cash: 0, FloatType.emoney: 1}
# Forecasts are stored per float as the demand that drains it (cash <- cash_out,
# e-money <- cash_in); the other float's drain is this float's inflow.
INFLOW_OF = {FloatType.cash: FloatType.emoney, FloatType.emoney: FloatType.cash}

Quantiles = dict[tuple[int, FloatType], np.ndarray]


def _quantiles(session: Session, model_version_id: int, horizon: int) -> Quantiles:
    found = session.execute(
        select(Forecast.agent_id, Forecast.float_type, Forecast.q_low, Forecast.q_mid,
               Forecast.q_high)
        .where(Forecast.model_version_id == model_version_id, Forecast.horizon_h <= horizon)
        .order_by(Forecast.agent_id, Forecast.float_type, Forecast.horizon_h)
    ).all()
    grouped: dict[tuple[int, FloatType], list[tuple[float, float, float]]] = {}
    for agent_id, float_type, lo, mid, hi in found:
        grouped.setdefault((agent_id, float_type), []).append((float(lo), float(mid), float(hi)))
    return {k: np.array(v) for k, v in grouped.items() if len(v) == horizon}


def _balances(session: Session, now: datetime) -> dict[int, dict[FloatType, float]]:
    found = session.execute(select(FloatSnapshot.agent_id, FloatSnapshot.cash_balance,
                                   FloatSnapshot.emoney_balance)
                            .where(FloatSnapshot.ts == now)).all()
    return {a: {FloatType.cash: float(c), FloatType.emoney: float(e)} for a, c, e in found}


def precompute(session: Session, cfg: RiskConfig, seed: int, force: bool = False,
               stockout_cfg: StockoutConfig | None = None) -> int:
    """Project every agent's floats; write stockout + risk rows. Returns agents written."""
    mv = active_model(session, FORECAST_MODEL)
    if mv is None:
        raise RuntimeError("no active forecast model; run the forecast precompute first")
    sc = stockout_cfg or StockoutConfig()
    now = forecast.sim_now(session)
    fc_meta = session.get(SystemMeta, forecast.CACHE_KEY)
    key = {"forecast": fc_meta.value if fc_meta else None, "model_version": mv.version,
           "sim_now": now.isoformat(), "rules": cfg.as_dict(), "method": METHOD,
           "stockout": asdict(sc), "seed": seed}
    meta = session.get(SystemMeta, CACHE_KEY)
    if not force and meta is not None and meta.value == key:
        log.info("risk cache current (%s)", mv.version)
        return 0
    horizon = max(HORIZONS)
    quantiles = _quantiles(session, mv.id, horizon)
    balances = _balances(session, now)
    generated_at = datetime.now(UTC)
    stockouts: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    agents = sorted({a for a, _ in quantiles} & set(balances))
    for agent_id in agents:
        for ft, idx in FLOAT_INDEX.items():
            drain, inflow = quantiles.get((agent_id, ft)), quantiles.get((agent_id, INFLOW_OF[ft]))
            if drain is None or inflow is None:
                continue
            rng = np.random.default_rng([seed, agent_id, idx])
            res = project(balances[agent_id][ft], drain, inflow, sc, rng)
            base = {"model_version_id": mv.id, "agent_id": agent_id, "float_type": ft,
                    "ts": now, "generated_at": generated_at}
            stockouts.append({
                **base,
                "stockout_at": None if res.hours is None else now + timedelta(hours=res.hours),
                "hours_to_stockout": None if res.hours is None else round(res.hours, 2),
                "confidence": round(res.confidence, 4),
            })
            for h in HORIZONS:
                p = round(res.prob_within(h), 4)
                risks.append({**base, "horizon_h": h, "probability": p,
                              "level": level_for(p, h, cfg),
                              "confidence": round(level_confidence(p), 4), "shap_top": []})
    session.execute(delete(RiskLevel))
    session.execute(delete(StockoutPrediction))
    if stockouts:
        session.execute(insert(StockoutPrediction), stockouts)
        session.execute(insert(RiskLevel), risks)
    session.merge(SystemMeta(key=CACHE_KEY, value=key))
    log.info("risk cache: %d agents at %s (%s)", len(agents), now.isoformat(), mv.version)
    return len(agents)
