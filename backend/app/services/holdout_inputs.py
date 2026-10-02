"""Shared inputs of the holdout backtests (impact F11, fairness F12).

Ground truth = the seeded generator re-run in memory (same seed and agent count as the database):
it holds the full customer demand, incl. what the logged history turned away, plus each agent's
routine refill plan. It is checked against the stored balances before use. Forecasts are made at
every planning round of the 14 held-out days from the logged history before that round only.
"""

import logging
from dataclasses import dataclass
from datetime import UTC

import numpy as np
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import Agent, Distributor, FloatSnapshot
from app.rules.impact_rules import ImpactConfig
from app.rules.swap_rules import haversine_km
from app.services.impact_policies import Forecasts
from app.services.impact_sim import Site, World
from ml.data_gen.dataset import Dataset, build_dataset
from ml.data_gen.timeline import HOLDOUT_START, N_HOURS, hour_index, hour_of_day
from ml.features.panel import TARGETS, Panel, load_panel
from ml.inference.forecaster import Forecaster

log = logging.getLogger(__name__)
BALANCE_TOLERANCE_BDT = 1.0  # stored balances are rounded to whole BDT


@dataclass
class Holdout:
    h0: int  # timeline hour index of world hour 0 (= HOLDOUT_START)
    agents: list[Agent]  # DB rows, world order
    world: World
    forecasts: Forecasts  # world hour of each planning round -> target -> (A, H, 3)
    served: dict[str, np.ndarray]  # target -> (A, N_HOURS) logged served demand (panel)
    balance: dict[str, np.ndarray]  # "cash" / "emoney" -> (A, T) logged balance, top of hour
    unmet: dict[str, np.ndarray]  # target -> (A, T) logged turned-away demand


def origins(h0: int, cfg: ImpactConfig) -> list[int]:
    """Timeline hour index of every planning round inside the holdout."""
    return [d + h for d in range(h0, N_HOURS, 24) for h in sorted(cfg.decision_hours)
            if d + h < N_HOURS]


def predict(fc: Forecaster, panel: Panel, rows: np.ndarray, starts: list[int], horizon: int
            ) -> dict[int, dict[str, np.ndarray]]:
    """origin -> target -> (len(rows), H, 3); H shrinks only at the end of the timeline."""
    spans = [min(horizon, N_HOURS - o) for o in starts]
    r = np.concatenate([np.repeat(rows, h) for h in spans])
    o = np.concatenate([np.full(len(rows) * h, s) for s, h in zip(starts, spans, strict=True)])
    hs = np.concatenate([np.tile(np.arange(1, h + 1), len(rows)) for h in spans])
    pred = {t: fc.predict_rows(panel, t, r, o, hs) for t in TARGETS}
    out: dict[int, dict[str, np.ndarray]] = {}
    at = 0
    for s, h in zip(starts, spans, strict=True):
        n = len(rows) * h
        out[s] = {t: pred[t][at:at + n].reshape(len(rows), h, 3) for t in TARGETS}
        at += n
    return out


def _matches_db(session: Session, ds: Dataset, idx: list[int], agents: list[Agent],
                h0: int) -> bool:
    stored = dict(session.execute(
        select(FloatSnapshot.agent_id, FloatSnapshot.cash_balance)
        .where(FloatSnapshot.ts == HOLDOUT_START.astimezone(UTC))).tuples().all())
    return all(a.id in stored and abs(float(stored[a.id]) - ds.floats.cash[i, h0])
               <= BALANCE_TOLERANCE_BDT for a, i in zip(agents, idx, strict=True))


def _world(session: Session, ds: Dataset, idx: list[int], agents: list[Agent], h0: int
           ) -> World:
    hubs = {d.id: (d.hub_lat, d.hub_lng) for d in session.scalars(select(Distributor))}
    sites = [Site(a.id, a.distributor_id, a.lat, a.lng,
                  None if a.distributor_id not in hubs
                  else haversine_km(a.lat, a.lng, *hubs[a.distributor_id])) for a in agents]
    fl, d, span = ds.floats, ds.demand, slice(h0, N_HOURS)
    return World(
        sites=sites, start=HOLDOUT_START.astimezone(UTC), hod=hour_of_day()[span],
        cash_cap=np.array([float(a.cash_capacity) for a in agents]),
        em_cap=np.array([float(a.emoney_capacity) for a in agents]),
        demand_in=d.amt_in[idx, span].astype(float), demand_out=d.amt_out[idx, span].astype(float),
        scheduled=fl.scheduled[idx, span], cash_target=fl.cash_target[idx, span],
        em_target=fl.emoney_target[idx], cash0=fl.cash[idx, h0], em0=fl.emoney[idx, h0])


def load(session: Session, settings: Settings, cfg: ImpactConfig, horizon: int
         ) -> Holdout | None:
    """None (logged) when the stored data is not the seeded synthetic data."""
    n = session.scalar(select(func.count(distinct(FloatSnapshot.agent_id)))) or 0
    if n == 0:
        log.warning("holdout backtest skipped: no float snapshots")
        return None
    ds = build_dataset(settings.seed, n)
    code_index = {a.code: i for i, a in enumerate(ds.agents)}
    panel = load_panel(session)
    by_id = {a.id: a for a in session.scalars(select(Agent))}
    rows = np.array([r for r, aid in enumerate(panel.agent_ids.tolist())
                     if by_id[aid].code in code_index], dtype=np.int64)
    agents = [by_id[int(panel.agent_ids[r])] for r in rows]
    idx = [code_index[a.code] for a in agents]
    h0 = hour_index(HOLDOUT_START)
    if not agents or not _matches_db(session, ds, idx, agents, h0):
        log.warning("holdout backtest skipped: stored data does not match seed %d", settings.seed)
        return None
    starts = origins(h0, cfg)
    raw = predict(Forecaster.load(settings.artifacts_dir), panel, rows, starts, horizon)
    fl, span = ds.floats, slice(h0, N_HOURS)
    return Holdout(
        h0=h0, agents=agents, world=_world(session, ds, idx, agents, h0),
        forecasts={o - h0: v for o, v in raw.items()},
        served={t: panel.demand[t][rows] for t in TARGETS},
        balance={"cash": fl.cash[idx, span], "emoney": fl.emoney[idx, span]},
        unmet={"cash_out": fl.unmet_out[idx, span], "cash_in": fl.unmet_in[idx, span]})
