"""Impact backtest rules (F11): the fixed-threshold alert baseline, AI dispatch timing, delivery
arrival and the BDT valuation of the outcome.

Baseline: every business hour, a float below `alert_share` x capacity raises an alert (once
until its delivery lands); cash comes by a dedicated emergency van (one trip), e-money by digital
top-up; both refill the float to the agent's usual refill target.
AI: at each decision hour the rebalance recommendation is dispatched only when its deadline falls
before the next decision round (otherwise it waits for fresher numbers).
Physical deliveries land inside business hours; one that would arrive after closing lands at the
next opening. Overrides come from settings (IMPACT_* in .env). Advisory only: nothing moves money.
"""

import math
from dataclasses import dataclass

import numpy as np

from app.models.enums import RecommendationChannel as Channel
from app.rules.rebalance_rules import ROUND_BDT

# Channels that put a van on the road: a batched route counts once, an emergency delivery once.
VAN_CHANNELS = (Channel.van, Channel.urgent_manual)


@dataclass(frozen=True)
class ImpactConfig:
    alert_share: float = 0.20  # baseline alert: float below 20% of its capacity
    open_hour: int = 8  # business hours [open_hour, close_hour), local time
    close_hour: int = 21
    decision_hours: tuple[int, ...] = (8, 14, 20)  # AI planning rounds, local time
    # Baseline thresholds swept to compare at equal service (the headline uses alert_share).
    sweep_shares: tuple[float, ...] = (0.1, 0.2, 0.3, 0.4, 0.5)
    emergency_eta_h: float = 3.0  # dedicated delivery: baseline van and AI urgent_manual
    cashout_fee_pct: float = 1.85  # customer cash-out fee lost with every turned-away cash-out
    van_cost_per_trip_bdt: float = 1_500.0

    def __post_init__(self) -> None:
        if not 0 < self.alert_share < 1:
            raise ValueError(f"alert share must be in (0, 1): {self.alert_share}")
        if not 0 <= self.open_hour < self.close_hour <= 24:
            raise ValueError("business hours need 0 <= open < close <= 24")
        if not self.decision_hours or any(not 0 <= h < 24 for h in self.decision_hours):
            raise ValueError(f"decision hours must be 0..23: {self.decision_hours}")
        if min(self.emergency_eta_h, self.cashout_fee_pct, self.van_cost_per_trip_bdt) < 0:
            raise ValueError("impact ETA, fee and van cost must be >= 0")


def is_open(hour_of_day: int, cfg: ImpactConfig) -> bool:
    return cfg.open_hour <= hour_of_day < cfg.close_hour


def arrival(t: int, eta_h: float, hour_of_day: int, physical: bool, cfg: ImpactConfig) -> int:
    """Hour index a delivery ordered at hour t (local hour_of_day) lands; at least t + 1."""
    land = t + max(1, math.ceil(eta_h))
    if not physical:
        return land
    hod = (hour_of_day + land - t) % 24
    if is_open(hod, cfg):
        return land
    return land + (cfg.open_hour - hod) % 24


def baseline_alerts(balance: np.ndarray, capacity: np.ndarray, pending: np.ndarray,
                    cfg: ImpactConfig) -> np.ndarray:
    """(A,) bool: below the fixed threshold and no delivery already on its way."""
    return (balance < cfg.alert_share * capacity) & (pending <= 0)


def refill_amount(balance: float, target: float) -> float:
    """Baseline delivery: back up to the usual refill target, rounded up to ROUND_BDT."""
    return float(math.ceil(max(0.0, target - balance) / ROUND_BDT) * ROUND_BDT)


def dispatch_now(hours_to_deadline: float, hours_to_next_round: float, lead_h: float) -> bool:
    """AI: order now only when the next planning round would leave less than `lead_h` (the
    lead time of the usual channel: batched van for cash, top-up for e-money) to the deadline."""
    return hours_to_deadline - hours_to_next_round < lead_h


def interpolate(points: list[tuple[float, float]], x: float) -> float | None:
    """y at x, linear between the (x, y) points of the threshold sweep; None outside their range.

    Equal service: points (stockout hours, van trips) at the AI's stockout hours.
    Equal van budget: points (van trips, stockout hours) at the AI's van trips.
    """
    pts = sorted(points)
    if not pts or not pts[0][0] <= x <= pts[-1][0]:
        return None
    for (x0, y0), (x1, y1) in zip(pts, pts[1:], strict=False):
        if x0 <= x <= x1:
            return float(y0) if x1 == x0 else y0 + (x - x0) * (y1 - y0) / (x1 - x0)
    return float(pts[0][1])


def fee_bdt(cash_out_bdt: float, cfg: ImpactConfig) -> float:
    return cash_out_bdt * cfg.cashout_fee_pct / 100


def van_cost_bdt(trips: int, cfg: ImpactConfig) -> float:
    return trips * cfg.van_cost_per_trip_bdt
