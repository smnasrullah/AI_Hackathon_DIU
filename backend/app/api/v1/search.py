from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, SessionDep
from app.schemas.search import SearchResponse
from app.services import search as search_service

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse)
def search(
    user: CurrentUser,
    session: SessionDep,
    q: Annotated[str, Query(min_length=1, max_length=80)],
) -> SearchResponse:
    """Command palette: agents in the caller's scope (code / name / region) + role pages, max 8."""
    return search_service.search(session, user, q)
