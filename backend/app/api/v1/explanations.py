from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, ScopedAgent, SessionDep
from app.models.enums import FloatType, Lang
from app.schemas.explanation import AgentExplanation
from app.services.explanation import agent_explanation

router = APIRouter(prefix="/agents", tags=["explanations"])


@router.get("/{agent_id}/explanations", response_model=AgentExplanation)
def get_explanations(
    agent: ScopedAgent,
    user: CurrentUser,
    session: SessionDep,
    target: Annotated[FloatType, Query(description="cash or emoney")] = FloatType.cash,
    lang: Annotated[Lang | None, Query(description="bn or en; default: user's language")] = None,
) -> AgentExplanation:
    """Top SHAP drivers of the next 24 h demand on one float, as bn/en template sentences."""
    result = agent_explanation(session, agent, target, lang or user.lang)
    if result is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="explanations_not_ready")
    return result
