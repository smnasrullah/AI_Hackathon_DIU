"""Rebalance recommendation: top-up amount and deadline per float.

Need = peak cumulative net drain over the planning horizon on the pessimistic path
(drain at q90, inflow at q10). Shortfall = need - balance. Amount = shortfall + buffer, rounded
up to ROUND_BDT and capped at free capacity. Deadline = stockout time - lead time, where the
stockout time is the earlier of the median projection and the pessimistic-path crossing.
Overrides come from settings (REBALANCE_* in .env).
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

ROUND_BDT = 500


@dataclass(frozen=True)
class RebalanceConfig:
    horizon_h: int = 24  # planning window the recommendation must cover
    lead_time_h: float = 3.0  # time a top-up takes to arrive
    buffer_share: float = 0.10  # safety buffer as a share of the float's capacity ...
    buffer_min_bdt: float = 2_000.0  # ... but at least this much

    def __post_init__(self) -> None:
        if not 1 <= self.horizon_h <= 72:
            raise ValueError(f"rebalance horizon must be 1..72 h: {self.horizon_h}")
        if self.lead_time_h < 0 or self.buffer_share < 0 or self.buffer_min_bdt < 0:
            raise ValueError("rebalance lead time and buffer must be >= 0")


@dataclass(frozen=True)
class Need:
    """Pessimistic outlook of one float over the planning horizon."""

    balance: float
    capacity: float
    peak_drain: float  # max cumulative (drain q90 - inflow q10); >= 0
    crossing_h: float | None  # hours until the pessimistic path hits 0; None = never
    buffer: float

    @property
    def shortfall(self) -> float:
        return max(0.0, self.peak_drain - self.balance)

    @property
    def surplus(self) -> float:
        """What the float can give away and still cover its own need + buffer."""
        return max(0.0, self.balance - self.peak_drain - self.buffer)


@dataclass(frozen=True)
class Advice:
    amount: float
    deadline_at: datetime
    stockout_at: datetime
    capped: bool  # amount was limited by free capacity
    urgent: bool  # lead time already exceeds the time left


def buffer_for(capacity: float, cfg: RebalanceConfig) -> float:
    return max(cfg.buffer_min_bdt, cfg.buffer_share * capacity)


def assess(balance: float, capacity: float, drain_high: np.ndarray, inflow_low: np.ndarray,
           cfg: RebalanceConfig) -> Need:
    """drain_high / inflow_low: hourly BDT for hours 1..H (H >= cfg.horizon_h)."""
    net = np.cumsum(drain_high[:cfg.horizon_h] - inflow_low[:cfg.horizon_h])
    peak = max(0.0, float(net.max())) if net.size else 0.0
    return Need(balance=balance, capacity=capacity, peak_drain=peak,
                crossing_h=_crossing(balance, net), buffer=buffer_for(capacity, cfg))


def _crossing(balance: float, net: np.ndarray) -> float | None:
    if balance <= 0:
        return 0.0
    hit = np.nonzero(net >= balance)[0]
    if hit.size == 0:
        return None
    k = int(hit[0])
    before = 0.0 if k == 0 else float(net[k - 1])
    step = float(net[k]) - before
    return k + (balance - before) / step if step > 0 else float(k)


def advise(need: Need, now: datetime, median_stockout_h: float | None,
           cfg: RebalanceConfig) -> Advice | None:
    """None when the float covers its pessimistic need over the horizon."""
    if need.shortfall <= 0:
        return None
    free = max(0.0, need.capacity - need.balance)
    wanted = math.ceil((need.shortfall + need.buffer) / ROUND_BDT) * ROUND_BDT
    amount = min(float(wanted), math.floor(free / ROUND_BDT) * ROUND_BDT)
    hours = [h for h in (need.crossing_h, median_stockout_h) if h is not None]
    stockout_h = min(hours) if hours else float(cfg.horizon_h)
    left = stockout_h - cfg.lead_time_h
    return Advice(amount=amount, deadline_at=now + timedelta(hours=max(0.0, left)),
                  stockout_at=now + timedelta(hours=stockout_h), capped=amount < wanted,
                  urgent=left <= 0)
