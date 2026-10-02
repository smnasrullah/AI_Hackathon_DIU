from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, ScopedAgent, SessionDep
from app.models.enums import RiskLevelCode
from app.rules.risk_rules import HORIZONS
from app.schemas.risk import AgentRisk, AgentRiskPage, AgentStockout, AgentSummary, RiskSort
from app.services import risk_read

router = APIRouter(prefix="/agents", tags=["risk"])


def _not_ready() -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="risk_not_ready")


@router.get("/risk", response_model=AgentRiskPage)
def list_risk(
    user: CurrentUser,
    session: SessionDep,
    horizon: Annotated[int, Query(description="6, 24 or 72")] = 24,
    level: Annotated[RiskLevelCode | None, Query()] = None,
    sort: Annotated[RiskSort, Query()] = "risk",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=80)] = None,
) -> AgentRiskPage:
    """Risk of the caller's agents at one horizon (agent: self; distributor: own agents)."""
    if horizon not in HORIZONS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_horizon")
    result = risk_read.risk_page(session, user, horizon, level, sort, page, page_size, q)
    if result is None:
        raise _not_ready()
    return result


@router.get("/{agent_id}/summary", response_model=AgentSummary)
def get_summary(agent: ScopedAgent, session: SessionDep) -> AgentSummary:
    """Profile, balances, time-to-stockout and risk levels in one call."""
    result = risk_read.agent_summary(session, agent)
    if result is None:
        raise _not_ready()
    return result


@router.get("/{agent_id}/stockout", response_model=AgentStockout)
def get_stockout(agent: ScopedAgent, session: SessionDep) -> AgentStockout:
    """Time-to-stockout + confidence per float (no refills assumed)."""
    result = risk_read.agent_stockout(session, agent)
    if result is None:
        raise _not_ready()
    return result


@router.get("/{agent_id}/risk", response_model=AgentRisk)
def get_risk(agent: ScopedAgent, session: SessionDep) -> AgentRisk:
    """Stockout probability and green/amber/red level at 6 / 24 / 72 h per float."""
    result = risk_read.agent_risk(session, agent)
    if result is None:
        raise _not_ready()
    return result
