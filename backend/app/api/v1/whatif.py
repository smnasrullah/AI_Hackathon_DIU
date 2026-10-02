from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.core.deps import ScopedAgent, SessionDep, require_roles
from app.models import User
from app.models.enums import UserRole
from app.rules.risk_rules import build_config
from app.schemas.whatif import WhatIfIn, WhatIfOut
from app.services import whatif

router = APIRouter(prefix="/agents", tags=["whatif"])

Caller = Annotated[User, Depends(require_roles(UserRole.agent, UserRole.distributor))]


@router.post("/{agent_id}/whatif", response_model=WhatIfOut)
def post_whatif(body: WhatIfIn, _: Caller, agent: ScopedAgent, session: SessionDep
                ) -> WhatIfOut:
    """Stockout + risk if `delta_amount` BDT were added to one float now (advisory, no money moves).

    Re-projects the cached quantile paths; `before` equals the cache. 422 `delta_out_of_bounds`
    when the new balance would leave 0..capacity.
    """
    settings = get_settings()
    try:
        result = whatif.run(session, agent, body, build_config(settings.risk_thresholds),
                            settings.seed)
    except whatif.WhatIfError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.code) from exc
    if result is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="risk_not_ready")
    return result
