"""What-if (F8): the cached quantile paths re-projected with a shifted starting balance.

Both scenarios share one set of seeded demand paths, so the only difference is the balance:
every path's first passage moves later for a positive delta (never earlier). No retraining.
"""

from dataclasses import dataclass

import numpy as np

from ml.inference.stockout import StockoutConfig, StockoutResult, from_paths, sample_paths

BAND_PERCENTILES = (10, 50, 90)


@dataclass(frozen=True)
class Scenario:
    balance: float
    result: StockoutResult
    bands: np.ndarray  # (H + 1, 3) balance p10 / p50 / p90 at hour 0..H, floored at cfg.floor_bdt


def balance_bands(b0: float, drain: np.ndarray, inflow: np.ndarray, floor: float) -> np.ndarray:
    """Projected balance percentiles per hour (no refill); a float cannot go below its floor."""
    paths = b0 + np.cumsum(inflow - drain, axis=1)
    bands = np.percentile(paths, BAND_PERCENTILES, axis=0).T
    return np.maximum(np.vstack([np.full((1, 3), b0), bands]), floor)


def _scenario(b0: float, drain: np.ndarray, inflow: np.ndarray, cfg: StockoutConfig) -> Scenario:
    return Scenario(b0, from_paths(b0, drain, inflow, cfg),
                    balance_bands(b0, drain, inflow, cfg.floor_bdt))


def run(b0: float, delta: float, drain_q: np.ndarray, inflow_q: np.ndarray,
        cfg: StockoutConfig, rng: np.random.Generator) -> tuple[Scenario, Scenario]:
    """(before, after) for one float. With the cache's rng seed, `before` equals the cache."""
    drain, inflow = sample_paths(drain_q, inflow_q, cfg, rng)
    return _scenario(b0, drain, inflow, cfg), _scenario(b0 + delta, drain, inflow, cfg)
