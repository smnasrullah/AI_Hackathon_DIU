"""Time-to-stockout from quantile demand paths (method: docs/METHODS.md §2, "Time-to-stockout").

One float, no refills: balance(h) = b0 + cumsum(inflow - drain). Hourly demand is sampled from a
two-piece linear quantile function through q10 / q50 / q90 (linear tails, clipped at 0); hours are
tied by a Gaussian copula with a shared path factor, so a busy morning tends to be a busy day.
"""

from dataclasses import dataclass

import numpy as np
from scipy.special import ndtr

LEVELS = (0.1, 0.5, 0.9)
_SPAN = LEVELS[1] - LEVELS[0]  # 0.4: q10 -> q50 and q50 -> q90


@dataclass(frozen=True)
class StockoutConfig:
    n_paths: int = 2000
    rho: float = 0.6  # share of each hour's demand shock that is common to the whole path
    floor_bdt: float = 0.0  # balance at or below this counts as stocked out
    window_share: float = 0.25  # confidence window: +-25% of the predicted hours ...
    min_window_h: float = 1.0  # ... but at least +-1 h


@dataclass(frozen=True)
class StockoutResult:
    cdf: np.ndarray  # (H,) P(stockout by the end of hour h), h = 1..H
    hours: float | None  # median first-passage time; None = more likely no stockout within H
    confidence: float
    p_now: float = 0.0  # P(already at or below the floor at hour 0)

    def prob_within(self, horizon_h: int) -> float:
        return float(self.cdf[horizon_h - 1])

    def by_hour(self) -> list[float]:
        """P(stockout by hour h) for h = 0..H (index = hour)."""
        return [self.p_now, *(float(p) for p in self.cdf)]


def demand_quantile(q: np.ndarray, u: np.ndarray) -> np.ndarray:
    """Demand at probability level u. q: (H, 3) low/mid/high, u: (N, H) -> (N, H) BDT."""
    lo, mid, hi = q[:, 0], q[:, 1], q[:, 2]
    below = mid - (LEVELS[1] - u) * (mid - lo) / _SPAN
    above = mid + (u - LEVELS[1]) * (hi - mid) / _SPAN
    return np.maximum(np.where(u < LEVELS[1], below, above), 0.0)


def _copula(rng: np.random.Generator, n: int, h: int, rho: float) -> np.ndarray:
    z = np.sqrt(rho) * rng.standard_normal((n, 1)) + np.sqrt(1 - rho) * rng.standard_normal((n, h))
    return np.asarray(ndtr(z))


def first_passage(b0: float, drain: np.ndarray, inflow: np.ndarray, floor: float) -> np.ndarray:
    """(N,) hours until the balance first reaches `floor` (inf = never within H).

    Flow is spread evenly inside an hour, so a crossing in hour h is interpolated in (h-1, h].
    """
    n, _ = drain.shape
    if b0 <= floor:
        return np.zeros(n)
    end = b0 + np.cumsum(inflow - drain, axis=1)
    start = np.concatenate([np.full((n, 1), b0), end[:, :-1]], axis=1)
    hit = end <= floor
    any_hit = hit.any(axis=1)
    k = hit.argmax(axis=1)
    rows = np.arange(n)
    s, e = start[rows, k], end[rows, k]
    frac = np.divide(s - floor, s - e, out=np.ones(n), where=s > e)
    return np.where(any_hit, k + frac, np.inf)


def sample_paths(drain_q: np.ndarray, inflow_q: np.ndarray, cfg: StockoutConfig,
                 rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """(N, H) hourly drain and inflow paths. drain_q / inflow_q: (H, 3) hourly BDT quantiles."""
    horizon = drain_q.shape[0]
    drain = demand_quantile(drain_q, _copula(rng, cfg.n_paths, horizon, cfg.rho))
    inflow = demand_quantile(inflow_q, _copula(rng, cfg.n_paths, horizon, cfg.rho))
    return drain, inflow


def from_paths(b0: float, drain: np.ndarray, inflow: np.ndarray, cfg: StockoutConfig
               ) -> StockoutResult:
    """Stockout distribution of one float starting at b0 over already-sampled paths."""
    n, horizon = drain.shape
    t = np.sort(first_passage(b0, drain, inflow, cfg.floor_bdt))
    cdf = np.searchsorted(t, np.arange(1, horizon + 1), side="right") / n
    p_now = float(np.mean(t <= 0))
    median = float(t[(n + 1) // 2 - 1])  # earliest t with P(T <= t) >= 0.5
    if not np.isfinite(median):
        return StockoutResult(cdf, None, float(1.0 - cdf[-1]), p_now)
    window = max(cfg.min_window_h, cfg.window_share * median)
    confidence = float(np.mean(np.abs(t - median) <= window))
    return StockoutResult(cdf, median, confidence, p_now)


def project(b0: float, drain_q: np.ndarray, inflow_q: np.ndarray, cfg: StockoutConfig,
            rng: np.random.Generator) -> StockoutResult:
    """Stockout distribution of one float. drain_q / inflow_q: (H, 3) hourly BDT quantiles."""
    return from_paths(b0, *sample_paths(drain_q, inflow_q, cfg, rng), cfg)
