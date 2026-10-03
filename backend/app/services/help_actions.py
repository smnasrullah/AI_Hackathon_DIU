"""What people do with a help request: helpers claim, decline or withdraw; the requester side
confirms (on time or late) or cancels. Nothing here moves money: it records who offered help
and tells the right people. Every change is audited (actor, old and new status).
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.core.clock import as_utc
from app.models import LiquidityRequest, User
from app.models.enums import HelpResponse, HelpStatus, UserRole
from app.rules import help_request_rules as rules
from app.schemas.liquidity_request import HelpRequestItem
from app.services import help_notify, help_settings
from app.services.help_core import (
    HelpError,
    audit,
    is_owner_side,
    item,
    load,
    move,
    now_utc,
    recipient,
    set_responses,
)
from app.services.help_timeouts import after_reopen, reopen_if_lapsed

OWNER_CONFIRM = (UserRole.agent, UserRole.distributor)
OWNER_CANCEL = (UserRole.agent, UserRole.distributor, UserRole.admin)


# --- recipient actions ------------------------------------------------------------------------

def claim(session: Session, user: User, request_id: int,
          now: datetime | None = None) -> HelpRequestItem:
    """First accept wins. Repeating it as the winner returns the same result."""
    now = now or now_utc()
    req = load(session, request_id)
    me = recipient(session, req, user.id)
    if me is None:
        raise HelpError("forbidden")
    policy = help_settings.current(session)
    reopen_if_lapsed(session, req, now, policy)
    if req.status == HelpStatus.claimed and req.claimed_by_user_id == user.id:
        return item(session, user, req)
    if not policy.enabled:
        raise HelpError("feature_disabled")
    if req.status == HelpStatus.claimed:
        raise HelpError("already_taken")
    if not rules.can("claim", req.status) or as_utc(req.needed_by) <= now:
        raise HelpError("invalid_transition")
    if me.response != HelpResponse.none:
        raise HelpError("already_responded")
    old = move(session, req, "claim", now, claimed_by_user_id=user.id, claimed_at=now,
               claim_expires_at=rules.claim_expires_at(now, policy))
    if old is None:
        if req.claimed_by_user_id == user.id:
            return item(session, user, req)
        raise HelpError("already_taken")
    me.response, me.responded_at = HelpResponse.accepted, now
    others = set_responses(session, req, [HelpResponse.none], HelpResponse.superseded, now,
                           skip=user.id)
    audit(session, user.id, "claim", req, old, now, policy)
    help_notify.send(session, policy, req, others, "covered", user.id)
    help_notify.send(session, policy, req, help_notify.requester_users(session, req), "claimed",
                     user.id)
    return item(session, user, req)


def decline(session: Session, user: User, request_id: int, note: str | None = None,
            now: datetime | None = None) -> HelpRequestItem:
    """Recorded for the caller only; the request and everyone else are untouched."""
    now = now or now_utc()
    req = load(session, request_id)
    me = recipient(session, req, user.id)
    if me is None:
        raise HelpError("forbidden")
    if me.response == HelpResponse.declined:
        return item(session, user, req)
    if req.status not in rules.ACTIVE or me.response not in (HelpResponse.none,
                                                             HelpResponse.superseded):
        raise HelpError("invalid_transition")
    me.response, me.responded_at = HelpResponse.declined, now
    session.flush()
    audit(session, user.id, "decline", req, req.status, now, help_settings.current(session),
          note)
    return item(session, user, req)


def withdraw(session: Session, user: User, request_id: int, note: str | None = None,
             now: datetime | None = None) -> HelpRequestItem:
    """The helper backs out before confirmation; the request is open again for the others."""
    now = now or now_utc()
    req = load(session, request_id)
    me = recipient(session, req, user.id)
    if me is None:
        raise HelpError("forbidden")
    if req.claimed_by_user_id != user.id or req.status != HelpStatus.claimed:
        if me.response in (HelpResponse.declined, HelpResponse.expired):
            return item(session, user, req)  # already withdrawn or timed out
        raise HelpError("not_claimant")
    policy = help_settings.current(session)
    old = move(session, req, "withdraw", now, LiquidityRequest.claimed_by_user_id == user.id,
               claimed_by_user_id=None, claimed_at=None, claim_expires_at=None)
    if old is None:
        raise HelpError("invalid_transition")
    me.response, me.responded_at = HelpResponse.declined, now
    after_reopen(session, req, now, policy, user.id, user.id, "withdraw", note)
    return item(session, user, req)


# --- requester side ---------------------------------------------------------------------------

def confirm(session: Session, user: User, request_id: int, note: str | None = None,
            now: datetime | None = None) -> HelpRequestItem:
    """The requester agent or their distributor confirms the money arrived."""
    now = now or now_utc()
    req = load(session, request_id)
    if not is_owner_side(session, user, req, OWNER_CONFIRM):
        raise HelpError("forbidden")
    if req.status == HelpStatus.fulfilled:
        return item(session, user, req)
    policy = help_settings.current(session)
    old = move(session, req, "confirm", now, fulfilled_at=now)
    if old is None:
        raise HelpError("invalid_transition")
    audit(session, user.id, "confirm", req, old, now, policy, note)
    parties = help_notify.requester_users(session, req)
    if req.claimed_by_user_id:
        parties.add(req.claimed_by_user_id)
    help_notify.send(session, policy, req, parties, "fulfilled", user.id)
    return item(session, user, req)


def confirm_late(session: Session, user: User, request_id: int, note: str | None = None,
                 now: datetime | None = None) -> HelpRequestItem:
    """The helper whose claim timed out delivered after all. Only when the request had such a
    claim, and it is open again or expired at most late_confirm_grace_h ago (never cancelled):
    that helper is recorded as the one who delivered, the request is fulfilled, the others still
    waiting hear it is covered, everyone involved is told."""
    now = now or now_utc()
    req = load(session, request_id)
    if not is_owner_side(session, user, req, OWNER_CONFIRM):
        raise HelpError("forbidden")
    helper = req.lapsed_claimant_user_id
    if req.status == HelpStatus.fulfilled and helper is not None \
            and req.claimed_by_user_id == helper:
        return item(session, user, req)
    if helper is None:
        raise HelpError("no_lapsed_claim")
    policy = help_settings.current(session)
    if req.status == HelpStatus.expired and not rules.late_confirm_open(
            as_utc(req.expired_at or req.updated_at), now, policy):
        raise HelpError("late_window_passed")
    old = move(session, req, "confirm_late", now,
               LiquidityRequest.lapsed_claimant_user_id == helper,
               claimed_by_user_id=helper, fulfilled_at=now)
    if old is None:
        raise HelpError("invalid_transition")
    mine = recipient(session, req, helper)
    if mine is not None:
        mine.response, mine.responded_at = HelpResponse.accepted, now
    waiting = set_responses(session, req, [HelpResponse.none, HelpResponse.superseded],
                            HelpResponse.superseded, now, skip=helper)
    audit(session, user.id, "confirm_late", req, old, now, policy, note, late_helper=str(helper),
          after_expiry=old == HelpStatus.expired)
    help_notify.send(session, policy, req, waiting, "covered", user.id)
    parties = help_notify.requester_users(session, req) | help_notify.distributor_users(
        session, req) | {helper}
    help_notify.send(session, policy, req, parties, "fulfilled_late", user.id)
    return item(session, user, req)


def cancel(session: Session, user: User, request_id: int, note: str | None = None,
           now: datetime | None = None) -> HelpRequestItem:
    """The requester agent, their distributor or an admin calls it off. Audited with the actor,
    old and new status."""
    now = now or now_utc()
    req = load(session, request_id)
    if not is_owner_side(session, user, req, OWNER_CANCEL):
        raise HelpError("forbidden")
    if req.status == HelpStatus.cancelled:
        return item(session, user, req)
    policy = help_settings.current(session)
    old = move(session, req, "cancel", now)
    if old is None:
        raise HelpError("invalid_transition")
    audit(session, user.id, "cancel", req, old, now, policy, note, actor_role=user.role.value)
    told = help_notify.recipients_with(session, req, (
        HelpResponse.none, HelpResponse.superseded, HelpResponse.accepted))
    help_notify.send(session, policy, req, told | help_notify.requester_users(session, req),
                     "cancelled", user.id)
    return item(session, user, req)
