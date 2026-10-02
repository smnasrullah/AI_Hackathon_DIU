from fastapi import APIRouter

from app.api.v1 import (
    agents,
    auth,
    events,
    explanations,
    forecast,
    recommendation_requests,
    recommendations,
    risk,
    risk_map,
    swaps,
    system,
    users,
    whatif,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
# Before agents: the static /agents/risk must win over /agents/{agent_id}.
api_router.include_router(risk.router)
api_router.include_router(agents.router)
api_router.include_router(forecast.router)
api_router.include_router(whatif.router)
api_router.include_router(explanations.router)
api_router.include_router(events.router)
api_router.include_router(recommendations.router)
api_router.include_router(recommendation_requests.router)
api_router.include_router(swaps.router)
api_router.include_router(risk_map.router)
