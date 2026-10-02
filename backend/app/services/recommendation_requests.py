"""Recommendation requests: the agent asks, the distributor approves or declines, then fulfils.

State machine: requested -> approved | declined | cancelled; approved -> fulfilled. The
recommendation follows: requested while a request is live, done when fulfilled, open again
after a decline or cancel. Every human action is audited. Nothing here moves money.
"""

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models import Agent, AuditLog, Recommendation, RecommendationRequest, User
from app.models.enums import RecommendationStatus, RequestStatus, UserRole
from app.schemas.recommendation_request import RequestAgent, RequestItem, RequestPage
from app.services.forecast import _utc

ENTITY = "recommendation_request"
ACTIVE = (RequestStatus.requested, RequestStatus.approved, RequestStatus.fulfilled)
Action = Literal["approve", "decline", "fulfil", "cancel"]
# action -> (allowed from, new request status, new recommendation status)
TRANSITIONS: dict[Action, tuple[RequestStatus, RequestStatus, RecommendationStatus]] = {
    "approve": (RequestStatus.requested, RequestStatus.approved, RecommendationStatus.requested),
    "decline": (RequestStatus.requested, RequestStatus.declined, RecommendationStatus.open),
    "fulfil": (RequestStatus.approved, RequestStatus.fulfilled, RecommendationStatus.done),
    "cancel": (RequestStatus.requested, RequestStatus.cancelled, RecommendationStatus.open),
}
Row = tuple[RecommendationRequest, Recommendation, Agent]


class RequestError(Exception):
    """forbidden (403); invalid_transition / recommendation_closed (409)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _scoped(user: User) -> Select[Row]:
    query = (select(RecommendationRequest, Recommendation, Agent)
             .join(Recommendation, Recommendation.id == RecommendationRequest.recommendation_id)
             .join(Agent, Agent.id == Recommendation.agent_id))
    if user.role == UserRole.distributor:
        return query.where(Agent.distributor_id == user.distributor_id)
    if user.role == UserRole.agent:
        return query.where(Recommendation.agent_id == user.agent_id)
    return query


def _item(r: RecommendationRequest, rec: Recommendation, agent: Agent) -> RequestItem:
    return RequestItem(
        id=r.id, recommendation_id=rec.id,
        agent=RequestAgent(agent_id=agent.id, code=agent.code, name=agent.name),
        float_type=rec.float_type, channel=r.channel, amount_bdt=float(r.amount_bdt),
        deadline_at=_utc(rec.deadline_at), status=r.status, requested_by=r.requested_by,
        decided_by=r.decided_by, note=r.note, created_at=_utc(r.created_at),
        decided_at=_utc(r.decided_at) if r.decided_at else None)


def _audit(session: Session, user: User, action: str, r: RecommendationRequest,
           rec: Recommendation, note: str | None) -> None:
    session.add(AuditLog(user_id=user.id, action=f"{ENTITY}.{action}", entity_type=ENTITY,
                         entity_id=str(r.id), note=note, payload={
                             "recommendation_id": rec.id, "agent_id": rec.agent_id,
                             "channel": r.channel.value if r.channel else None,
                             "amount_bdt": float(r.amount_bdt), "status": r.status.value}))


def create(session: Session, user: User, recommendation_id: int) -> tuple[RequestItem, bool]:
    """(request, created). Idempotent: a live or fulfilled request is returned as is."""
    found = session.execute(
        select(Recommendation, Agent).join(Agent, Agent.id == Recommendation.agent_id)
        .where(Recommendation.id == recommendation_id)
        .with_for_update(of=Recommendation)).tuples().first()
    # Unknown and other agents' ids both raise forbidden, so ids cannot be probed.
    if found is None or found[0].agent_id != user.agent_id:
        raise RequestError("forbidden")
    rec, agent = found
    existing = session.scalar(select(RecommendationRequest).where(
        RecommendationRequest.recommendation_id == rec.id,
        RecommendationRequest.status.in_(ACTIVE)))
    if existing is not None:
        return _item(existing, rec, agent), False
    if rec.status != RecommendationStatus.open:
        raise RequestError("recommendation_closed")
    r = RecommendationRequest(recommendation_id=rec.id, requested_by=user.id,
                              channel=rec.channel, amount_bdt=rec.amount_bdt,
                              status=RequestStatus.requested)
    session.add(r)
    rec.status = RecommendationStatus.requested
    session.flush()
    session.refresh(r)
    _audit(session, user, "create", r, rec, None)
    return _item(r, rec, agent), True


def page(session: Session, user: User, status: RequestStatus | None, page_no: int,
         page_size: int) -> RequestPage:
    query = _scoped(user)
    if status is not None:
        query = query.where(RecommendationRequest.status == status)
    total = session.scalar(select(func.count()).select_from(
        query.with_only_columns(RecommendationRequest.id).subquery())) or 0
    rows = session.execute(query.order_by(RecommendationRequest.created_at.desc(),
                                          RecommendationRequest.id.desc())
                           .offset((page_no - 1) * page_size).limit(page_size)).tuples().all()
    return RequestPage(items=[_item(*r) for r in rows], total=total, page=page_no,
                       page_size=page_size)


def transition(session: Session, user: User, request_id: int, action: Action,
               note: str | None) -> RequestItem:
    # Row lock (Postgres) so two concurrent actions cannot both pass the state check.
    found = session.execute(_scoped(user).where(RecommendationRequest.id == request_id)
                            .with_for_update(of=RecommendationRequest)).tuples().first()
    if found is None:
        raise RequestError("forbidden")
    r, rec, agent = found
    allowed, new_status, rec_status = TRANSITIONS[action]
    if r.status != allowed:
        raise RequestError("invalid_transition")
    r.status, rec.status = new_status, rec_status
    if action != "fulfil":
        r.decided_by, r.decided_at, r.note = user.id, datetime.now(UTC), note
    _audit(session, user, action, r, rec, note)
    session.flush()
    return _item(r, rec, agent)
