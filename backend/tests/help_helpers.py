"""Shared setup for liquidity help request tests: AGT-0001 (Mirpur) asks three helpers."""

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import AuditLog, LiquidityRequest, LiquidityRequestRecipient, Notification, User
from app.models.enums import FloatType, HelpOrigin, HelpResponse, Lang
from app.services.help_reason import HelpReason
from app.services.liquidity_requests import Candidate, create, now_utc
from tests.auth_helpers import ADMIN, agent_id, bearer

API = "/api/v1/liquidity-requests"
ADMIN_API = "/api/v1/admin/liquidity-requests"
AGENT_SUNAMGANJ = "agent.sunamganj@agentpulse.demo"  # AGT-0003, DST-SYL
DIST_CTG = "dist.chattogram@agentpulse.demo"  # DST-CTG: not AGT-0001's distributor
DIST_SYL = "dist.sylhet@agentpulse.demo"
REASON = "Cash is forecast to run out in about 3 hours (salary day)."


def user_id(email: str) -> uuid.UUID:
    with Session(get_engine()) as session:
        found = session.scalar(select(User.id).where(User.email == email))
        assert found is not None
        return found


def make_request(helpers: list[str], float_type: FloatType = FloatType.cash,
                 amount: str = "25000", hours: float = 3.0,
                 reason: HelpReason | None = None) -> tuple[int, bool]:
    """Create a system request for AGT-0001 asking `helpers` (in order). (id, created).
    Without `reason` the request carries the free-text REASON, like pre-0018 requests."""
    with Session(get_engine()) as session, session.begin():
        req, created = create(
            session, requester_agent_id=agent_id("AGT-0001"), float_type=float_type,
            amount_needed=Decimal(amount), needed_by=now_utc() + timedelta(hours=hours),
            reason_summary=None if reason else REASON, reason=reason,
            candidates=[Candidate(user_id(h), 1.5 + i) for i, h in enumerate(helpers)],
            created_by=HelpOrigin.system)
        return req.id, created


def set_policy(client: TestClient, **changes: object) -> dict[str, Any]:
    res = client.put(f"{ADMIN_API}/settings", json=changes, headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def act(client: TestClient, req_id: int, action: str, email: str,
        body: dict[str, str] | None = None) -> Any:
    return client.post(f"{API}/{req_id}/{action}", json=body, headers=bearer(client, email))


def notes(req_id: int) -> dict[str, list[str]]:
    """email -> help notification keys (oldest first) about this request."""
    with Session(get_engine()) as session:
        rows = session.execute(
            select(User.email, Notification.title_key).join(User, User.id == Notification.user_id)
            .where(Notification.entity_type == "liquidity_request",
                   Notification.entity_id == str(req_id)).order_by(Notification.id)).tuples()
        out: dict[str, list[str]] = {}
        for email, key in rows:
            out.setdefault(email, []).append(key.removeprefix("notifications.help."))
        return out


def responses(req_id: int) -> dict[str, HelpResponse]:
    with Session(get_engine()) as session:
        rows = session.execute(
            select(User.email, LiquidityRequestRecipient.response)
            .join(User, User.id == LiquidityRequestRecipient.recipient_user_id)
            .where(LiquidityRequestRecipient.request_id == req_id)).tuples().all()
        return {email: response for email, response in rows}


def audits(req_id: int) -> list[AuditLog]:
    with Session(get_engine()) as session:
        return list(session.scalars(select(AuditLog).where(
            AuditLog.entity_type == "liquidity_request", AuditLog.entity_id == str(req_id))
            .order_by(AuditLog.id)))


def request_row(req_id: int) -> LiquidityRequest:
    with Session(get_engine()) as session:
        row = session.get(LiquidityRequest, req_id)
        assert row is not None
        session.expunge(row)
        return row


TRIGGER_API = "/api/v1/admin/liquidity-requests/trigger-settings"


def set_trigger(client: TestClient, **changes: object) -> dict[str, Any]:
    res = client.put(TRIGGER_API, json=changes, headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def set_lang(email: str, lang: Lang) -> None:
    with Session(get_engine()) as session, session.begin():
        user = session.scalar(select(User).where(User.email == email))
        assert user is not None
        user.lang = lang


def help_params(req_id: int, email: str) -> list[dict[str, Any]]:
    """The params of every help notification `email` got about this request (oldest first)."""
    with Session(get_engine()) as session:
        rows = session.scalars(
            select(Notification.params).join(User, User.id == Notification.user_id)
            .where(User.email == email, Notification.entity_type == "liquidity_request",
                   Notification.entity_id == str(req_id)).order_by(Notification.id))
        return [dict(p) for p in rows]
