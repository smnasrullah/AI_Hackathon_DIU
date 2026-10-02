"""Events (salary, Eid, hat-bazar, weather, holiday): listed for every role, CRUD for admins.

Every admin change is written to audit_log. Forecasts and explanations pick changes up at the
next precompute (restart): the forecast cache key includes an events fingerprint.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Agent, AuditLog, Event, User
from app.models.enums import EventType
from app.schemas.event import EventIn, EventItem, EventPage

ENTITY = "event"


class EventError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def _item(e: Event) -> EventItem:
    return EventItem(id=e.id, type=e.type, name_en=e.name_en, name_bn=e.name_bn,
                     starts_at=_utc(e.starts_at), ends_at=_utc(e.ends_at), district=e.district,
                     intensity=float(e.intensity))


def event_page(session: Session, start: datetime | None, end: datetime | None,
               kind: EventType | None, district: str | None, page: int, page_size: int
               ) -> EventPage:
    """Events overlapping [start, end); a district filter keeps nationwide events too."""
    query = select(Event)
    if start is not None:
        query = query.where(Event.ends_at > _utc(start))
    if end is not None:
        query = query.where(Event.starts_at < _utc(end))
    if kind is not None:
        query = query.where(Event.type == kind)
    if district is not None:
        query = query.where(or_(Event.district == district, Event.district.is_(None)))
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    found = session.scalars(query.order_by(Event.starts_at, Event.id)
                            .offset((page - 1) * page_size).limit(page_size))
    return EventPage(items=[_item(e) for e in found], total=total, page=page, page_size=page_size)


def _snapshot(e: Event) -> dict[str, Any]:
    return _item(e).model_dump(mode="json")


def _audit(session: Session, user: User, action: str, event_id: int,
           payload: dict[str, Any]) -> None:
    session.add(AuditLog(user_id=user.id, action=f"{ENTITY}.{action}", entity_type=ENTITY,
                         entity_id=str(event_id), note=None, payload=payload))


def _apply(session: Session, e: Event, body: EventIn) -> None:
    if body.district is not None and session.scalar(
            select(Agent.id).where(Agent.district == body.district).limit(1)) is None:
        raise EventError("unknown_district")
    e.type, e.name_en, e.name_bn = body.type, body.name_en, body.name_bn
    e.starts_at, e.ends_at = _utc(body.starts_at), _utc(body.ends_at)
    e.district, e.intensity = body.district, Decimal(str(round(body.intensity, 3)))


def _get(session: Session, event_id: int) -> Event:
    e = session.get(Event, event_id)
    if e is None:
        raise EventError("event_not_found")
    return e


def create(session: Session, user: User, body: EventIn) -> EventItem:
    e = Event()
    _apply(session, e, body)
    session.add(e)
    session.flush()
    _audit(session, user, "create", e.id, {"after": _snapshot(e)})
    return _item(e)


def update(session: Session, user: User, event_id: int, body: EventIn) -> EventItem:
    e = _get(session, event_id)
    before = _snapshot(e)
    _apply(session, e, body)
    session.flush()
    _audit(session, user, "update", e.id, {"before": before, "after": _snapshot(e)})
    return _item(e)


def delete(session: Session, user: User, event_id: int) -> None:
    e = _get(session, event_id)
    _audit(session, user, "delete", e.id, {"before": _snapshot(e)})
    session.delete(e)
    session.flush()
