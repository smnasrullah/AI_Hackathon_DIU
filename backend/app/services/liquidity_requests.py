"""Liquidity help requests: one agent short of float, several helpers asked, exactly one wins.

Every status change is a conditional UPDATE (WHERE status IN <allowed from>), so two people
acting at once cannot both win: the loser's UPDATE matches no row and gets a 409. Transitions:
app/rules/help_request_rules.py. Every change is audited (actor, old and new status).
Nothing here moves money: it records who offered help and tells the right people.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import ColumnElement, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Agent, AuditLog, LiquidityRequest, LiquidityRequestRecipient, User
from app.models.enums import (
    FloatType,
    HelpOrigin,
    HelpResponse,
    HelpStatus,
    NotificationSeverity,
    UserRole,
)
from app.rules import help_request_rules as rules
from app.rules.help_request_rules import Event, HelpPolicy
from app.schemas.liquidity_request import HelpRequestItem
from app.services import help_notify, help_settings, liquidity_read
from app.services.forecast import _utc

ENTITY = "liquidity_request"
Recipient = LiquidityRequestRecipient
HELPER_ROLES = (UserRole.agent, UserRole.distributor)


class HelpError(Exception):
    """forbidden (403); everything else 409: invalid_transition, already_taken,
    already_responded, not_claimant, feature_disabled, cooldown, daily_cap, no_recipients,
    deadline_passed."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Candidate:
    """A helper to ask; ranking them is the trigger job's work, not this module's."""

    user_id: uuid.UUID
    distance_km: float | None = None


def now_utc() -> datetime:
    return datetime.now(UTC)


def dedupe_key(agent_id: int, float_type: FloatType) -> str:
    return f"{agent_id}:{float_type.value}"


# --- helpers ----------------------------------------------------------------------------------

def _load(session: Session, request_id: int) -> LiquidityRequest:
    req = session.get(LiquidityRequest, request_id, populate_existing=True)
    if req is None:
        raise HelpError("forbidden")
    return req


def _recipient(session: Session, req: LiquidityRequest, user_id: uuid.UUID) -> Recipient | None:
    return session.scalar(select(Recipient).where(Recipient.request_id == req.id,
                                                  Recipient.recipient_user_id == user_id))


def _move(session: Session, req: LiquidityRequest, event: Event, now: datetime,
          *where: ColumnElement[bool], **values: Any) -> HelpStatus | None:
    """Atomic transition. Returns the old status, or None when the row was no longer in an
    allowed state (someone else got there first)."""
    allowed, new = rules.TRANSITIONS[event]
    old = req.status
    result = session.execute(
        update(LiquidityRequest)
        .where(LiquidityRequest.id == req.id, LiquidityRequest.status.in_(allowed), *where)
        .values(status=new, updated_at=now, **values)
        .execution_options(synchronize_session=False))
    session.refresh(req)
    return old if getattr(result, "rowcount", 0) == 1 else None


def _audit(session: Session, actor: uuid.UUID | None, action: str, req: LiquidityRequest,
           old: HelpStatus | None, now: datetime, policy: HelpPolicy, note: str | None = None,
           **extra: object) -> None:
    session.add(AuditLog(user_id=actor, action=f"{ENTITY}.{action}", entity_type=ENTITY,
                         entity_id=str(req.id), note=note, payload={
                             "old_status": old.value if old else None,
                             "new_status": req.status.value, "at": now.isoformat(),
                             "requester_agent_id": req.requester_agent_id,
                             "float_type": req.float_type.value,
                             "amount_needed": float(req.amount_needed),
                             "dry_run": policy.dry_run, **extra}))


def _set_responses(session: Session, req: LiquidityRequest, frm: Sequence[HelpResponse],
                   to: HelpResponse, now: datetime,
                   skip: uuid.UUID | None = None) -> set[uuid.UUID]:
    """Move recipients' answers from any of `frm` to `to`; returns the users moved."""
    query = select(Recipient).where(Recipient.request_id == req.id, Recipient.response.in_(frm))
    moved = set()
    for r in session.scalars(query):
        if r.recipient_user_id == skip:
            continue
        r.response, r.responded_at = to, (None if to == HelpResponse.none else now)
        moved.add(r.recipient_user_id)
    session.flush()
    return moved


def _item(session: Session, user: User, req: LiquidityRequest) -> HelpRequestItem:
    item = liquidity_read.one(session, user, req)
    if item is None:
        raise HelpError("forbidden")
    return item


def _is_owner_side(session: Session, user: User, req: LiquidityRequest,
                   roles: Sequence[UserRole]) -> bool:
    """The requester agent (role agent), their distributor (role distributor), or an admin."""
    if user.role not in roles:
        return False
    if user.role == UserRole.admin:
        return True
    if user.role == UserRole.agent:
        return user.agent_id == req.requester_agent_id
    agent = session.get(Agent, req.requester_agent_id)
    return agent is not None and agent.distributor_id == user.distributor_id


# --- create (called by the trigger job or a user action; no endpoint yet) ----------------------

def create(session: Session, *, requester_agent_id: int, float_type: FloatType,
           amount_needed: Decimal, needed_by: datetime, reason_summary: str | None,
           candidates: Sequence[Candidate], created_by: HelpOrigin,
           actor: uuid.UUID | None = None,
           now: datetime | None = None) -> tuple[LiquidityRequest, bool]:
    """(request, created). An active request for the same agent and float is returned as is.

    Must be the first write of the unit of work: a lost dedupe race rolls the session back.
    """
    now = now or now_utc()
    policy = help_settings.current(session)
    if not policy.enabled:
        raise HelpError("feature_disabled")
    key = dedupe_key(requester_agent_id, float_type)
    existing = _active(session, key)
    if existing is not None:
        return existing, False
    if _utc(needed_by) <= now:
        raise HelpError("deadline_passed")
    earlier = session.scalars(select(LiquidityRequest.created_at).where(
        LiquidityRequest.requester_agent_id == requester_agent_id,
        LiquidityRequest.created_at > now - rules.DAY))
    block = rules.abuse_block((_utc(t) for t in earlier), now, policy)
    if block:
        raise HelpError(block)
    helpers = _eligible(session, requester_agent_id, candidates)[:policy.max_recipients_per_wave]
    if not helpers:
        raise HelpError("no_recipients")
    req = LiquidityRequest(requester_agent_id=requester_agent_id, float_type=float_type,
                           amount_needed=amount_needed, needed_by=needed_by,
                           reason_summary=reason_summary, status=HelpStatus.open,
                           wave_number=1, created_by=created_by, dedupe_key=key,
                           created_at=now, updated_at=now)
    session.add(req)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()  # another writer created the active request first
        existing = _active(session, key)
        if existing is None:
            raise
        return existing, False
    notified = None if policy.dry_run else now
    for user, cand in helpers:
        session.add(Recipient(request_id=req.id, recipient_user_id=user.id,
                              recipient_role=user.role, wave_number=1, notified_at=notified,
                              response=HelpResponse.none,
                              distance_km=None if cand.distance_km is None
                              else Decimal(str(round(cand.distance_km, 2)))))
    session.flush()
    _audit(session, actor, "create", req, None, now, policy, recipients=len(helpers),
           created_by=created_by.value)
    help_notify.send(session, policy, req, (u.id for u, _ in helpers), "new", actor,
                     NotificationSeverity.warning)
    help_notify.send(session, policy, req, help_notify.requester_users(session, req), "created",
                     actor)
    return req, True


def _active(session: Session, key: str) -> LiquidityRequest | None:
    return session.scalar(select(LiquidityRequest).where(
        LiquidityRequest.dedupe_key == key, LiquidityRequest.status.in_(rules.ACTIVE)))


def _eligible(session: Session, requester_agent_id: int,
              candidates: Sequence[Candidate]) -> list[tuple[User, Candidate]]:
    """Active agent/distributor users, first mention wins, never the requester's own users."""
    ids = list(dict.fromkeys(c.user_id for c in candidates))
    users = {u.id: u for u in session.scalars(select(User).where(
        User.id.in_(ids), User.is_active.is_(True), User.role.in_(HELPER_ROLES)))}
    first = {c.user_id: c for c in reversed(candidates)}
    return [(users[i], first[i]) for i in ids
            if i in users and users[i].agent_id != requester_agent_id]


# --- recipient actions ------------------------------------------------------------------------

def claim(session: Session, user: User, request_id: int,
          now: datetime | None = None) -> HelpRequestItem:
    """First accept wins. Repeating it as the winner returns the same result."""
    now = now or now_utc()
    req = _load(session, request_id)
    me = _recipient(session, req, user.id)
    if me is None:
        raise HelpError("forbidden")
    policy = help_settings.current(session)
    _reopen_if_lapsed(session, req, now, policy)
    if req.status == HelpStatus.claimed and req.claimed_by_user_id == user.id:
        return _item(session, user, req)
    if not policy.enabled:
        raise HelpError("feature_disabled")
    if req.status == HelpStatus.claimed:
        raise HelpError("already_taken")
    if not rules.can("claim", req.status) or _utc(req.needed_by) <= now:
        raise HelpError("invalid_transition")
    if me.response != HelpResponse.none:
        raise HelpError("already_responded")
    old = _move(session, req, "claim", now, claimed_by_user_id=user.id, claimed_at=now,
                claim_expires_at=rules.claim_expires_at(now, policy))
    if old is None:
        if req.claimed_by_user_id == user.id:
            return _item(session, user, req)
        raise HelpError("already_taken")
    me.response, me.responded_at = HelpResponse.accepted, now
    others = _set_responses(session, req, [HelpResponse.none], HelpResponse.superseded, now,
                            skip=user.id)
    _audit(session, user.id, "claim", req, old, now, policy)
    help_notify.send(session, policy, req, others, "covered", user.id)
    help_notify.send(session, policy, req, help_notify.requester_users(session, req), "claimed",
                     user.id)
    return _item(session, user, req)


def decline(session: Session, user: User, request_id: int, note: str | None = None,
            now: datetime | None = None) -> HelpRequestItem:
    """Recorded for the caller only; the request and everyone else are untouched."""
    now = now or now_utc()
    req = _load(session, request_id)
    me = _recipient(session, req, user.id)
    if me is None:
        raise HelpError("forbidden")
    if me.response == HelpResponse.declined:
        return _item(session, user, req)
    if req.status not in rules.ACTIVE or me.response not in (HelpResponse.none,
                                                             HelpResponse.superseded):
        raise HelpError("invalid_transition")
    me.response, me.responded_at = HelpResponse.declined, now
    session.flush()
    _audit(session, user.id, "decline", req, req.status, now, help_settings.current(session),
           note)
    return _item(session, user, req)


def withdraw(session: Session, user: User, request_id: int, note: str | None = None,
             now: datetime | None = None) -> HelpRequestItem:
    """The helper backs out before confirmation; the request is open again for the others."""
    now = now or now_utc()
    req = _load(session, request_id)
    me = _recipient(session, req, user.id)
    if me is None:
        raise HelpError("forbidden")
    if req.claimed_by_user_id != user.id or req.status != HelpStatus.claimed:
        if me.response in (HelpResponse.declined, HelpResponse.expired):
            return _item(session, user, req)  # already withdrawn or timed out
        raise HelpError("not_claimant")
    policy = help_settings.current(session)
    old = _move(session, req, "withdraw", now, LiquidityRequest.claimed_by_user_id == user.id,
                claimed_by_user_id=None, claimed_at=None, claim_expires_at=None)
    if old is None:
        raise HelpError("invalid_transition")
    me.response, me.responded_at = HelpResponse.declined, now
    _after_reopen(session, req, now, policy, user.id, user.id, "withdraw", note)
    return _item(session, user, req)


# --- requester side ---------------------------------------------------------------------------

def confirm(session: Session, user: User, request_id: int, note: str | None = None,
            now: datetime | None = None) -> HelpRequestItem:
    """The requester agent or their distributor confirms the money arrived."""
    now = now or now_utc()
    req = _load(session, request_id)
    if not _is_owner_side(session, user, req, (UserRole.agent, UserRole.distributor)):
        raise HelpError("forbidden")
    if req.status == HelpStatus.fulfilled:
        return _item(session, user, req)
    policy = help_settings.current(session)
    old = _move(session, req, "confirm", now, fulfilled_at=now)
    if old is None:
        raise HelpError("invalid_transition")
    _audit(session, user.id, "confirm", req, old, now, policy, note)
    parties = help_notify.requester_users(session, req)
    if req.claimed_by_user_id:
        parties.add(req.claimed_by_user_id)
    help_notify.send(session, policy, req, parties, "fulfilled", user.id)
    return _item(session, user, req)


def cancel(session: Session, user: User, request_id: int, note: str | None = None,
           now: datetime | None = None) -> HelpRequestItem:
    """The requester agent or an admin calls it off."""
    now = now or now_utc()
    req = _load(session, request_id)
    if not _is_owner_side(session, user, req, (UserRole.agent, UserRole.admin)):
        raise HelpError("forbidden")
    if req.status == HelpStatus.cancelled:
        return _item(session, user, req)
    policy = help_settings.current(session)
    old = _move(session, req, "cancel", now)
    if old is None:
        raise HelpError("invalid_transition")
    _audit(session, user.id, "cancel", req, old, now, policy, note)
    told = help_notify.recipients_with(session, req, (
        HelpResponse.none, HelpResponse.superseded, HelpResponse.accepted))
    help_notify.send(session, policy, req, told | help_notify.requester_users(session, req),
                     "cancelled", user.id)
    return _item(session, user, req)


# --- timeouts (sweep; safe to run any number of times) ----------------------------------------

def _after_reopen(session: Session, req: LiquidityRequest, now: datetime, policy: HelpPolicy,
                  helper: uuid.UUID | None, actor: uuid.UUID | None, action: str,
                  note: str | None) -> None:
    """Superseded recipients are asked again; they and the requester hear it is open again."""
    back = _set_responses(session, req, [HelpResponse.superseded], HelpResponse.none, now)
    _audit(session, actor, action, req, HelpStatus.claimed, now, policy, note,
           previous_helper=str(helper) if helper else None)
    if _utc(req.needed_by) > now:  # past the deadline the sweep expires it straight away
        help_notify.send(session, policy, req, back | help_notify.requester_users(session, req),
                         "reopened", actor)


def _reopen_if_lapsed(session: Session, req: LiquidityRequest, now: datetime,
                      policy: HelpPolicy) -> bool:
    if req.status != HelpStatus.claimed or req.claim_expires_at is None:
        return False
    if _utc(req.claim_expires_at) > now:
        return False
    helper = req.claimed_by_user_id
    old = _move(session, req, "reopen", now, LiquidityRequest.claim_expires_at <= now,
                claimed_by_user_id=None, claimed_at=None, claim_expires_at=None)
    if old is None:
        return False
    if helper is not None:
        mine = _recipient(session, req, helper)
        if mine is not None:
            mine.response, mine.responded_at = HelpResponse.expired, now
        help_notify.send(session, policy, req, [helper], "claim_expired")
    _after_reopen(session, req, now, policy, helper, None, "reopen", "claim_timeout")
    return True


def _expire_if_due(session: Session, req: LiquidityRequest, now: datetime,
                   policy: HelpPolicy) -> bool:
    if req.status != HelpStatus.open or _utc(req.needed_by) > now:
        return False
    old = _move(session, req, "expire", now, LiquidityRequest.needed_by <= now)
    if old is None:
        return False
    waiting = _set_responses(session, req, [HelpResponse.none], HelpResponse.expired, now)
    _audit(session, None, "expire", req, old, now, policy)
    help_notify.send(session, policy, req, waiting | help_notify.requester_users(session, req),
                     "expired")
    return True


def sweep(session: Session, now: datetime | None = None) -> tuple[int, int]:
    """(reopened, expired). Lapsed claims reopen first, then open requests past needed_by
    expire. Runs even with the kill switch off so nothing stays stuck."""
    now = now or now_utc()
    policy = help_settings.current(session)
    lapsed = session.scalars(select(LiquidityRequest.id).where(
        LiquidityRequest.status == HelpStatus.claimed,
        LiquidityRequest.claim_expires_at <= now).order_by(LiquidityRequest.id)).all()
    reopened = sum(_reopen_if_lapsed(session, _load(session, i), now, policy) for i in lapsed)
    due = session.scalars(select(LiquidityRequest.id).where(
        LiquidityRequest.status == HelpStatus.open,
        LiquidityRequest.needed_by <= now).order_by(LiquidityRequest.id)).all()
    expired = sum(_expire_if_due(session, _load(session, i), now, policy) for i in due)
    return reopened, expired


def get(session: Session, user: User, request_id: int) -> HelpRequestItem:
    return _item(session, user, _load(session, request_id))
