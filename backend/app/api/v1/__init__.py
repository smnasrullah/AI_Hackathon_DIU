from fastapi import APIRouter

from app.api.v1 import agents, auth, forecast, risk, system, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
# Before agents: the static /agents/risk must win over /agents/{agent_id}.
api_router.include_router(risk.router)
api_router.include_router(agents.router)
api_router.include_router(forecast.router)
