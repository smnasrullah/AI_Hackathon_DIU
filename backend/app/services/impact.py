"""Impact backtest store (F11): AI vs the fixed-threshold baseline over the 14 held-out days.

One impact_results row per scenario x distributor x local day. Assumptions, the window and the
baseline threshold sweep (equal-service comparison) go to system_meta["impact_cache"].
Method: docs/METHODS.md §3, Impact.
"""

import logging
from collections import Counter
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
from sqlalchemy import delete, insert
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import ImpactResult, ModelVersion, SystemMeta
from app.models.enums import ImpactScenario
from app.rules.channel_rules import ChannelConfig
from app.rules.impact_rules import ImpactConfig
from app.rules.rebalance_rules import RebalanceConfig
from app.rules.swap_rules import SwapConfig
from app.services.holdout_inputs import Holdout
from app.services.impact_policies import AiPolicy, BaselinePolicy
from app.services.impact_sim import Outcome, World, run

log = logging.getLogger(__name__)
CACHE_KEY = "impact_cache"
METHOD = "holdout-replay-1"
STOCKOUT_MIN_BDT = 0.5  # an hour is a stockout hour when more than this was turned away
DAY_H = 24


def impact_config(settings: Settings) -> ImpactConfig:
    return ImpactConfig(alert_share=settings.impact_alert_share,
                        decision_hours=tuple(settings.impact_decision_hours),
                        emergency_eta_h=settings.rebalance_lead_time_h,
                        cashout_fee_pct=settings.impact_cashout_fee_pct,
                        van_cost_per_trip_bdt=settings.van_cost_per_trip_bdt)


def assumptions(cfg: ImpactConfig, rcfg: RebalanceConfig, ccfg: ChannelConfig
                ) -> dict[str, Any]:
    return {"alert_share": cfg.alert_share, "decision_hours": list(cfg.decision_hours),
            "emergency_eta_h": cfg.emergency_eta_h, "van_lead_time_h": ccfg.van_lead_time_h,
            "topup_eta_h": ccfg.topup_eta_h, "cashout_fee_pct": cfg.cashout_fee_pct,
            "van_cost_per_trip_bdt": cfg.van_cost_per_trip_bdt,
            "rebalance_horizon_h": rcfg.horizon_h}


@dataclass
class Cell:
    """One scenario's outcome for one distributor's agents on one day."""

    n_agents: int
    stockout_hours: int = 0
    stockout_cash_h: int = 0
    stockout_emoney_h: int = 0
    lost_out: float = 0.0  # turned-away cash-out (cash float empty)
    lost_in: float = 0.0  # turned-away cash-in (e-money float empty)
    trips: set[str] = field(default_factory=set)
    actions: Counter[str] = field(default_factory=Counter)
    delivered_bdt: float = 0.0

    @property
    def lost(self) -> float:
        return self.lost_out + self.lost_in


def tally(w: World, o: Outcome) -> dict[tuple[int, int], Cell]:
    """(distributor id, day) -> outcome; trips and actions by the day they were ordered."""
    dist = np.array([s.distributor_id for s in w.sites])
    hit_out, hit_in = o.unmet_out > STOCKOUT_MIN_BDT, o.unmet_in > STOCKOUT_MIN_BDT
    cells: dict[tuple[int, int], Cell] = {}
    for d_id in sorted(set(dist.tolist())):
        m = dist == d_id
        for day in range(w.n_hours // DAY_H):
            sl = slice(day * DAY_H, (day + 1) * DAY_H)
            cells[(d_id, day)] = Cell(
                n_agents=int(m.sum()),
                stockout_hours=int((hit_out[m, sl] | hit_in[m, sl]).sum()),
                stockout_cash_h=int(hit_out[m, sl].sum()),
                stockout_emoney_h=int(hit_in[m, sl].sum()),
                lost_out=float(o.unmet_out[m, sl].sum()), lost_in=float(o.unmet_in[m, sl].sum()))
    for d in o.deliveries:
        cell = cells.get((int(dist[d.row]), d.ordered // DAY_H))
        if cell is None:
            continue
        if d.trip:
            cell.trips.add(d.trip)
        cell.actions[d.channel.value] += 1
        cell.delivered_bdt += d.amount
    return cells


def _row(mv_id: int, scenario: ImpactScenario, key: tuple[int, int], c: Cell, saved: float,
         start: datetime) -> dict[str, Any]:
    d_id, day = key
    begin = start + timedelta(days=day)
    return {"model_version_id": mv_id, "scenario": scenario, "distributor_id": d_id,
            "window_start": begin, "window_end": begin + timedelta(days=1),
            "stockout_hours": c.stockout_hours, "value_lost_bdt": round(c.lost, 2),
            "value_saved_bdt": round(saved, 2), "van_trips": len(c.trips),
            "params": {"n_agents": c.n_agents, "stockout_cash_h": c.stockout_cash_h,
                       "stockout_emoney_h": c.stockout_emoney_h,
                       "unmet_cash_out_bdt": round(c.lost_out, 2),
                       "unmet_cash_in_bdt": round(c.lost_in, 2),
                       "actions": dict(sorted(c.actions.items())),
                       "delivered_bdt": round(c.delivered_bdt, 2)}}


def sweep(w: World, cfg: ImpactConfig, topup_eta_h: float) -> dict[str, list[dict[str, Any]]]:
    """Distributor id -> the threshold rule at each swept share (full window)."""
    out: dict[str, list[dict[str, Any]]] = {}
    for share in sorted({*cfg.sweep_shares, cfg.alert_share}):
        cells = tally(w, run(w, BaselinePolicy(w, replace(cfg, alert_share=share), topup_eta_h)))
        for d_id in sorted({k[0] for k in cells}):
            mine = [c for k, c in cells.items() if k[0] == d_id]
            out.setdefault(str(d_id), []).append({
                "alert_share": share, "stockout_hours": sum(c.stockout_hours for c in mine),
                "van_trips": sum(len(c.trips) for c in mine),
                "value_lost_bdt": round(sum(c.lost for c in mine), 2)})
    return out


def store(session: Session, h: Holdout, mv: ModelVersion, cfg: ImpactConfig,
          rcfg: RebalanceConfig, scfg: SwapConfig, ccfg: ChannelConfig, key: dict[str, Any]
          ) -> int:
    """Run both policies, replace impact_results. Returns rows written."""
    w = h.world
    base = tally(w, run(w, BaselinePolicy(w, cfg, ccfg.topup_eta_h)))
    model = tally(w, run(w, AiPolicy(w, h.forecasts, cfg, rcfg, scfg, ccfg)))
    rows = []
    for k, b in base.items():
        rows.append(_row(mv.id, ImpactScenario.baseline, k, b, 0.0, w.start))
        rows.append(_row(mv.id, ImpactScenario.model, k, model[k], b.lost - model[k].lost,
                         w.start))
    session.execute(delete(ImpactResult))
    if rows:
        session.execute(insert(ImpactResult), rows)
    session.merge(SystemMeta(key=CACHE_KEY, value={
        "key": key, "generated_at": datetime.now(UTC).isoformat(),
        "assumptions": assumptions(cfg, rcfg, ccfg),
        "window": {"start": w.start.isoformat(),
                   "end": (w.start + timedelta(hours=w.n_hours)).isoformat()},
        "sweep": sweep(w, cfg, ccfg.topup_eta_h)}))
    log.info("impact: %d rows; stockout h model %d vs baseline %d", len(rows),
             sum(c.stockout_hours for c in model.values()),
             sum(c.stockout_hours for c in base.values()))
    return len(rows)
