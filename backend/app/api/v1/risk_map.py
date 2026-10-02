from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import get_settings
from app.core.deps import SessionDep, require_roles
from app.models import User
from app.models.enums import UserRole
from app.rules.risk_rules import HORIZONS, build_config
from app.schemas.map import MapAgents
from app.services import risk_map

router = APIRouter(prefix="/map", tags=["map"])

Viewer = Annotated[User, Depends(require_roles(UserRole.distributor, UserRole.admin))]


@router.get("/agents", response_model=MapAgents)
def get_map_agents(
    user: Viewer,
    session: SessionDep,
    at_hour: Annotated[int, Query(ge=0, le=max(HORIZONS))] = 0,
) -> MapAgents:
    """Scoped agents' lat/lng + risk level at `at_hour` (0..72) + current swaps (time scrubber)."""
    result = risk_map.map_agents(session, user, at_hour,
                                 build_config(get_settings().risk_thresholds))
    if result is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="risk_not_ready")
    return result
