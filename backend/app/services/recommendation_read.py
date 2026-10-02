"""Read the rebalance cache for one agent."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent, Recommendation, SystemMeta
from app.models.enums import RecommendationStatus
from app.schemas.rebalance import AgentRecommendation, Rationale, RecommendationItem
from app.services import forecast, rebalance
from app.services.forecast import _utc
from app.services.model_registry import active_model
from ml.registry import FORECAST_MODEL

LIVE = (RecommendationStatus.open, RecommendationStatus.requested)


def agent_recommendation(session: Session, agent: Agent) -> AgentRecommendation | None:
    """None until the rebalance cache is built."""
    mv = active_model(session, FORECAST_MODEL)
    meta = session.get(SystemMeta, rebalance.CACHE_KEY)
    if mv is None or meta is None:
        return None
    rows = session.scalars(select(Recommendation).where(
        Recommendation.agent_id == agent.id, Recommendation.model_version_id == mv.id,
        Recommendation.status.in_(LIVE)).order_by(Recommendation.deadline_at,
                                                   Recommendation.float_type)).all()
    return AgentRecommendation(
        agent_id=agent.id, as_of=forecast.sim_now(session), model_version=mv.version,
        generated_at=_utc(datetime.fromisoformat(meta.value["generated_at"])),
        items=[RecommendationItem(id=r.id, kind=r.kind, channel=r.channel,
                                  van_route_id=r.van_route_id, float_type=r.float_type,
                                  amount_bdt=float(r.amount_bdt),
                                  deadline_at=_utc(r.deadline_at), status=r.status,
                                  rationale=Rationale.model_validate(r.rationale))
               for r in rows])
