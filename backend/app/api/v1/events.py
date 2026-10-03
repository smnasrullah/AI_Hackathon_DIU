from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.deps import CurrentUser, SessionDep, require_roles
from app.core.params import IdPath, PageQuery
from app.models import User
from app.models.enums import EventType, UserRole
from app.schemas.event import EventIn, EventItem, EventPage
from app.services import events
from app.services.events import EventError

router = APIRouter(prefix="/events", tags=["events"])

Admin = Annotated[User, Depends(require_roles(UserRole.admin))]
_STATUS = {"event_not_found": status.HTTP_404_NOT_FOUND,
           "unknown_district": status.HTTP_422_UNPROCESSABLE_ENTITY}


def _http(exc: EventError) -> HTTPException:
    return HTTPException(_STATUS.get(exc.code, status.HTTP_409_CONFLICT), detail=exc.code)


@router.get("", response_model=EventPage)
def list_events(
    _: CurrentUser,
    session: SessionDep,
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
    kind: Annotated[EventType | None, Query(alias="type")] = None,
    district: Annotated[str | None, Query(max_length=80)] = None,
    page: PageQuery = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> EventPage:
    """Events overlapping [from, to), by start time; `district` keeps nationwide events too."""
    return events.event_page(session, start, end, kind, district, page, page_size)


@router.post("", response_model=EventItem, status_code=status.HTTP_201_CREATED)
def create_event(body: EventIn, user: Admin, session: SessionDep) -> EventItem:
    """Add an event (audit_log). Forecasts use it from the next precompute."""
    try:
        item = events.create(session, user, body)
    except EventError as exc:
        raise _http(exc) from exc
    session.commit()
    return item


@router.put("/{event_id}", response_model=EventItem)
def update_event(event_id: IdPath, body: EventIn, user: Admin, session: SessionDep) -> EventItem:
    """Replace an event (audit_log keeps before/after)."""
    try:
        item = events.update(session, user, event_id, body)
    except EventError as exc:
        raise _http(exc) from exc
    session.commit()
    return item


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: IdPath, user: Admin, session: SessionDep) -> Response:
    """Delete an event (audit_log keeps the deleted row)."""
    try:
        events.delete(session, user, event_id)
    except EventError as exc:
        raise _http(exc) from exc
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
