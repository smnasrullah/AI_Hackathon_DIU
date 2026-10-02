from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.notification import NotificationItem, NotificationPage, ReadAllResult
from app.services import notifications

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationPage)
def list_notifications(
    user: CurrentUser,
    session: SessionDep,
    unread: Annotated[bool | None, Query(description="true: unread only; false: read only")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> NotificationPage:
    """The caller's own notifications, newest first, with the unread count for the bell."""
    return notifications.page(session, user, unread, page, page_size)


@router.post("/read-all", response_model=ReadAllResult)
def read_all(user: CurrentUser, session: SessionDep) -> ReadAllResult:
    updated = notifications.mark_all_read(session, user)
    session.commit()
    return ReadAllResult(updated=updated)


@router.post("/{notification_id}/read", response_model=NotificationItem)
def read_one(notification_id: int, user: CurrentUser, session: SessionDep) -> NotificationItem:
    item = notifications.mark_read(session, user, notification_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="notification_not_found")
    session.commit()
    return item
