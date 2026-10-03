"""Runs the automatic trigger, and one tick (sweep, wave advance, trigger). The scheduler and the
admin job both call tick(). Each request is written in its own transaction, so a cooldown or a
lost race only affects that one agent. Dry run and the kill switch write nothing.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models.enums import HelpOrigin
from app.services import help_settings, help_trigger, help_waves
from app.services import liquidity_requests as help_requests
from app.services.liquidity_requests import Candidate, HelpError, now_utc

log = logging.getLogger(__name__)


@dataclass
class RunReport:
    dry_run: bool
    enabled: bool
    plans: list[help_trigger.AgentPlan]
    created: list[int]


def _create(item: help_trigger.AgentPlan, now: datetime) -> int | None:
    """The new request id, or None: the item's skipped reason is set instead."""
    if item.needed_by is None:
        return None
    try:
        with Session(get_engine()) as s, s.begin():
            req, created = help_requests.create(
                s, requester_agent_id=item.agent_id, float_type=item.float_type,
                amount_needed=Decimal(str(item.verdict.amount_bdt)), needed_by=item.needed_by,
                reason_summary=item.reason_summary,
                candidates=[Candidate(a.user_id, a.distance_km) for a in item.asks],
                created_by=HelpOrigin.system, now=now, simulated=item.simulated)
            new_id = req.id
    except HelpError as exc:
        item.skipped = exc.code
        return None
    if not created:
        item.skipped = "active_request"
        return None
    return new_id


def run_trigger(now: datetime, agent_ids: set[int] | None = None) -> RunReport:
    with Session(get_engine()) as s:
        tp, hp = help_settings.trigger_current(s), help_settings.current(s)
        plans = help_trigger.plan(s, now, tp, hp, agent_ids, help_trigger.current_demo(s, now))
    report = RunReport(dry_run=hp.dry_run, enabled=hp.enabled, plans=plans, created=[])
    for item in plans:
        if not item.would_create:
            continue
        if not hp.enabled or hp.dry_run:
            log.info("help trigger (dry run, nothing sent): would request %s %s for agent %s",
                     item.verdict.amount_bdt, item.float_type.value, item.agent_code)
            continue
        new_id = _create(item, now)
        if new_id is not None:
            report.created.append(new_id)
            log.info("help trigger: request %d for agent %s (%s)", new_id, item.agent_code,
                     item.float_type.value)
    return report


def tick(now: datetime | None = None) -> dict[str, int]:
    """Sweep timeouts, advance due waves, then run the trigger. Safe to repeat at any time."""
    now = now or now_utc()
    with Session(get_engine()) as s, s.begin():
        reopened, expired = help_requests.sweep(s, now)
    with Session(get_engine()) as s:
        enabled = help_settings.current(s).enabled
    counts = {"reopened": reopened, "expired": expired, "waves_advanced": 0,
              "waves_exhausted": 0, "requests_created": 0}
    if not enabled:
        return counts
    counts["waves_advanced"], counts["waves_exhausted"] = help_waves.advance_due(now)
    counts["requests_created"] = len(run_trigger(now).created)
    return counts
