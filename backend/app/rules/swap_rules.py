"""Agent-to-agent swap matching: feasibility rules + scipy assignment.

Receivers: amber/red agents with a top-up need in one float. Donors: agents that are not
receivers and hold surplus in that float above their own pessimistic need + buffer.
A pair is feasible when both share a distributor, sit within the radius (haversine) and the
amount min(need, donor surplus), rounded down to ROUND_BDT, reaches the minimum. Among
feasible pairs, linear_sum_assignment minimises total distance, so each agent is in at most
one swap. A swap that covers the receiver's whole need saves one van trip. Pinned receivers
(the demo cast) are assigned first, then everyone else over the remaining donors.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from scipy.optimize import linear_sum_assignment

from app.models.enums import FloatType
from app.rules.rebalance_rules import ROUND_BDT

EARTH_RADIUS_KM = 6371.0088
_INFEASIBLE = 1e9


@dataclass(frozen=True)
class SwapConfig:
    radius_km: float = 5.0
    min_amount_bdt: float = 5_000.0

    def __post_init__(self) -> None:
        if self.radius_km <= 0 or self.min_amount_bdt <= 0:
            raise ValueError("swap radius and minimum amount must be > 0")


@dataclass(frozen=True)
class Receiver:
    agent_id: int
    distributor_id: int
    lat: float
    lng: float
    float_type: FloatType
    need: float  # BDT the recommendation asks for


@dataclass(frozen=True)
class Donor:
    agent_id: int
    distributor_id: int
    lat: float
    lng: float
    surplus: dict[FloatType, float]


@dataclass(frozen=True)
class Match:
    donor: Donor
    receiver: Receiver
    amount: float
    distance_km: float
    van_trip_saved: bool
    score: float  # coverage x closeness, 0..1 (higher is better)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))


def swap_amount(donor: Donor, receiver: Receiver) -> float:
    give = min(receiver.need, donor.surplus.get(receiver.float_type, 0.0))
    return float(math.floor(give / ROUND_BDT) * ROUND_BDT)


def _pair(donor: Donor, receiver: Receiver, cfg: SwapConfig) -> Match | None:
    if donor.agent_id == receiver.agent_id or donor.distributor_id != receiver.distributor_id:
        return None
    distance = haversine_km(donor.lat, donor.lng, receiver.lat, receiver.lng)
    amount = swap_amount(donor, receiver)
    if distance > cfg.radius_km or amount < cfg.min_amount_bdt:
        return None
    coverage = min(1.0, amount / receiver.need)
    return Match(donor=donor, receiver=receiver, amount=amount, distance_km=round(distance, 2),
                 van_trip_saved=amount >= receiver.need,
                 score=round(coverage * (1.0 - distance / cfg.radius_km), 4))


def _assign(donors: Sequence[Donor], receivers: Sequence[Receiver], cfg: SwapConfig
            ) -> list[Match]:
    if not donors or not receivers:
        return []
    pairs = [[_pair(d, r, cfg) for r in receivers] for d in donors]
    cost = np.array([[_INFEASIBLE if p is None else p.distance_km for p in row] for row in pairs])
    rows, cols = linear_sum_assignment(cost)
    found = [pairs[i][j] for i, j in zip(rows.tolist(), cols.tolist(), strict=True)]
    return [m for m in found if m is not None]


def match(donors: Sequence[Donor], receivers: Sequence[Receiver], cfg: SwapConfig,
          first: frozenset[int] = frozenset()) -> list[Match]:
    """Distance-minimising one-to-one assignment over feasible pairs only.

    Receivers in `first` (the pinned demo cast) are assigned before the rest, so a closer
    stranger cannot take the one donor the demo story depends on. Same rules either way.
    """
    head = _assign(donors, [r for r in receivers if r.agent_id in first], cfg)
    used = {m.donor.agent_id for m in head}
    tail = _assign([d for d in donors if d.agent_id not in used],
                   [r for r in receivers if r.agent_id not in first], cfg)
    return sorted(head + tail, key=lambda m: (m.receiver.agent_id, m.donor.agent_id))
