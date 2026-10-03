"""Who hears about each help-request event. dry_run: nothing is sent, everything else happens.

Other recipients never learn who claimed a request; only the requester side sees the helper.
The actor of an event is never notified about their own action. No notification carries the
reason, a balance or a forecast number: only the request's own amount, float, area and deadline.
The deadline is human text in Asia/Dhaka time in the reader's language, never a raw timestamp,
and every notification carries the reader's deep link (params.link).
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.models import Agent, LiquidityRequest, LiquidityRequestRecipient, User
from app.models.enums import HelpResponse, Lang, NotificationSeverity, UserRole
from app.rules.help_request_rules import HelpPolicy
from app.services import notify
from app.services.help_time_text import deadline_text
from app.services.notify import Param

Users = Iterable[uuid.UUID]


def requester_users(session: Session, req: LiquidityRequest) -> set[uuid.UUID]:
    return set(session.scalars(select(User.id).where(
        User.role == UserRole.agent, User.agent_id == req.requester_agent_id)))


def distributor_users(session: Session, req: LiquidityRequest) -> set[uuid.UUID]:
    """Active users of the requester's distributor."""
    agent = session.get(Agent, req.requester_agent_id)
    return set(session.scalars(select(User.id).where(
        User.is_active.is_(True), User.role == UserRole.distributor,
        User.distributor_id == (agent.distributor_id if agent else None))))


def escalation_users(session: Session, req: LiquidityRequest) -> set[uuid.UUID]:
    """The requester's distributor users and every admin: told when a request goes unfilled."""
    admins = set(session.scalars(select(User.id).where(
        User.is_active.is_(True), User.role == UserRole.admin)))
    return admins | distributor_users(session, req)


def recipients_with(session: Session, req: LiquidityRequest,
                    responses: Iterable[HelpResponse]) -> set[uuid.UUID]:
    return set(session.scalars(select(LiquidityRequestRecipient.recipient_user_id).where(
        LiquidityRequestRecipient.request_id == req.id,
        LiquidityRequestRecipient.response.in_(set(responses)))))


def link_for(role: UserRole, request_id: int) -> str:
    """Where the notification opens for this reader."""
    if role == UserRole.distributor:
        return f"/distributor/help-requests/{request_id}"
    return "/agent/help" if role == UserRole.agent else "/admin/help-settings"


def _params(session: Session, req: LiquidityRequest) -> dict[str, Param]:
    agent = session.get(Agent, req.requester_agent_id)
    return {"agent_code": agent.code if agent else None,
            "area": (agent.upazila or agent.district) if agent else None,
            "float_type": req.float_type.value, "amount_bdt": float(req.amount_needed),
            "urgent": req.urgent}


def send(session: Session, policy: HelpPolicy, req: LiquidityRequest, users: Users, key: str,
         actor: uuid.UUID | None = None,
         severity: NotificationSeverity = NotificationSeverity.info) -> int:
    if policy.dry_run:
        return 0
    targets = {u for u in users if u != actor}
    now = clock.now()

    def per_reader(role: UserRole, lang: Lang) -> dict[str, Param]:
        return {"needed_by": deadline_text(req.needed_by, now, lang,
                                           req.deadline_after_stockout),
                "link": link_for(role, req.id)}

    return notify.help_event(session, targets, key, severity, _params(session, req), req.id,
                             per_reader)
