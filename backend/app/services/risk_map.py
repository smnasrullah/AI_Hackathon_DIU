"""Map time scrubber (F10): every scoped agent's risk at hour 0..72 + current swap suggestions.

Reads the cached P(stockout by hour h) curve; levels use cut-offs interpolated between the
6 / 24 / 72 h horizons (rules/risk_rules.py), so they match the risk cache at those hours.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import scoped_agents_query
from app.models import Agent, StockoutPrediction, SwapSuggestion, User
from app.models.enums import FloatType, RiskLevelCode, SwapStatus
from app.rules.risk_rules import SEVERITY, RiskConfig, level_at, worst
from app.schemas.map import MapAgent, MapAgents, MapSwap
from app.services.forecast import _utc
from app.services.model_registry import active_model
from ml.registry import FORECAST_MODEL

FloatLevels = dict[FloatType, tuple[RiskLevelCode, float]]


def _float_levels(rows: list[StockoutPrediction], at_hour: int, cfg: RiskConfig) -> FloatLevels:
    out: FloatLevels = {}
    for s in rows:
        if s.prob_by_hour and at_hour < len(s.prob_by_hour):
            p = float(s.prob_by_hour[at_hour])
            out[s.float_type] = (level_at(p, at_hour, cfg), p)
    return out


def _agent(a: Agent, levels: FloatLevels) -> MapAgent:
    worst_float = max(levels, key=lambda ft: (SEVERITY[levels[ft][0]], levels[ft][1]))
    return MapAgent(agent_id=a.id, code=a.code, name=a.name, district=a.district,
                    upazila=a.upazila, lat=a.lat, lng=a.lng,
                    level=worst(lv for lv, _ in levels.values()),
                    probability=max(p for _, p in levels.values()), worst_float=worst_float)


def _swaps(session: Session, agents: dict[int, Agent], levels: dict[int, FloatLevels]
           ) -> list[MapSwap]:
    ids = list(agents)
    found = session.scalars(
        select(SwapSuggestion)
        .where(SwapSuggestion.donor_agent_id.in_(ids), SwapSuggestion.receiver_agent_id.in_(ids),
               SwapSuggestion.status != SwapStatus.rejected)
        .order_by(SwapSuggestion.score.desc(), SwapSuggestion.id))
    out: list[MapSwap] = []
    for s in found:
        donor, receiver = agents[s.donor_agent_id], agents[s.receiver_agent_id]
        need = levels.get(receiver.id, {}).get(s.float_type)
        out.append(MapSwap(
            id=s.id, donor_agent_id=donor.id, receiver_agent_id=receiver.id,
            from_lat=donor.lat, from_lng=donor.lng, to_lat=receiver.lat, to_lng=receiver.lng,
            float_type=s.float_type, amount_bdt=float(s.amount_bdt), status=s.status,
            van_trip_saved=s.van_trip_saved,
            relevant=need is not None and need[0] != RiskLevelCode.green,
        ))
    return out


def map_agents(session: Session, user: User, at_hour: int, cfg: RiskConfig) -> MapAgents | None:
    """None when the risk cache (with per-hour curves) is not built yet."""
    mv = active_model(session, FORECAST_MODEL)
    if mv is None:
        return None
    # One precompute writes every row with the same ts + generated_at.
    ref = session.scalar(select(StockoutPrediction).where(
        StockoutPrediction.model_version_id == mv.id,
        StockoutPrediction.prob_by_hour.is_not(None)).limit(1))
    if ref is None:
        return None
    agents = {a.id: a for a in session.scalars(scoped_agents_query(user))}
    rows: dict[int, list[StockoutPrediction]] = {}
    for s in session.scalars(select(StockoutPrediction).where(
            StockoutPrediction.model_version_id == mv.id,
            StockoutPrediction.agent_id.in_(list(agents)))):
        rows.setdefault(s.agent_id, []).append(s)
    levels = {a: lv for a, found in rows.items() if (lv := _float_levels(found, at_hour, cfg))}
    as_of = _utc(ref.ts)
    return MapAgents(
        at_hour=at_hour, as_of=as_of, ts=as_of + timedelta(hours=at_hour),
        agents=[_agent(a, levels[a.id]) for a in agents.values() if a.id in levels],
        swaps=_swaps(session, agents, levels),
        model_version=mv.version, generated_at=_utc(ref.generated_at),
    )
