"""Swap queue: scoped list, distributor decision, agent response. Every human action is audited.

Nothing here moves money: approving only records that the distributor agreed to the swap.
"""

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models import Agent, AuditLog, ModelVersion, SwapSuggestion, SystemMeta, User
from app.models.enums import SwapResponse, SwapStatus, UserRole
from app.schemas.swap import SwapItem, SwapPage, SwapParty
from app.services import rebalance
from app.services.forecast import _utc

Donor, Receiver = aliased(Agent), aliased(Agent)
ENTITY = "swap"
# Pending first (needs a decision), then best score.
_ORDER = (case((SwapSuggestion.status == SwapStatus.pending, 0), else_=1),
          SwapSuggestion.score.desc(), SwapSuggestion.id)


class SwapError(Exception):
    """forbidden (403), already_decided / swap_declined (409)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _scoped(user: User) -> Select[tuple[SwapSuggestion, Agent, Agent, str | None]]:
    query = (select(SwapSuggestion, Donor, Receiver, ModelVersion.version)
             .join(Donor, Donor.id == SwapSuggestion.donor_agent_id)
             .join(Receiver, Receiver.id == SwapSuggestion.receiver_agent_id)
             .outerjoin(ModelVersion, ModelVersion.id == SwapSuggestion.model_version_id))
    if user.role == UserRole.distributor:
        return query.where(Donor.distributor_id == user.distributor_id,
                           Receiver.distributor_id == user.distributor_id)
    if user.role == UserRole.agent:
        return query.where(or_(SwapSuggestion.donor_agent_id == user.agent_id,
                               SwapSuggestion.receiver_agent_id == user.agent_id))
    return query


def _party(agent: Agent, response: SwapResponse | None) -> SwapParty:
    return SwapParty(agent_id=agent.id, code=agent.code, name=agent.name, upazila=agent.upazila,
                     response=response)


def _item(s: SwapSuggestion, donor: Agent, receiver: Agent, version: str | None) -> SwapItem:
    return SwapItem(
        id=s.id, donor=_party(donor, s.donor_response),
        receiver=_party(receiver, s.receiver_response), float_type=s.float_type,
        amount_bdt=float(s.amount_bdt), distance_km=float(s.distance_km),
        van_trip_saved=s.van_trip_saved, score=float(s.score), status=s.status,
        decided_at=_utc(s.decided_at) if s.decided_at else None, note=s.note,
        model_version=version, generated_at=_utc(s.created_at),
    )


def is_ready(session: Session) -> bool:
    return session.get(SystemMeta, rebalance.CACHE_KEY) is not None


def swap_page(session: Session, user: User, status: SwapStatus | None, page: int,
              page_size: int) -> SwapPage:
    query = _scoped(user)
    if status is not None:
        query = query.where(SwapSuggestion.status == status)
    ids = query.with_only_columns(SwapSuggestion.id).subquery()
    total = session.scalar(select(func.count()).select_from(ids)) or 0
    vans = session.scalar(select(func.count()).select_from(SwapSuggestion).where(
        SwapSuggestion.id.in_(select(ids.c.id)), SwapSuggestion.van_trip_saved.is_(True),
        SwapSuggestion.status != SwapStatus.rejected)) or 0
    page_q = query.order_by(*_ORDER).offset((page - 1) * page_size).limit(page_size)
    rows = session.execute(page_q).tuples().all()
    return SwapPage(items=[_item(*r) for r in rows], total=total, page=page,
                    page_size=page_size, van_trips_avoided=vans)


def _load(session: Session, user: User, swap_id: int
          ) -> tuple[SwapSuggestion, Agent, Agent, str | None]:
    """Unknown and out-of-scope ids both raise forbidden, so ids cannot be probed."""
    # Row lock (Postgres) so two concurrent decisions cannot both pass the pending check.
    query = _scoped(user).where(SwapSuggestion.id == swap_id).with_for_update(of=SwapSuggestion)
    found = session.execute(query).tuples().first()
    if found is None:
        raise SwapError("forbidden")
    return found


def _audit(session: Session, user: User, action: str, s: SwapSuggestion, note: str | None,
           **extra: object) -> None:
    session.add(AuditLog(user_id=user.id, action=action, entity_type=ENTITY,
                         entity_id=str(s.id), note=note, payload={
                             "donor_agent_id": s.donor_agent_id,
                             "receiver_agent_id": s.receiver_agent_id,
                             "float_type": s.float_type.value,
                             "amount_bdt": float(s.amount_bdt), **extra}))


def decide(session: Session, user: User, swap_id: int, decision: Literal["approve", "reject"],
           note: str) -> SwapItem:
    s, donor, receiver, version = _load(session, user, swap_id)
    if s.status != SwapStatus.pending:
        raise SwapError("already_decided")
    declined = SwapResponse.declined in (s.donor_response, s.receiver_response)
    if decision == "approve" and declined:
        raise SwapError("swap_declined")
    s.status = SwapStatus.approved if decision == "approve" else SwapStatus.rejected
    s.decided_by, s.decided_at, s.note = user.id, datetime.now(UTC), note
    _audit(session, user, f"swap.{decision}", s, note, status=s.status.value)
    session.flush()
    return _item(s, donor, receiver, version)


def respond(session: Session, user: User, swap_id: int, response: Literal["accept", "decline"],
            note: str | None) -> SwapItem:
    s, donor, receiver, version = _load(session, user, swap_id)
    if s.status != SwapStatus.pending:
        raise SwapError("already_decided")
    answer = SwapResponse.accepted if response == "accept" else SwapResponse.declined
    side = "donor" if s.donor_agent_id == user.agent_id else "receiver"
    if side == "donor":
        s.donor_response = answer
    else:
        s.receiver_response = answer
    _audit(session, user, f"swap.{response}", s, note, side=side)
    session.flush()
    return _item(s, donor, receiver, version)
