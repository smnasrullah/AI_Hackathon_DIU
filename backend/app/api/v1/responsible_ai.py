from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import CurrentUser, SessionDep, require_roles
from app.models import User
from app.models.enums import Lang, UserRole
from app.schemas.responsible_ai import FairnessReport, GroupBy, ModelCard
from app.services import fairness
from app.services.model_card import model_card

router = APIRouter(prefix="/responsible-ai", tags=["responsible-ai"])

# Group-level aggregates only, so every role may read them.
Reader = Annotated[User, Depends(require_roles(UserRole.agent, UserRole.distributor,
                                               UserRole.admin))]


@router.get("/fairness", response_model=FairnessReport)
def get_fairness(
    _: Reader,
    session: SessionDep,
    group_by: Annotated[GroupBy, Query(alias="groupBy")] = GroupBy.urban_rural,
) -> FairnessReport:
    """Held-out forecast MAE and stockout recall per agent group, with the gap between groups."""
    result = fairness.read(session, group_by)
    if result is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="fairness_not_ready")
    return result


@router.get("/model-card", response_model=ModelCard)
def get_model_card(
    user: CurrentUser,
    _: Reader,
    session: SessionDep,
    lang: Annotated[Lang | None, Query(description="bn or en; default: user's language")] = None,
) -> ModelCard:
    """Active models, held-out metrics, data, intended use, limits; advisory only."""
    result = model_card(session, lang or user.lang)
    if result is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="model_not_ready")
    return result
