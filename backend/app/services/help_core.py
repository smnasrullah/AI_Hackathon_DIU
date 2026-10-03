"""Shared pieces of the help request service: errors, loading, the atomic move, audit, views.

Every status change is a conditional UPDATE (WHERE status IN <allowed from>), so two people
acting at once cannot both win: the loser's UPDATE matches no row and gets a 409. Transitions:
app/rules/help_request_rules.py. Times come from app/core/clock.py (one wall-clock base).
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, select, update
from sqlalchemy.orm import Session

from app.core import clock
from app.models import Agent, AuditLog, LiquidityRequest, LiquidityRequestRecipient, User
from app.models.enums import FloatType, HelpResponse, HelpStatus, UserRole
from app.rules import help_request_rules as rules
from app.rules.help_request_rules import Event, HelpPolicy
from app.schemas.liquidity_request import HelpRequestItem
from app.services import liquidity_read

ENTITY = "liquidity_request"
Recipient = LiquidityRequestRecipient
HELPER_ROLES = (UserRole.agent, UserRole.distributor)


class HelpError(Exception):
    """forbidden (403); everything else 409: invalid_transition, already_taken,
    already_responded, not_claimant, feature_disabled, cooldown, daily_cap, no_recipients,
    deadline_passed, no_lapsed_claim, late_window_passed."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Candidate:
    """A helper to ask; ranking them is the trigger job's work, not this module's."""

    user_id: uuid.UUID
    distance_km: float | None = None


def now_utc() -> datetime:
    return clock.now()


def dedupe_key(agent_id: int, float_type: FloatType) -> str:
    return f"{agent_id}:{float_type.value}"


def active_for(session: Session, key: str) -> LiquidityRequest | None:
    return session.scalar(select(LiquidityRequest).where(
        LiquidityRequest.dedupe_key == key, LiquidityRequest.status.in_(rules.ACTIVE)))


def load(session: Session, request_id: int) -> LiquidityRequest:
    req = session.get(LiquidityRequest, request_id, populate_existing=True)
    if req is None:
        raise HelpError("forbidden")
    return req


def recipient(session: Session, req: LiquidityRequest, user_id: uuid.UUID) -> Recipient | None:
    return session.scalar(select(Recipient).where(Recipient.request_id == req.id,
                                                  Recipient.recipient_user_id == user_id))


def move(session: Session, req: LiquidityRequest, event: Event, now: datetime,
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


def audit(session: Session, actor: uuid.UUID | None, action: str, req: LiquidityRequest,
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


def set_responses(session: Session, req: LiquidityRequest, frm: Sequence[HelpResponse],
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


def item(session: Session, user: User, req: LiquidityRequest) -> HelpRequestItem:
    found = liquidity_read.one(session, user, req)
    if found is None:
        raise HelpError("forbidden")
    return found


def is_owner_side(session: Session, user: User, req: LiquidityRequest,
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
