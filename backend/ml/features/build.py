"""Direct multi-horizon feature rows: one row = (agent, origin t0, horizon h), target hour
t = t0 + h - 1. Only demand before t0 is used. History features are divided by the agent's
trailing 7-day mean hourly demand (`scale`), so one model serves small and large agents; the
model predicts demand / scale and inference multiplies back (quantiles are scale-equivariant).
"""

import numpy as np

from ml.features.panel import EID, HAT, HOLIDAY, SALARY, SEVERE, WAGE, Panel

MAX_HORIZON_H = 72
MIN_HISTORY_H = 672  # four weeks: the oldest same-hour lag
WEEK_H = 168

FEATURES: tuple[str, ...] = (
    "horizon_h", "hour", "dow", "dom",
    "ev_salary", "ev_wage", "ev_eid_day", "ev_holiday", "ev_hat", "ev_severe_weather",
    "rain_mm", "temp_c",
    "tier", "area", "district", "cash_cap_k", "emoney_cap_k",
    "log_scale", "lag_day", "lag_168", "lag_336", "same_hour_4w", "roll_24", "last_hour",
)
CATEGORICAL: tuple[str, ...] = ("area", "district")
SCALE_FLOOR = 1.0


def _cumsum(y: np.ndarray) -> np.ndarray:
    return np.concatenate([np.zeros((y.shape[0], 1)), np.cumsum(y, axis=1)], axis=1)


def build(panel: Panel, target: str, rows: np.ndarray, origins: np.ndarray,
          horizons: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (X float32 (n, len(FEATURES)), scale (n,)) for panel row indices `rows`."""
    if origins.min() < MIN_HISTORY_H or horizons.min() < 1 or horizons.max() > MAX_HORIZON_H:
        raise ValueError("origin needs 4 weeks of history; horizon must be 1..72")
    y = panel.demand[target]
    cs = _cumsum(y)
    t = origins + horizons - 1
    day = t // 24
    d = panel.district[rows]

    def window_mean(n: int) -> np.ndarray:
        return (cs[rows, origins] - cs[rows, origins - n]) / n

    scale = np.maximum(window_mean(WEEK_H), SCALE_FLOOR)
    lag_day_k = 24 * ((horizons - 1) // 24 + 1)  # most recent same hour already observed
    same_hour = np.stack([y[rows, t - k * WEEK_H] for k in (1, 2, 3, 4)]).mean(axis=0)
    ev = panel.events
    cols = {
        "horizon_h": horizons,
        "hour": panel.hour[t], "dow": panel.dow[t], "dom": panel.dom[t],
        "ev_salary": ev[d, SALARY, t], "ev_wage": ev[d, WAGE, t], "ev_eid_day": ev[d, EID, t],
        "ev_holiday": ev[d, HOLIDAY, t], "ev_hat": ev[d, HAT, t],
        "ev_severe_weather": ev[d, SEVERE, t],
        "rain_mm": panel.rain_mm[d, day], "temp_c": panel.temp_c[d, day],
        "tier": panel.tier[rows], "area": panel.area[rows], "district": d,
        "cash_cap_k": panel.cash_cap[rows] / 1000, "emoney_cap_k": panel.emoney_cap[rows] / 1000,
        "log_scale": np.log(scale),
        "lag_day": y[rows, t - lag_day_k] / scale,
        "lag_168": y[rows, t - WEEK_H] / scale,
        "lag_336": y[rows, t - 2 * WEEK_H] / scale,
        "same_hour_4w": same_hour / scale,
        "roll_24": window_mean(24) / scale,
        "last_hour": y[rows, origins - 1] / scale,
    }
    x = np.column_stack([np.asarray(cols[f], dtype=np.float32) for f in FEATURES])
    return x, scale


def grid(n_agents: int, origin: int, horizon: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """All agents x horizons 1..horizon for one origin, agent-major order."""
    rows = np.repeat(np.arange(n_agents), horizon)
    hs = np.tile(np.arange(1, horizon + 1), n_agents)
    return rows, np.full(rows.shape, origin), hs
