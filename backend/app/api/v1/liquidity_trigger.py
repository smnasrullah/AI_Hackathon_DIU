"""Automatic liquidity help: agent opt-out, admin settings, dry-run preview, manual run, demo
shortage helper.

Nothing here moves money. The dry run and the settings never send; under dry run or the kill
switch the manual run and the demo helper report what WOULD have been sent (sent: false). The
demo helper runs only when DEMO_MODE is on and is audit logged; every result it makes is marked
simulated.
"""

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.core.deps import SessionDep, require_roles
from app.models import Agent, SystemMeta, User
from app.models.enums import Lang, UserRole
from app.schemas.help_trigger import (
    DemoHelpInfo,
    DemoOverride,
    DemoResetOut,
    DryRunIn,
    DryRunOut,
    OptOutIn,
    OptOutOut,
    PlanAskOut,
    PlanItemOut,
    SimulateIn,
    SimulateOut,
    TriggerRunOut,
    TriggerSettingsIn,
    TriggerSettingsOut,
)
from app.services import help_demo, help_reason, help_settings, help_trigger_run
from app.services import help_trigger as trig
from app.services.liquidity_requests import now_utc

router = APIRouter(prefix="/liquidity-requests", tags=["liquidity-requests"])
admin_router = APIRouter(prefix="/admin/liquidity-requests", tags=["liquidity-requests"])

AgentUser = Annotated[User, Depends(require_roles(UserRole.agent))]
Admin = Annotated[User, Depends(require_roles(UserRole.admin))]


def _item_out(item: trig.AgentPlan, lang: Lang) -> PlanItemOut:
    v, why = item.verdict, item.reason
    return PlanItemOut(
        agent_id=item.agent_id, agent_code=item.agent_code, float_type=item.float_type,
        fires=v.fires, reason=v.reason, projected_low_bdt=v.projected_low_bdt,
        buffer_bdt=v.buffer_bdt, amount_bdt=v.amount_bdt, needed_by=item.needed_by,
        stockout_at=item.stockout_at, urgent=item.urgent, deadline_asap=item.asap,
        skipped=item.skipped, simulated=item.simulated,
        reason_summary=help_reason.render(why.code, why.params, lang) if why else None,
        reason_category=why.category if why else None,
        asks=[PlanAskOut(display=a.display, role=a.role, distance_km=a.distance_km,
                         wave=1) for a in item.asks])


# --- agent: may I be asked for help? ------------------------------------------------------------

def _own_agent(session: SessionDep, user: User) -> Agent:
    agent = session.get(Agent, user.agent_id) if user.agent_id is not None else None
    if agent is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
    return agent


@router.get("/opt-out", response_model=OptOutOut)
def read_opt_out(user: AgentUser, session: SessionDep) -> OptOutOut:
    """The caller's own choice. opted_out: true = never asked to help others."""
    return OptOutOut(opted_out=_own_agent(session, user).help_opt_out)


def _write_opt_out(body: OptOutIn, user: User, session: SessionDep) -> OptOutOut:
    try:
        value = trig.set_opt_out(session, user, body.opted_out)
    except trig.TriggerError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=exc.code) from exc
    session.commit()
    return OptOutOut(opted_out=value)


@router.put("/opt-out", response_model=OptOutOut)
def write_opt_out(body: OptOutIn, user: AgentUser, session: SessionDep) -> OptOutOut:
    """Change the caller's own choice (only their own agent; audited). Opted-out agents are
    never ranked as helpers."""
    return _write_opt_out(body, user, session)


@router.post("/opt-out", response_model=OptOutOut, deprecated=True)
def opt_out(body: OptOutIn, user: AgentUser, session: SessionDep) -> OptOutOut:
    """Same as PUT /opt-out (kept for older clients)."""
    return _write_opt_out(body, user, session)


# --- admin ------------------------------------------------------------------------------------

@admin_router.get("/trigger-settings", response_model=TriggerSettingsOut)
def read_trigger_settings(_user: Admin, session: SessionDep) -> TriggerSettingsOut:
    """Horizon, buffer, minimum shortfall, cap, lead margin, radius, waves, timeout, deadline
    floor, urgent wave multiplier."""
    return TriggerSettingsOut(**asdict(help_settings.trigger_current(session)))


@admin_router.put("/trigger-settings", response_model=TriggerSettingsOut)
def write_trigger_settings(body: TriggerSettingsIn, user: Admin,
                           session: SessionDep) -> TriggerSettingsOut:
    """Change any subset (audit_log keeps old and new values). Bounds checked by the schema."""
    try:
        policy = help_settings.update_trigger(session, user,
                                              body.model_dump(exclude_none=True))
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    session.commit()
    return TriggerSettingsOut(**asdict(policy))


@admin_router.post("/dry-run", response_model=DryRunOut)
def dry_run(body: DryRunIn, user: Admin, session: SessionDep) -> DryRunOut:
    """Shows which agents WOULD get a request and who WOULD be asked. Writes nothing, sends
    nothing, whatever the kill switch and dry-run settings say."""
    now = now_utc()
    tp, hp = help_settings.trigger_current(session), help_settings.current(session)
    ids = set(body.agent_ids) if body.agent_ids is not None else None
    plans = trig.plan(session, now, tp, hp, ids, trig.current_demo(session, now))
    items = [_item_out(p, user.lang) for p in plans]
    would = [p for p in plans if p.would_create]
    return DryRunOut(evaluated_at=now, enabled=hp.enabled, dry_run=hp.dry_run, items=items,
                     would_create=len(would),
                     would_ask=sum(len(p.asks) for p in would))


@admin_router.post("/run-trigger", response_model=TriggerRunOut)
def run_trigger(user: Admin) -> TriggerRunOut:
    """One tick now, the same as the background scheduler: sweep timeouts, advance waves, run
    the trigger. Under dry run or the kill switch nothing is created or sent and the response
    lists what WOULD have been."""
    now = now_utc()
    report = help_trigger_run.tick_report(now)
    run, c = report.run, report.counts
    return TriggerRunOut(
        evaluated_at=now, dry_run=run.dry_run, enabled=run.enabled, sent=run.sent,
        created_request_ids=run.created,
        would_create=[_item_out(p, user.lang) for p in run.would_create],
        reopened=c["reopened"], expired=c["expired"], waves_advanced=c["waves_advanced"],
        waves_exhausted=c["waves_exhausted"])


@admin_router.post("/simulate-shortage", response_model=SimulateOut)
def simulate_shortage(body: SimulateIn, user: Admin, session: SessionDep) -> SimulateOut:
    """DEMO_MODE only. Forces one agent into a shortage for 30 minutes and runs the trigger
    for that agent now. Audit logged; every request it makes is marked simulated. Under dry
    run or the kill switch nothing is sent and would_create says what would have been."""
    if not get_settings().demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="demo_mode_off")
    now = now_utc()
    try:
        until = trig.simulate_shortage(session, user, body.agent_id, body.float_type, now)
    except trig.TriggerError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=exc.code) from exc
    session.commit()
    report = help_trigger_run.run_trigger(now, {body.agent_id}, force=True)
    mine = [p for p in report.plans if p.float_type == body.float_type]
    plan = mine[0] if mine else None
    if plan is None:  # no forecast covers this agent yet: the demo cannot act on it
        raise HTTPException(status.HTTP_409_CONFLICT, detail="no_forecast")
    blocked = None  # a clear reason when this float got no request (or would get none)
    if not report.enabled:
        blocked = "feature_disabled"
    elif not plan.would_create:
        blocked = plan.skipped or plan.verdict.reason
    return SimulateOut(agent_id=body.agent_id, agent_code=plan.agent_code,
                       float_type=body.float_type, until=until,
                       created_request_ids=report.created, plan=_item_out(plan, user.lang),
                       dry_run=report.dry_run, enabled=report.enabled, sent=report.sent,
                       would_create=[_item_out(p, user.lang) for p in report.would_create],
                       blocked_reason=blocked)


@admin_router.get("/demo", response_model=DemoHelpInfo)
def demo_info(_user: Admin, session: SessionDep) -> DemoHelpInfo:
    """What DEMO_MODE changes for help requests: demo defaults in force, the automatic-request
    cap, the fresh-bootstrap start delay and the last demo reset. Read-only."""
    s = get_settings()
    on = help_settings.demo_defaults_on()
    stored: dict[str, object] = {}
    for key in (help_settings.KEY, help_settings.TRIGGER_KEY):
        row = session.get(SystemMeta, key)
        if row is not None and isinstance(row.value, dict):
            stored.update(row.value)
    demo = {**help_settings.DEMO_HELP, **help_settings.DEMO_TRIGGER} if on else {}
    reset = session.get(SystemMeta, help_demo.RESET_KEY)
    last = (reset.value.get("at") if reset is not None and isinstance(reset.value, dict)
            else None)
    return DemoHelpInfo(
        demo_mode=s.demo_mode, defaults_on=on,
        overrides=[DemoOverride(name=k, value=v) for k, v in demo.items()
                   if k not in stored or stored[k] == v],
        auto_per_day=s.help_demo_auto_per_day if s.demo_mode else 0,
        start_delay_s=s.help_scheduler_demo_start_delay_s if s.demo_mode else 0,
        last_reset_at=last)


@admin_router.post("/demo-reset", response_model=DemoResetOut)
def demo_reset(user: Admin, session: SessionDep) -> DemoResetOut:
    """DEMO_MODE only. Cancels the demo agents' open or claimed requests (kept and audited,
    nobody notified), ends a simulated shortage and restarts their cooldown, daily cap and demo
    auto cap from now. Audit logged (help_demo.reset)."""
    if not get_settings().demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="demo_mode_off")
    result = help_demo.reset(session, user, now_utc())
    session.commit()
    return DemoResetOut(cancelled_request_ids=result.cancelled_request_ids,
                        agent_ids=result.agent_ids, reset_at=result.at)
