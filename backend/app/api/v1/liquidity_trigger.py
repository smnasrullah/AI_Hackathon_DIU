"""Automatic liquidity help: agent opt-out, admin settings, dry-run preview, demo shortage helper.

Nothing here moves money. The dry run and the settings never send; the demo helper runs only
when DEMO_MODE is on and is audit logged. Every result it makes is marked simulated.
"""

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.core.deps import SessionDep, require_roles
from app.models import User
from app.models.enums import UserRole
from app.schemas.help_trigger import (
    DryRunIn,
    DryRunOut,
    OptOutIn,
    OptOutOut,
    PlanAskOut,
    PlanItemOut,
    SimulateIn,
    SimulateOut,
    TriggerSettingsIn,
    TriggerSettingsOut,
)
from app.services import help_settings, help_trigger_run
from app.services import help_trigger as trig
from app.services.liquidity_requests import now_utc

router = APIRouter(prefix="/liquidity-requests", tags=["liquidity-requests"])
admin_router = APIRouter(prefix="/admin/liquidity-requests", tags=["liquidity-requests"])

AgentUser = Annotated[User, Depends(require_roles(UserRole.agent))]
Admin = Annotated[User, Depends(require_roles(UserRole.admin))]


def _item_out(item: trig.AgentPlan) -> PlanItemOut:
    v = item.verdict
    return PlanItemOut(
        agent_id=item.agent_id, agent_code=item.agent_code, float_type=item.float_type,
        fires=v.fires, reason=v.reason, projected_low_bdt=v.projected_low_bdt,
        buffer_bdt=v.buffer_bdt, amount_bdt=v.amount_bdt, needed_by=item.needed_by,
        skipped=item.skipped, simulated=item.simulated, reason_summary=item.reason_summary,
        asks=[PlanAskOut(display=a.display, role=a.role, distance_km=a.distance_km,
                         wave=1) for a in item.asks])


@router.post("/opt-out", response_model=OptOutOut)
def opt_out(body: OptOutIn, user: AgentUser, session: SessionDep) -> OptOutOut:
    """An agent chooses whether they can be asked for help. Opted-out agents are never ranked."""
    try:
        value = trig.set_opt_out(session, user, body.opted_out)
    except trig.TriggerError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=exc.code) from exc
    session.commit()
    return OptOutOut(opted_out=value)


@admin_router.get("/trigger-settings", response_model=TriggerSettingsOut)
def read_trigger_settings(_user: Admin, session: SessionDep) -> TriggerSettingsOut:
    """Horizon, buffer percentage, minimum shortfall, cap, lead margin, radius, waves, timeout."""
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
def dry_run(body: DryRunIn, _user: Admin, session: SessionDep) -> DryRunOut:
    """Shows which agents WOULD get a request and who WOULD be asked. Writes nothing, sends
    nothing, whatever the kill switch and dry-run settings say."""
    now = now_utc()
    tp, hp = help_settings.trigger_current(session), help_settings.current(session)
    ids = set(body.agent_ids) if body.agent_ids is not None else None
    plans = trig.plan(session, now, tp, hp, ids, trig.current_demo(session, now))
    items = [_item_out(p) for p in plans]
    would = [p for p in plans if p.would_create]
    return DryRunOut(evaluated_at=now, enabled=hp.enabled, dry_run=hp.dry_run, items=items,
                     would_create=len(would),
                     would_ask=sum(len(p.asks) for p in would))


@admin_router.post("/simulate-shortage", response_model=SimulateOut)
def simulate_shortage(body: SimulateIn, user: Admin, session: SessionDep) -> SimulateOut:
    """DEMO_MODE only. Forces one agent into a shortage for 30 minutes and runs the trigger
    for that agent now. Audit logged; every request it makes is marked simulated."""
    if not get_settings().demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="demo_mode_off")
    now = now_utc()
    try:
        until = trig.simulate_shortage(session, user, body.agent_id, body.float_type, now)
    except trig.TriggerError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=exc.code) from exc
    session.commit()
    report = help_trigger_run.run_trigger(now, {body.agent_id})
    mine = [p for p in report.plans if p.float_type == body.float_type]
    plan = mine[0] if mine else None
    if plan is None:  # no forecast covers this agent yet: the demo cannot act on it
        raise HTTPException(status.HTTP_409_CONFLICT, detail="no_forecast")
    return SimulateOut(agent_id=body.agent_id, agent_code=plan.agent_code,
                       float_type=body.float_type, until=until,
                       created_request_ids=report.created, plan=_item_out(plan))
