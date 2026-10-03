"""Help request views. Owner (requester agent, their distributor, admin): full detail.
Recipient: amount, float, area and deadline, own answer only; never balances or who claimed it.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models import Agent, Distributor, LiquidityRequest, LiquidityRequestRecipient, User
from app.models.enums import HelpStatus, UserRole
from app.schemas.liquidity_request import (
    HelpRecipientOut,
    HelpRequester,
    HelpRequestItem,
    HelpRequestPage,
    HelpView,
)
from app.services.forecast import _utc

Recipient = LiquidityRequestRecipient
_ORDER = (LiquidityRequest.created_at.desc(), LiquidityRequest.id.desc())


def view_of(user: User, agent: Agent, mine: Recipient | None) -> HelpView | None:
    if user.role == UserRole.admin:
        return "owner"
    if user.role == UserRole.agent and user.agent_id == agent.id:
        return "owner"
    if user.role == UserRole.distributor and user.distributor_id == agent.distributor_id:
        return "owner"
    return "recipient" if mine is not None else None


def _displays(session: Session, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """user id -> agent or distributor code (never an e-mail address)."""
    if not user_ids:
        return {}
    rows = session.execute(
        select(User.id, Agent.code, Distributor.code)
        .outerjoin(Agent, Agent.id == User.agent_id)
        .outerjoin(Distributor, Distributor.id == User.distributor_id)
        .where(User.id.in_(user_ids))).tuples()
    return {uid: a or d or "admin" for uid, a, d in rows}


def _recipient_out(r: Recipient, displays: dict[uuid.UUID, str]) -> HelpRecipientOut:
    return HelpRecipientOut(
        user_id=r.recipient_user_id, display=displays.get(r.recipient_user_id, "-"),
        role=r.recipient_role, wave_number=r.wave_number, response=r.response,
        notified_at=_utc(r.notified_at) if r.notified_at else None,
        responded_at=_utc(r.responded_at) if r.responded_at else None,
        distance_km=float(r.distance_km) if r.distance_km is not None else None)


def items(session: Session, user: User, reqs: Sequence[LiquidityRequest]) -> list[HelpRequestItem]:
    """Items the caller may see, in input order; requests outside the caller's reach are dropped."""
    if not reqs:
        return []
    ids = [r.id for r in reqs]
    agents = {a.id: a for a in session.scalars(select(Agent).where(
        Agent.id.in_({r.requester_agent_id for r in reqs})))}
    mine = {r.request_id: r for r in session.scalars(select(Recipient).where(
        Recipient.request_id.in_(ids), Recipient.recipient_user_id == user.id))}
    views = {r.id: view_of(user, agents[r.requester_agent_id], mine.get(r.id)) for r in reqs}
    owned = [i for i, v in views.items() if v == "owner"]
    everyone: dict[int, list[Recipient]] = {}
    if owned:
        for row in session.scalars(select(Recipient).where(Recipient.request_id.in_(owned))
                                   .order_by(Recipient.id)):
            everyone.setdefault(row.request_id, []).append(row)
    displays = _displays(session, {row.recipient_user_id for rows in everyone.values()
                                   for row in rows})
    out = []
    for req in reqs:
        view = views[req.id]
        if view is None:
            continue
        out.append(_item(req, agents[req.requester_agent_id], view, mine.get(req.id), user,
                         everyone.get(req.id, []), displays))
    return out


def _item(req: LiquidityRequest, agent: Agent, view: HelpView, me: Recipient | None, user: User,
          recipients: list[Recipient], displays: dict[uuid.UUID, str]) -> HelpRequestItem:
    item = HelpRequestItem(
        id=req.id, view=view,
        requester=HelpRequester(agent_id=agent.id, code=agent.code, name=agent.name,
                                upazila=agent.upazila, district=agent.district),
        float_type=req.float_type, amount_needed=float(req.amount_needed),
        needed_by=_utc(req.needed_by), status=req.status, wave_number=req.wave_number,
        created_by=req.created_by, created_at=_utc(req.created_at),
        updated_at=_utc(req.updated_at),
        claimed_at=_utc(req.claimed_at) if req.claimed_at else None,
        claim_expires_at=_utc(req.claim_expires_at) if req.claim_expires_at else None,
        fulfilled_at=_utc(req.fulfilled_at) if req.fulfilled_at else None,
        my_response=me.response if me else None,
        claimed_by_me=req.claimed_by_user_id == user.id,
        my_distance_km=float(me.distance_km) if me and me.distance_km is not None else None,
        simulated=req.simulated)
    if view == "owner":
        outs = [_recipient_out(r, displays) for r in recipients]
        item.reason_summary = req.reason_summary
        item.recipients = outs
        item.claimed_by = next((o for o in outs if o.user_id == req.claimed_by_user_id), None)
    return item


def one(session: Session, user: User, req: LiquidityRequest) -> HelpRequestItem | None:
    found = items(session, user, [req])
    return found[0] if found else None


def _page(session: Session, user: User, query: Select[tuple[LiquidityRequest]],
          status: HelpStatus | None, page_no: int, page_size: int) -> HelpRequestPage:
    if status is not None:
        query = query.where(LiquidityRequest.status == status)
    total = session.scalar(select(func.count()).select_from(
        query.with_only_columns(LiquidityRequest.id).subquery())) or 0
    rows = session.scalars(query.order_by(*_ORDER).offset((page_no - 1) * page_size)
                           .limit(page_size)).all()
    return HelpRequestPage(items=items(session, user, rows), total=total, page=page_no,
                           page_size=page_size)


def as_requester(session: Session, user: User, status: HelpStatus | None, page_no: int,
                 page_size: int) -> HelpRequestPage:
    """Agent: own requests. Distributor: requests from own agents."""
    query = select(LiquidityRequest).join(Agent, Agent.id == LiquidityRequest.requester_agent_id)
    if user.role == UserRole.agent:
        query = query.where(LiquidityRequest.requester_agent_id == user.agent_id)
    else:
        query = query.where(Agent.distributor_id == user.distributor_id)
    return _page(session, user, query, status, page_no, page_size)


def addressed_to(session: Session, user: User, status: HelpStatus | None, page_no: int,
                 page_size: int) -> HelpRequestPage:
    query = select(LiquidityRequest).join(
        Recipient, Recipient.request_id == LiquidityRequest.id).where(
        Recipient.recipient_user_id == user.id)
    return _page(session, user, query, status, page_no, page_size)


def all_requests(session: Session, user: User, status: HelpStatus | None, page_no: int,
                 page_size: int) -> HelpRequestPage:
    return _page(session, user, select(LiquidityRequest), status, page_no, page_size)
