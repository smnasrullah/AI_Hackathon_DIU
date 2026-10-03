"""Liquidity help requests: one agent short of float, several helpers asked, exactly one wins.

This module creates requests and is the public entry point; the parts live in
help_core.py (atomic move, audit, views), help_actions.py (claim, decline, withdraw, confirm,
confirm_late, cancel) and help_timeouts.py (sweep, reopen, expire, exhaust).
Nothing here moves money: it records who offered help and tells the right people.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import as_utc
from app.core.config import get_settings
from app.core.db import savepoint
from app.models import LiquidityRequest, User
from app.models.enums import (
    FloatType,
    HelpOrigin,
    HelpReasonCategory,
    HelpResponse,
    HelpStatus,
    UserRole,
)
from app.models.enums import NotificationSeverity as Severity
from app.rules import help_request_rules as rules
from app.schemas.liquidity_request import HelpRequestItem
from app.services import help_demo, help_notify, help_settings
from app.services.help_actions import cancel, claim, confirm, confirm_late, decline, withdraw
from app.services.help_core import (
    HELPER_ROLES,
    Candidate,
    HelpError,
    Recipient,
    active_for,
    audit,
    dedupe_key,
    item,
    load,
    now_utc,
)
from app.services.help_core import move as _move
from app.services.help_reason import HelpReason
from app.services.help_timeouts import exhaust, sweep

__all__ = ["Candidate", "HelpError", "HelpReason", "active_for", "cancel", "claim", "confirm",
           "confirm_late", "create", "decline", "dedupe_key", "exhaust", "get", "now_utc",
           "sweep", "withdraw", "_move"]


def create(session: Session, *, requester_agent_id: int, float_type: FloatType,
           amount_needed: Decimal, needed_by: datetime, reason_summary: str | None = None,
           candidates: Sequence[Candidate], created_by: HelpOrigin,
           actor: uuid.UUID | None = None, now: datetime | None = None,
           simulated: bool = False, reason: HelpReason | None = None, urgent: bool = False,
           stockout_at: datetime | None = None, deadline_after_stockout: bool = False,
           agent_cap: int | None = None,
           bypass_limits: bool = False) -> tuple[LiquidityRequest, bool]:
    """(request, created). An active request for the same agent and float is returned as is.

    A lost dedupe race (another writer inserted the active request between our check and our
    insert) rolls back only a savepoint, so it is safe inside a caller's larger transaction.
    agent_cap: agents in wave 1 (default: the policy's wave size; larger for urgent requests).
    bypass_limits: the admin's demo simulation (honoured only for a simulated request in
    DEMO_MODE) skips the cooldown and the daily cap; never the dedupe or the kill switch.
    """
    now = now or now_utc()
    policy = help_settings.current(session)
    if not policy.enabled:
        raise HelpError("feature_disabled")
    key = dedupe_key(requester_agent_id, float_type)
    existing = active_for(session, key)
    if existing is not None:
        return existing, False
    if as_utc(needed_by) <= now:
        raise HelpError("deadline_passed")
    earlier = session.scalars(select(LiquidityRequest.created_at).where(
        LiquidityRequest.requester_agent_id == requester_agent_id,
        LiquidityRequest.created_at > help_demo.window_start(session, requester_agent_id, now)))
    block = rules.abuse_block((as_utc(t) for t in earlier), now, policy)
    if block and not (bypass_limits and simulated and get_settings().demo_mode):
        raise HelpError(block)
    cap = policy.max_recipients_per_wave if agent_cap is None else agent_cap
    helpers = _wave_members(_eligible(session, requester_agent_id, candidates), cap)
    if not helpers:
        raise HelpError("no_recipients")
    why = reason
    req = LiquidityRequest(requester_agent_id=requester_agent_id, float_type=float_type,
                           amount_needed=amount_needed, needed_by=needed_by,
                           reason_summary=reason_summary, status=HelpStatus.open,
                           reason_code=why.code if why else None,
                           reason_params=why.params if why else None,
                           reason_category=why.category if why else HelpReasonCategory.unknown,
                           urgent=urgent, stockout_at=stockout_at,
                           deadline_after_stockout=deadline_after_stockout,
                           wave_number=1, wave_started_at=now, simulated=simulated,
                           created_by=created_by, dedupe_key=key, created_at=now, updated_at=now)
    try:
        with savepoint(session):
            session.add(req)
            session.flush()
    except IntegrityError:
        existing = active_for(session, key)  # another writer created the active request first
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
    audit(session, actor, "create", req, None, now, policy, recipients=len(helpers),
          created_by=created_by.value, urgent=urgent, simulated=simulated)
    help_notify.send(session, policy, req, (u.id for u, _ in helpers), "new", actor,
                     Severity.critical if urgent else Severity.warning)
    help_notify.send(session, policy, req, help_notify.requester_users(session, req), "created",
                     actor)
    return req, True


def _wave_members(helpers: list[tuple[User, Candidate]], agent_cap: int
                  ) -> list[tuple[User, Candidate]]:
    """Every distributor user is always asked; agents fill up to `agent_cap` in ranked order."""
    distributors = [h for h in helpers if h[0].role == UserRole.distributor]
    agents = [h for h in helpers if h[0].role != UserRole.distributor]
    return distributors + agents[:agent_cap]


def _eligible(session: Session, requester_agent_id: int,
              candidates: Sequence[Candidate]) -> list[tuple[User, Candidate]]:
    """Active agent/distributor users, first mention wins, never the requester's own users."""
    ids = list(dict.fromkeys(c.user_id for c in candidates))
    users = {u.id: u for u in session.scalars(select(User).where(
        User.id.in_(ids), User.is_active.is_(True), User.role.in_(HELPER_ROLES)))}
    first = {c.user_id: c for c in reversed(candidates)}
    return [(users[i], first[i]) for i in ids
            if i in users and users[i].agent_id != requester_agent_id]


def get(session: Session, user: User, request_id: int) -> HelpRequestItem:
    return item(session, user, load(session, request_id))
