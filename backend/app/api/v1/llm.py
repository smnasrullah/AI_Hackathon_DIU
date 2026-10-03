"""LLM wording endpoints. Every response is advisory text over backend evidence; the numbers it
quotes are verified against that evidence, and the template text is always included."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import get_settings
from app.core.deps import CurrentUser, ScopedAgent, SessionDep, can_access_agent, require_roles
from app.core.params import IdPath
from app.llm import packs
from app.llm.packs import Pack
from app.llm.service import generate
from app.llm.status import llm_status
from app.models import Agent, User
from app.models.enums import Lang, UserRole
from app.schemas.llm import LlmStatus, LlmText, NarrateIn
from app.services import anomalies
from app.services.anomalies import AnomalyError

router = APIRouter(tags=["llm"])

Reviewer = Annotated[User, Depends(require_roles(UserRole.distributor, UserRole.admin))]
LangQuery = Annotated[Lang | None, Query(description="bn or en; default: user's language")]


def _not_ready(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)


def _run(session: SessionDep, user: User, pack: Pack, lang: Lang | None) -> LlmText:
    result = generate(session, get_settings(), user, pack, lang or user.lang)
    session.commit()  # llm_call_log + llm_cache rows
    return result


@router.post("/explanations/narrate", response_model=LlmText)
def narrate(body: NarrateIn, user: CurrentUser, session: SessionDep) -> LlmText:
    """SHAP template reasons for one float, reworded by the LLM (template on any failure)."""
    agent = session.get(Agent, body.agent_id)
    if agent is None or not can_access_agent(user, agent):
        if agent is None and user.role == UserRole.admin:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="agent_not_found")
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
    pack = packs.narrate(session, agent, body.target)
    if pack is None:
        raise _not_ready("explanations_not_ready")
    return _run(session, user, pack, body.lang)


@router.get("/agents/{agent_id}/briefing", response_model=LlmText)
def agent_briefing(agent: ScopedAgent, user: CurrentUser, session: SessionDep,
                   lang: LangQuery = None) -> LlmText:
    """Morning briefing for one agent: risk, main reason, suggested action (advisory)."""
    pack = packs.agent_briefing(session, agent)
    if pack is None:
        raise _not_ready("risk_not_ready")
    return _run(session, user, pack, lang)


@router.get("/anomalies/{anomaly_id}/narrative", response_model=LlmText)
def anomaly_narrative(anomaly_id: IdPath, user: Reviewer, session: SessionDep,
                      lang: LangQuery = None) -> LlmText:
    """Neutral investigation note for one flag, from its peer evidence only."""
    if not anomalies.is_ready(session):
        raise _not_ready("anomalies_not_ready")
    try:
        pack = packs.anomaly(session, user, anomaly_id)
    except AnomalyError as exc:
        if exc.code == "not_found":
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="anomaly_not_found") from exc
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden") from exc
    return _run(session, user, pack, lang)


@router.get("/distributor/briefing", response_model=LlmText)
def distributor_briefing(user: Reviewer, session: SessionDep, lang: LangQuery = None
                         ) -> LlmText:
    """Daily briefing over the caller's agents (distributor: own; admin: all)."""
    pack = packs.distributor(session, user)
    if pack is None:
        raise _not_ready("risk_not_ready")
    return _run(session, user, pack, lang)


@router.get("/llm/status", response_model=LlmStatus)
def get_llm_status(_user: CurrentUser, session: SessionDep) -> LlmStatus:
    """Configured and effective provider, today's live calls vs the cap, last error code."""
    return llm_status(session, get_settings())
