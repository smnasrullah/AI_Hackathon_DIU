"""Audit log reads for the admin console: filtered page + the same filter for the CSV export."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, distinct, func, select
from sqlalchemy.orm import Session

from app.models import AuditLog, User
from app.schemas.admin import AuditItem, AuditPage


@dataclass(frozen=True)
class AuditFilter:
    action: str | None = None
    entity_type: str | None = None
    user: str | None = None  # e-mail substring
    start: datetime | None = None
    end: datetime | None = None


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def query(f: AuditFilter) -> Select[tuple[AuditLog, str | None, Any]]:
    """Newest first; the user columns are outer-joined (denied demo logins have no user)."""
    q = (select(AuditLog, User.email, User.role).outerjoin(User, User.id == AuditLog.user_id)
         .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()))
    if f.action:
        q = q.where(AuditLog.action == f.action)
    if f.entity_type:
        q = q.where(AuditLog.entity_type == f.entity_type)
    if f.user:
        q = q.where(User.email.icontains(f.user, autoescape=True))
    if f.start is not None:
        q = q.where(AuditLog.created_at >= _utc(f.start))
    if f.end is not None:
        q = q.where(AuditLog.created_at < _utc(f.end))
    return q


def payload_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, ensure_ascii=False)


def to_item(a: AuditLog, email: str | None, role: Any) -> AuditItem:
    return AuditItem(id=a.id, created_at=_utc(a.created_at), user_email=email, user_role=role,
                     action=a.action, entity_type=a.entity_type, entity_id=a.entity_id,
                     note=a.note, payload=payload_text(a.payload or {}))


def recent(session: Session, limit: int) -> list[AuditItem]:
    return [to_item(*row) for row in session.execute(query(AuditFilter()).limit(limit)).tuples()]


def audit_page(session: Session, f: AuditFilter, page: int, page_size: int) -> AuditPage:
    q = query(f)
    total = session.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
    rows = session.execute(q.offset((page - 1) * page_size).limit(page_size)).tuples()
    actions = session.scalars(select(distinct(AuditLog.action)).order_by(AuditLog.action))
    entities = session.scalars(select(distinct(AuditLog.entity_type))
                               .order_by(AuditLog.entity_type))
    return AuditPage(items=[to_item(*row) for row in rows], total=total, page=page,
                     page_size=page_size, actions=list(actions), entity_types=list(entities))
