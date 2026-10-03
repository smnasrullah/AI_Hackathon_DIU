"""Runs the automatic trigger, and one tick (sweep, wave advance, trigger). The scheduler and the
admin job both call tick(). Each request is written in its own transaction, so a cooldown or a
lost race only affects that one agent. Dry run and the kill switch write nothing; the report
then lists the requests that WOULD have been made and who WOULD have been asked.
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

    @property
    def sent(self) -> bool:
        """False under dry run or the kill switch: nothing was created and nobody was told."""
        return self.enabled and not self.dry_run

    @property
    def would_create(self) -> list[help_trigger.AgentPlan]:
        """Dry run or kill switch: the requests a live run would have made, with their asks."""
        return [] if self.sent else [p for p in self.plans if p.would_create]


@dataclass
class TickReport:
    counts: dict[str, int]
    run: RunReport


def _create(item: help_trigger.AgentPlan, now: datetime, cap: int, force: bool) -> int | None:
    """The new request id, or None: the item's skipped reason is set instead. force: the
    admin's demo simulation, not held back by the cooldown or the daily cap."""
    if item.needed_by is None:
        return None
    try:
        with Session(get_engine()) as s, s.begin():
            req, created = help_requests.create(
                s, requester_agent_id=item.agent_id, float_type=item.float_type,
                amount_needed=Decimal(str(item.verdict.amount_bdt)), needed_by=item.needed_by,
                reason=item.reason, urgent=item.urgent, stockout_at=item.stockout_at,
                deadline_after_stockout=item.asap,
                agent_cap=cap,
                candidates=[Candidate(a.user_id, a.distance_km) for a in item.asks],
                created_by=HelpOrigin.system, now=now, simulated=item.simulated,
                bypass_limits=force and item.simulated)
            new_id = req.id
    except HelpError as exc:
        item.skipped = exc.code
        return None
    if not created:
        item.skipped = "active_request"
        return None
    return new_id


def run_trigger(now: datetime, agent_ids: set[int] | None = None,
                force: bool = False) -> RunReport:
    """force: the admin's "simulate shortage" run (DEMO_MODE); see help_trigger._plan_one."""
    with Session(get_engine()) as s:
        tp, hp = help_settings.trigger_current(s), help_settings.current(s)
        plans = help_trigger.plan(s, now, tp, hp, agent_ids, help_trigger.current_demo(s, now),
                                  force)
    report = RunReport(dry_run=hp.dry_run, enabled=hp.enabled, plans=plans, created=[])
    _defer_beyond_cap(plans, tp.max_new_per_tick)
    for item in plans:
        if not item.would_create:
            continue
        if not report.sent:
            log.info("help trigger (dry run, nothing sent): would request %s %s for agent %s, "
                     "asking %d", item.verdict.amount_bdt, item.float_type.value,
                     item.agent_code, len(item.asks))
            continue
        new_id = _create(item, now, help_trigger.wave_one_cap(item.urgent, tp, hp), force)
        if new_id is not None:
            report.created.append(new_id)
            log.info("help trigger: request %d for agent %s (%s)", new_id, item.agent_code,
                     item.float_type.value)
    return report


def _defer_beyond_cap(plans: list[help_trigger.AgentPlan], cap: int) -> None:
    """At most `cap` new requests per run, most urgent (earliest stock-out) first; the others
    are marked tick_cap and come back on a later tick (dedupe, cooldown and caps still apply)."""
    ready = sorted((p for p in plans if p.would_create),
                   key=lambda p: (p.verdict.stockout_h, -p.verdict.amount_bdt, p.agent_id))
    for p in ready[cap:]:
        p.skipped = "tick_cap"


def tick_report(now: datetime | None = None) -> TickReport:
    """Sweep timeouts, advance due waves, then run the trigger. Safe to repeat at any time.
    With the kill switch on only the sweep writes; the trigger still reports what it would do."""
    now = now or now_utc()
    with Session(get_engine()) as s, s.begin():
        reopened, expired = help_requests.sweep(s, now)
    counts = {"reopened": reopened, "expired": expired, "waves_advanced": 0,
              "waves_exhausted": 0, "requests_created": 0}
    counts["waves_advanced"], counts["waves_exhausted"] = help_waves.advance_due(now)
    run = run_trigger(now)
    counts["requests_created"] = len(run.created)
    return TickReport(counts, run)


def tick(now: datetime | None = None) -> dict[str, int]:
    return tick_report(now).counts
