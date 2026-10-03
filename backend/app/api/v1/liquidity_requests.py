"""Liquidity help requests: several helpers asked, the first accept wins, the requester confirms.
Advisory coordination only: no endpoint moves money."""

from collections.abc import Callable
from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import CurrentUser, SessionDep, require_roles
from app.core.params import IdPath, PageQuery
from app.models import User
from app.models.enums import HelpStatus, UserRole
from app.schemas.liquidity_request import (
    HelpNoteIn,
    HelpRequestItem,
    HelpRequestPage,
    HelpSettingsIn,
    HelpSettingsOut,
    HelpSweepOut,
)
from app.services import help_settings, liquidity_read
from app.services import liquidity_requests as help_requests
from app.services.liquidity_requests import HelpError

router = APIRouter(prefix="/liquidity-requests", tags=["liquidity-requests"])
admin_router = APIRouter(prefix="/admin/liquidity-requests", tags=["liquidity-requests"])

Helper = Annotated[User, Depends(require_roles(UserRole.agent, UserRole.distributor))]
Canceller = Annotated[User, Depends(require_roles(UserRole.agent, UserRole.distributor,
                                                   UserRole.admin))]
Admin = Annotated[User, Depends(require_roles(UserRole.admin))]
StatusQuery = Annotated[HelpStatus | None, Query(alias="status")]
# Unset fields are omitted: owner-only extras never reach helpers, wave counters never agents.
ITEM: dict[str, Any] = {"response_model": HelpRequestItem, "response_model_exclude_unset": True}
PAGE: dict[str, Any] = {"response_model": HelpRequestPage, "response_model_exclude_unset": True}
PageSize = Annotated[int, Query(ge=1, le=100)]


def _run(session: SessionDep, call: Callable[[], HelpRequestItem]) -> HelpRequestItem:
    try:
        item = call()
    except HelpError as exc:
        session.rollback()
        code = status.HTTP_403_FORBIDDEN if exc.code == "forbidden" else status.HTTP_409_CONFLICT
        raise HTTPException(code, detail=exc.code) from exc
    session.commit()
    return item


def _note(body: HelpNoteIn | None) -> str | None:
    return body.note if body else None


@router.get("/mine", **PAGE)
def list_mine(user: Helper, session: SessionDep, request_status: StatusQuery = None,
              page: PageQuery = 1, page_size: PageSize = 20) -> HelpRequestPage:
    """As requester: an agent's own requests; a distributor's agents' requests. Newest first."""
    return liquidity_read.as_requester(session, user, request_status, page, page_size)


@router.get("/inbox", **PAGE)
def list_inbox(user: Helper, session: SessionDep, request_status: StatusQuery = None,
               page: PageQuery = 1, page_size: PageSize = 20) -> HelpRequestPage:
    """Requests the caller was asked to help with (amount, area and deadline; no balances)."""
    return liquidity_read.addressed_to(session, user, request_status, page, page_size)


@router.get("/{request_id}", **ITEM)
def get_request(request_id: IdPath, user: CurrentUser, session: SessionDep) -> HelpRequestItem:
    """One request. Unknown ids and ids outside the caller's reach are both 403."""
    return _run(session, lambda: help_requests.get(session, user, request_id))


@router.post("/{request_id}/claim", **ITEM)
def claim(request_id: IdPath, user: Helper, session: SessionDep) -> HelpRequestItem:
    """A listed recipient accepts. Exactly one wins; the others get 409 already_taken."""
    return _run(session, lambda: help_requests.claim(session, user, request_id))


@router.post("/{request_id}/decline", **ITEM)
def decline(request_id: IdPath, user: Helper, session: SessionDep,
            body: HelpNoteIn | None = None) -> HelpRequestItem:
    """A listed recipient says no; nobody else is affected."""
    return _run(session, lambda: help_requests.decline(session, user, request_id, _note(body)))


@router.post("/{request_id}/withdraw", **ITEM)
def withdraw(request_id: IdPath, user: Helper, session: SessionDep,
             body: HelpNoteIn | None = None) -> HelpRequestItem:
    """The helper who claimed it backs out before confirmation; the request reopens."""
    return _run(session, lambda: help_requests.withdraw(session, user, request_id, _note(body)))


@router.post("/{request_id}/confirm", **ITEM)
def confirm(request_id: IdPath, user: Helper, session: SessionDep,
            body: HelpNoteIn | None = None) -> HelpRequestItem:
    """The requester agent or their distributor confirms receipt."""
    return _run(session, lambda: help_requests.confirm(session, user, request_id, _note(body)))


@router.post("/{request_id}/confirm-late", **ITEM)
def confirm_late(request_id: IdPath, user: Helper, session: SessionDep,
                 body: HelpNoteIn | None = None) -> HelpRequestItem:
    """The requester agent or their distributor confirms that the helper whose claim timed out
    delivered after all. Only on a reopened request that had such a claim (409
    no_lapsed_claim otherwise)."""
    return _run(session, lambda: help_requests.confirm_late(session, user, request_id,
                                                            _note(body)))


@router.post("/{request_id}/cancel", **ITEM)
def cancel(request_id: IdPath, user: Canceller, session: SessionDep,
           body: HelpNoteIn | None = None) -> HelpRequestItem:
    """The requester agent, their own distributor or an admin cancels an open or claimed
    request. Anyone else is 403. Audited (actor, old and new status)."""
    return _run(session, lambda: help_requests.cancel(session, user, request_id, _note(body)))


# --- admin ------------------------------------------------------------------------------------

@admin_router.get("", **PAGE)
def list_all(user: Admin, session: SessionDep, request_status: StatusQuery = None,
             page: PageQuery = 1, page_size: PageSize = 20) -> HelpRequestPage:
    """Every help request, newest first."""
    return liquidity_read.all_requests(session, user, request_status, page, page_size)


@admin_router.get("/settings", response_model=HelpSettingsOut)
def read_settings(_user: Admin, session: SessionDep) -> HelpSettingsOut:
    """Kill switch, dry run, claim timeout, cooldown, daily cap, recipients per wave."""
    return HelpSettingsOut(**asdict(help_settings.current(session)))


@admin_router.put("/settings", response_model=HelpSettingsOut)
def write_settings(body: HelpSettingsIn, user: Admin, session: SessionDep) -> HelpSettingsOut:
    """Change any subset of the switches (audit_log keeps old and new values)."""
    policy = help_settings.update(session, user, body.model_dump(exclude_none=True))
    session.commit()
    return HelpSettingsOut(**asdict(policy))


@admin_router.post("/sweep", response_model=HelpSweepOut)
def sweep(_user: Admin, session: SessionDep) -> HelpSweepOut:
    """Reopen timed-out claims and expire overdue requests now. Safe to repeat."""
    reopened, expired = help_requests.sweep(session)
    session.commit()
    return HelpSweepOut(reopened=reopened, expired=expired)
