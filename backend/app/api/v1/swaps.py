from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.csv_export import CSV_RESPONSES, csv_response
from app.core.deps import CurrentUser, SessionDep, require_roles
from app.models import User
from app.models.enums import SwapStatus, UserRole
from app.schemas.swap import SwapDecisionIn, SwapItem, SwapPage, SwapRespondIn
from app.services import exports, swaps
from app.services.swaps import SwapError

router = APIRouter(prefix="/swaps", tags=["swaps"])

Distributor = Annotated[User, Depends(require_roles(UserRole.distributor))]
AgentUser = Annotated[User, Depends(require_roles(UserRole.agent))]
_STATUS = {"forbidden": status.HTTP_403_FORBIDDEN}


def _http(exc: SwapError) -> HTTPException:
    return HTTPException(_STATUS.get(exc.code, status.HTTP_409_CONFLICT), detail=exc.code)


@router.get("", response_model=SwapPage)
def list_swaps(
    user: CurrentUser,
    session: SessionDep,
    swap_status: Annotated[SwapStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> SwapPage:
    """Swap suggestions in scope (agent: own as donor or receiver; distributor: own agents)."""
    if not swaps.is_ready(session):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="swaps_not_ready")
    return swaps.swap_page(session, user, swap_status, page, page_size)


@router.get("/export.csv", response_class=Response, responses=CSV_RESPONSES)
def export_swaps(
    user: CurrentUser,
    session: SessionDep,
    swap_status: Annotated[SwapStatus | None, Query(alias="status")] = None,
) -> Response:
    """The swap queue in scope as CSV (notes are user text: formula-escaped)."""
    if not swaps.is_ready(session):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="swaps_not_ready")
    return csv_response("swaps.csv", exports.SWAP_HEADER,
                        exports.swap_rows(swaps.all_items(session, user, swap_status)))


@router.post("/{swap_id}/decision", response_model=SwapItem)
def decide(swap_id: int, body: SwapDecisionIn, user: Distributor,
           session: SessionDep) -> SwapItem:
    """Distributor approves or rejects with a note (audit_log). Advisory: no money moves."""
    try:
        item = swaps.decide(session, user, swap_id, body.decision, body.note)
    except SwapError as exc:
        raise _http(exc) from exc
    session.commit()
    return item


@router.post("/{swap_id}/respond", response_model=SwapItem)
def respond(swap_id: int, body: SwapRespondIn, user: AgentUser, session: SessionDep) -> SwapItem:
    """Donor or receiver agent accepts or declines (audit_log); the distributor still decides."""
    try:
        item = swaps.respond(session, user, swap_id, body.response, body.note)
    except SwapError as exc:
        raise _http(exc) from exc
    session.commit()
    return item
