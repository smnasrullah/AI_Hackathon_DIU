"""Read the impact backtest (F11), scoped: a distributor sees only its own agents' rows."""

from collections.abc import Iterable, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Distributor, ImpactResult, SystemMeta, User
from app.models.enums import ImpactScenario, RecommendationChannel, UserRole
from app.rules.impact_rules import interpolate
from app.schemas.impact import (
    EqualService,
    ImpactAssumptions,
    ImpactComparison,
    ImpactDay,
    ImpactDelta,
    ImpactSummary,
    ImpactTotals,
    ScenarioTotals,
    SweepPoint,
)
from app.services.impact import CACHE_KEY
from app.services.model_registry import active_model
from ml.data_gen.timeline import BDT
from ml.registry import FORECAST_MODEL


def _local_day(ts: datetime) -> date:
    return (ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts).astimezone(BDT).date()


def _scenario(rows: Iterable[ImpactResult], fee_pct: float, van_cost: float) -> ScenarioTotals:
    hours = lost = cash_out = 0.0
    trips = 0
    actions = {c: 0 for c in RecommendationChannel}
    for r in rows:
        hours += float(r.stockout_hours)
        lost += float(r.value_lost_bdt)
        trips += r.van_trips
        cash_out += float(r.params.get("unmet_cash_out_bdt", 0.0))
        for name, n in r.params.get("actions", {}).items():
            actions[RecommendationChannel(name)] += int(n)
    return ScenarioTotals(stockout_hours=hours, value_lost_bdt=round(lost, 2),
                          fee_lost_bdt=round(cash_out * fee_pct / 100, 2), van_trips=trips,
                          van_cost_bdt=round(trips * van_cost, 2), actions=actions)


def _delta(model: ScenarioTotals, base: ScenarioTotals) -> ImpactDelta:
    reduced = base.stockout_hours - model.stockout_hours
    return ImpactDelta(
        stockout_hours_reduced=reduced,
        stockout_hours_reduced_pct=(round(100 * reduced / base.stockout_hours, 1)
                                    if base.stockout_hours else None),
        value_saved_bdt=round(base.value_lost_bdt - model.value_lost_bdt, 2),
        fee_saved_bdt=round(base.fee_lost_bdt - model.fee_lost_bdt, 2),
        van_trips_avoided=base.van_trips - model.van_trips,
        van_cost_avoided_bdt=round(base.van_cost_bdt - model.van_cost_bdt, 2))


def _pair(rows: Sequence[ImpactResult], fee_pct: float, van_cost: float
          ) -> tuple[ScenarioTotals, ScenarioTotals, ImpactDelta]:
    model = _scenario((r for r in rows if r.scenario == ImpactScenario.model), fee_pct, van_cost)
    base = _scenario((r for r in rows if r.scenario == ImpactScenario.baseline), fee_pct, van_cost)
    return model, base, _delta(model, base)


def _totals(rows: Sequence[ImpactResult], fee_pct: float, van_cost: float) -> ImpactTotals | None:
    if not rows:
        return None
    days = sorted({_local_day(r.window_start) for r in rows})
    model, base, delta = _pair(rows, fee_pct, van_cost)
    return ImpactTotals(start=days[0], end=days[-1], days=len(days), model=model, baseline=base,
                        delta=delta)


class _View:
    """Active rows + cache meta within the caller's scope."""

    def __init__(self, session: Session, user: User, meta: dict[str, Any], version: str,
                 rows: list[ImpactResult]) -> None:
        self.meta, self.version, self.rows = meta, version, rows
        self.scope, self.dist_id = "all", None
        if user.role == UserRole.distributor:
            dist = session.get(Distributor, user.distributor_id)
            self.scope = dist.code if dist else "none"
            self.dist_id = user.distributor_id
            self.rows = [r for r in rows if r.distributor_id == user.distributor_id]
        self.generated_at = datetime.fromisoformat(meta["generated_at"])
        self.fee_pct = float(meta["assumptions"]["cashout_fee_pct"])

    def n_agents(self) -> int:
        first = min((r.window_start for r in self.rows), default=None)
        return sum(int(r.params.get("n_agents", 0)) for r in self.rows
                   if r.window_start == first and r.scenario == ImpactScenario.baseline)


def _view(session: Session, user: User) -> _View | None:
    mv = active_model(session, FORECAST_MODEL)
    meta = session.get(SystemMeta, CACHE_KEY)
    if mv is None or meta is None or not isinstance(meta.value, dict):
        return None
    rows = list(session.scalars(select(ImpactResult).where(
        ImpactResult.model_version_id == mv.id).order_by(ImpactResult.window_start)))
    if not rows:
        return None
    return _View(session, user, meta.value, mv.version, rows)


def _equal_service(v: _View, model_hours: float, model_trips: int) -> EqualService:
    parts = v.meta["sweep"].values() if v.dist_id is None else [
        v.meta["sweep"].get(str(v.dist_id), [])]
    by_share: dict[float, SweepPoint] = {}
    for points in parts:
        for p in points:
            cur = by_share.get(p["alert_share"]) or SweepPoint(
                alert_share=p["alert_share"], stockout_hours=0, van_trips=0, value_lost_bdt=0)
            by_share[p["alert_share"]] = SweepPoint(
                alert_share=cur.alert_share,
                stockout_hours=cur.stockout_hours + p["stockout_hours"],
                van_trips=cur.van_trips + p["van_trips"],
                value_lost_bdt=round(cur.value_lost_bdt + p["value_lost_bdt"], 2))
    points = [by_share[s] for s in sorted(by_share)]
    trips = interpolate([(p.stockout_hours, p.van_trips) for p in points], model_hours)
    hours = interpolate([(p.van_trips, p.stockout_hours) for p in points], model_trips)
    return EqualService(
        baseline_trips_at_ai_stockout_hours=None if trips is None else round(trips, 1),
        van_trips_avoided=None if trips is None else round(trips - model_trips, 1),
        baseline_stockout_hours_at_ai_trips=None if hours is None else round(hours, 1),
        stockout_hours_avoided=None if hours is None else round(hours - model_hours, 1),
        sweep=points)


def summary(session: Session, user: User, van_cost: float | None) -> ImpactSummary | None:
    v = _view(session, user)
    if v is None:
        return None
    a = ImpactAssumptions.model_validate(v.meta["assumptions"])
    if van_cost is not None:
        a = a.model_copy(update={"van_cost_per_trip_bdt": van_cost})
    totals = _totals(v.rows, v.fee_pct, a.van_cost_per_trip_bdt)
    if totals is None:  # a distributor without agents in the backtest
        window = v.meta["window"]
        model, base, delta = _pair([], v.fee_pct, a.van_cost_per_trip_bdt)
        totals = ImpactTotals(
            start=_local_day(datetime.fromisoformat(window["start"])),
            end=_local_day(datetime.fromisoformat(window["end"]) - timedelta(hours=1)),
            days=0, model=model, baseline=base, delta=delta)
    return ImpactSummary(
        **totals.model_dump(), scope=v.scope, n_agents=v.n_agents(),
        equal_service=_equal_service(v, totals.model.stockout_hours, totals.model.van_trips),
        assumptions=a, model_version=v.version, generated_at=v.generated_at)


def comparison(session: Session, user: User, start: date | None, end: date | None,
               van_cost: float | None) -> ImpactComparison | None:
    v = _view(session, user)
    if v is None:
        return None
    cost = van_cost if van_cost is not None else float(v.meta["assumptions"][
        "van_cost_per_trip_bdt"])
    picked = [r for r in v.rows if (start is None or _local_day(r.window_start) >= start)
              and (end is None or _local_day(r.window_start) <= end)]
    by_day: dict[date, list[ImpactResult]] = {}
    for r in picked:
        by_day.setdefault(_local_day(r.window_start), []).append(r)
    days = []
    for day in sorted(by_day):
        model, base, delta = _pair(by_day[day], v.fee_pct, cost)
        days.append(ImpactDay(date=day, model=model, baseline=base, delta=delta))
    return ImpactComparison(scope=v.scope, n_agents=v.n_agents(), days=days,
                            totals=_totals(picked, v.fee_pct, cost), model_version=v.version,
                            generated_at=v.generated_at)
