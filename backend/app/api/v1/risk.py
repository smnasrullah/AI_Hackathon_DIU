from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.core.csv_export import CSV_RESPONSES, csv_response
from app.core.deps import CurrentUser, ScopedAgent, SessionDep
from app.core.params import PageQuery
from app.models.enums import RiskLevelCode
from app.rules.risk_rules import HORIZONS
from app.schemas.risk import AgentRisk, AgentRiskPage, AgentStockout, AgentSummary, RiskSort
from app.services import exports, risk_read

router = APIRouter(prefix="/agents", tags=["risk"])
EXPORT_MAX_ROWS = 100_000


def _not_ready() -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="risk_not_ready")


@router.get("/risk", response_model=AgentRiskPage)
def list_risk(
    user: CurrentUser,
    session: SessionDep,
    horizon: Annotated[int, Query(description="6, 24 or 72")] = 24,
    level: Annotated[RiskLevelCode | None, Query()] = None,
    sort: Annotated[RiskSort, Query()] = "risk",
    page: PageQuery = 1,
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


@router.get("/risk/export.csv", response_class=Response, responses=CSV_RESPONSES)
def export_risk(
    user: CurrentUser,
    session: SessionDep,
    horizon: Annotated[int, Query(description="6, 24 or 72")] = 24,
    level: Annotated[RiskLevelCode | None, Query()] = None,
    sort: Annotated[RiskSort, Query()] = "risk",
    q: Annotated[str | None, Query(max_length=80)] = None,
) -> Response:
    """The risk list (same filters, all pages) as CSV; scoped like GET /agents/risk."""
    if horizon not in HORIZONS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_horizon")
    result = risk_read.risk_page(session, user, horizon, level, sort, 1, EXPORT_MAX_ROWS, q)
    if result is None:
        raise _not_ready()
    return csv_response(f"agent-risk-{horizon}h.csv", exports.RISK_HEADER,
                        exports.risk_rows(result))


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
