"""Who hears about each help-request event. dry_run: nothing is sent, everything else happens.

Other recipients never learn who claimed a request; only the requester side sees the helper.
The actor of an event is never notified about their own action.
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent, LiquidityRequest, LiquidityRequestRecipient, User
from app.models.enums import HelpResponse, NotificationSeverity, UserRole
from app.rules.help_request_rules import HelpPolicy
from app.services import notify
from app.services.forecast import _utc
from app.services.notify import Param

Users = Iterable[uuid.UUID]


def requester_users(session: Session, req: LiquidityRequest) -> set[uuid.UUID]:
    return set(session.scalars(select(User.id).where(
        User.role == UserRole.agent, User.agent_id == req.requester_agent_id)))


def recipients_with(session: Session, req: LiquidityRequest,
                    responses: Iterable[HelpResponse]) -> set[uuid.UUID]:
    return set(session.scalars(select(LiquidityRequestRecipient.recipient_user_id).where(
        LiquidityRequestRecipient.request_id == req.id,
        LiquidityRequestRecipient.response.in_(set(responses)))))


def _params(session: Session, req: LiquidityRequest) -> dict[str, Param]:
    agent = session.get(Agent, req.requester_agent_id)
    return {"agent_code": agent.code if agent else None,
            "area": (agent.upazila or agent.district) if agent else None,
            "float_type": req.float_type.value, "amount_bdt": float(req.amount_needed),
            "needed_by": _utc(req.needed_by).isoformat()}


def send(session: Session, policy: HelpPolicy, req: LiquidityRequest, users: Users, key: str,
         actor: uuid.UUID | None = None,
         severity: NotificationSeverity = NotificationSeverity.info) -> int:
    if policy.dry_run:
        return 0
    targets = {u for u in users if u != actor}
    return notify.help_event(session, targets, key, severity, _params(session, req), req.id)
