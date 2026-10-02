"""The caller's own notifications: list, mark one read, mark all read. Never another user's."""

from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Notification, User
from app.schemas.notification import NotificationItem, NotificationPage


def _item(n: Notification) -> NotificationItem:
    item = NotificationItem.model_validate(n)
    for field in ("read_at", "created_at"):
        ts = getattr(item, field)
        if ts is not None and ts.tzinfo is None:  # SQLite drops the zone
            setattr(item, field, ts.replace(tzinfo=UTC))
    return item


def page(session: Session, user: User, unread: bool | None, page_no: int,
         page_size: int) -> NotificationPage:
    mine = Notification.user_id == user.id
    query = select(Notification).where(mine)
    if unread is True:
        query = query.where(Notification.read_at.is_(None))
    elif unread is False:
        query = query.where(Notification.read_at.is_not(None))
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    unread_count = session.scalar(select(func.count()).select_from(Notification).where(
        mine, Notification.read_at.is_(None))) or 0
    rows = session.scalars(query.order_by(Notification.created_at.desc(), Notification.id.desc())
                           .offset((page_no - 1) * page_size).limit(page_size))
    return NotificationPage(items=[_item(n) for n in rows], total=total,
                            unread_count=unread_count, page=page_no, page_size=page_size)


def mark_read(session: Session, user: User, notification_id: int) -> NotificationItem | None:
    """None for unknown ids and other users' ids alike, so ids cannot be probed."""
    n = session.scalar(select(Notification).where(Notification.id == notification_id,
                                                  Notification.user_id == user.id))
    if n is None:
        return None
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
        session.flush()
    return _item(n)


def mark_all_read(session: Session, user: User) -> int:
    result = session.execute(update(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC)))
    return int(getattr(result, "rowcount", 0) or 0)
