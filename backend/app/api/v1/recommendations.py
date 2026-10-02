from fastapi import APIRouter, HTTPException, status

from app.core.deps import ScopedAgent, SessionDep
from app.schemas.rebalance import AgentRecommendation
from app.services import recommendation_read

router = APIRouter(prefix="/agents", tags=["recommendations"])


@router.get("/{agent_id}/recommendation", response_model=AgentRecommendation)
def get_recommendation(agent: ScopedAgent, session: SessionDep) -> AgentRecommendation:
    """Top-up amount and deadline per float that will not cover the next hours (advisory)."""
    result = recommendation_read.agent_recommendation(session, agent)
    if result is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="recommendation_not_ready")
    return result
