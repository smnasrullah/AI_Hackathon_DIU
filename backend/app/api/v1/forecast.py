from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import ScopedAgent, SessionDep
from app.schemas.forecast import AgentForecast
from app.services.forecast import agent_forecast
from ml.features.build import MAX_HORIZON_H

router = APIRouter(prefix="/agents", tags=["forecast"])


@router.get("/{agent_id}/forecast", response_model=AgentForecast)
def get_forecast(
    agent: ScopedAgent,
    session: SessionDep,
    horizon_hours: Annotated[int, Query(ge=1, le=MAX_HORIZON_H)] = 24,
) -> AgentForecast:
    """Hourly low/expected/high (q10/q50/q90) demand per float, from the bootstrap cache."""
    result = agent_forecast(session, agent.id, horizon_hours)
    if result is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="forecast_not_ready")
    return result
