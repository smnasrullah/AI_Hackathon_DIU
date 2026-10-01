"""Held-out backtest (last 14 days, never trained on) vs the same-hour-last-week baseline."""

from typing import Any

import numpy as np

from ml.features.build import MAX_HORIZON_H, WEEK_H
from ml.features.panel import TARGETS, Panel
from ml.inference.forecaster import Forecaster
from ml.registry import QUANTILES

ORIGIN_HOURS = (8, 20)  # forecasts issued every holdout day at 08:00 and 20:00 local
HORIZON_BUCKETS = ((1, 6), (7, 24), (25, 72))


def pinball(y: np.ndarray, pred: np.ndarray, q: float) -> float:
    diff = y - pred
    return float(np.mean(np.maximum(q * diff, (q - 1) * diff)))


def holdout_grid(n_agents: int, holdout_start: int, n_hours: int
                 ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    origins = [d + h for d in range(holdout_start, n_hours, 24) for h in ORIGIN_HOURS]
    rows, o, hs = [], [], []
    for t0 in origins:
        horizon = min(MAX_HORIZON_H, n_hours - t0)
        rows.append(np.repeat(np.arange(n_agents), horizon))
        o.append(np.full(n_agents * horizon, t0))
        hs.append(np.tile(np.arange(1, horizon + 1), n_agents))
    return np.concatenate(rows), np.concatenate(o), np.concatenate(hs)


def _r(x: float) -> float:
    return round(float(x), 4)


def _target_metrics(y: np.ndarray, pred: np.ndarray, base: np.ndarray,
                    hs: np.ndarray) -> dict[str, Any]:
    mae, mae_b = np.mean(np.abs(y - pred[:, 1])), np.mean(np.abs(y - base))
    pin = {str(q): pinball(y, pred[:, i], q) for i, q in enumerate(QUANTILES)}
    pin_b = {str(q): pinball(y, base, q) for q in QUANTILES}
    by_h = {}
    for lo, hi in HORIZON_BUCKETS:
        m = (hs >= lo) & (hs <= hi)
        by_h[f"{lo}-{hi}"] = {"mae": _r(np.mean(np.abs(y[m] - pred[m, 1]))),
                              "mae_baseline": _r(np.mean(np.abs(y[m] - base[m])))}
    return {
        "rows": int(len(y)),
        "mean_demand_bdt": _r(np.mean(y)),
        "mae_bdt": _r(mae),
        "mae_baseline_bdt": _r(mae_b),
        "mae_skill": _r(1 - mae / mae_b),
        "pinball": {k: _r(v) for k, v in pin.items()} | {"mean": _r(np.mean(list(pin.values())))},
        "pinball_baseline": {k: _r(v) for k, v in pin_b.items()}
        | {"mean": _r(np.mean(list(pin_b.values())))},
        "coverage_q10_q90": _r(np.mean((y >= pred[:, 0]) & (y <= pred[:, 2]))),
        "mae_by_horizon_h": by_h,
    }


def evaluate(fc: Forecaster, panel: Panel, holdout_start: int, n_hours: int) -> dict[str, Any]:
    rows, origins, hs = holdout_grid(len(panel.agent_ids), holdout_start, n_hours)
    t = origins + hs - 1
    out: dict[str, Any] = {"origins_local_hours": list(ORIGIN_HOURS),
                           "baseline": "same hour last week (y[t-168]) for every quantile"}
    for target in TARGETS:
        y = panel.demand[target]
        pred = fc.predict_rows(panel, target, rows, origins, hs)
        out[target] = _target_metrics(y[rows, t], pred, y[rows, t - WEEK_H], hs)
    return out
