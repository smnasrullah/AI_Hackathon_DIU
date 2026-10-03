"""Help request timeouts and escalation; safe to run any number of times, from any worker.

Lapsed claims reopen (the helper is remembered as lapsed_claimant_user_id so a late delivery
can still be confirmed), open requests past needed_by expire, and a request whose waves all
failed is exhausted and escalated.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import as_utc
from app.models import LiquidityRequest
from app.models.enums import HelpResponse, HelpStatus, NotificationSeverity
from app.rules.help_request_rules import HelpPolicy
from app.services import help_notify, help_settings
from app.services.help_core import audit, load, move, now_utc, recipient, set_responses


def exhaust(session: Session, request_id: int, now: datetime | None = None) -> bool:
    """Every wave failed: open -> expired (unfilled). The distributor and admins are told.
    False when the request was no longer open (someone claimed it or it already ended)."""
    now = now or now_utc()
    req = load(session, request_id)
    policy = help_settings.current(session)
    old = move(session, req, "exhaust", now, expired_at=now)
    if old is None:
        return False
    waiting = set_responses(session, req, [HelpResponse.none], HelpResponse.expired, now)
    audit(session, None, "exhaust", req, old, now, policy, "waves_exhausted",
          waves=req.wave_number)
    help_notify.send(session, policy, req, waiting | help_notify.requester_users(session, req),
                     "expired")
    help_notify.send(session, policy, req, help_notify.escalation_users(session, req),
                     "escalated", None, NotificationSeverity.critical)
    return True


def after_reopen(session: Session, req: LiquidityRequest, now: datetime, policy: HelpPolicy,
                 helper: uuid.UUID | None, actor: uuid.UUID | None, action: str,
                 note: str | None) -> None:
    """Superseded recipients are asked again; they and the requester hear it is open again."""
    back = set_responses(session, req, [HelpResponse.superseded], HelpResponse.none, now)
    audit(session, actor, action, req, HelpStatus.claimed, now, policy, note,
          previous_helper=str(helper) if helper else None)
    if as_utc(req.needed_by) > now:  # past the deadline the sweep expires it straight away
        help_notify.send(session, policy, req, back | help_notify.requester_users(session, req),
                         "reopened", actor)


def reopen_if_lapsed(session: Session, req: LiquidityRequest, now: datetime,
                     policy: HelpPolicy) -> bool:
    if req.status != HelpStatus.claimed or req.claim_expires_at is None:
        return False
    if as_utc(req.claim_expires_at) > now:
        return False
    helper = req.claimed_by_user_id
    old = move(session, req, "reopen", now, LiquidityRequest.claim_expires_at <= now,
               claimed_by_user_id=None, claimed_at=None, claim_expires_at=None,
               lapsed_claimant_user_id=helper)
    if old is None:
        return False
    if helper is not None:
        mine = recipient(session, req, helper)
        if mine is not None:
            mine.response, mine.responded_at = HelpResponse.expired, now
        help_notify.send(session, policy, req, [helper], "claim_expired")
    after_reopen(session, req, now, policy, helper, None, "reopen", "claim_timeout")
    return True


def _expire_if_due(session: Session, req: LiquidityRequest, now: datetime,
                   policy: HelpPolicy) -> bool:
    if req.status != HelpStatus.open or as_utc(req.needed_by) > now:
        return False
    old = move(session, req, "expire", now, LiquidityRequest.needed_by <= now, expired_at=now)
    if old is None:
        return False
    waiting = set_responses(session, req, [HelpResponse.none], HelpResponse.expired, now)
    audit(session, None, "expire", req, old, now, policy)
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
    reopened = sum(reopen_if_lapsed(session, load(session, i), now, policy) for i in lapsed)
    due = session.scalars(select(LiquidityRequest.id).where(
        LiquidityRequest.status == HelpStatus.open,
        LiquidityRequest.needed_by <= now).order_by(LiquidityRequest.id)).all()
    expired = sum(_expire_if_due(session, load(session, i), now, policy) for i in due)
    return reopened, expired
