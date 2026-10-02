"""Ranked factor impacts ("drivers") of one agent's window, and the top few shown as reasons."""

from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np

from ml.explain.factors import FACTORS
from ml.explain.facts import Facts

TOP_K = 3
MIN_SHARE = 0.05  # a reason must carry at least 5% of the total absolute impact


def round_bdt(x: float) -> float:
    """The one rounding every consumer sees: nearest 100 BDT from 1,000 up, else nearest 10."""
    return float(round(x, -2) if abs(x) >= 1000 else round(x, -1)) + 0.0


@dataclass(frozen=True)
class Driver:
    factor: str
    impact_bdt: float  # signed change of window demand vs a usual window, rounded
    share: float  # |impact| / sum of |impacts| over all factors, 0..1
    facts: Facts = field(default_factory=dict)

    def as_json(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "Driver":
        return cls(str(d["factor"]), float(d["impact_bdt"]), float(d["share"]),
                   dict(d.get("facts") or {}))


def rank(impacts: np.ndarray, facts: dict[str, Facts]) -> list[Driver]:
    """Every factor, largest absolute impact first (ties keep FACTORS order)."""
    total = float(np.abs(impacts).sum()) or 1.0
    order = np.argsort(-np.abs(impacts), kind="stable")
    return [Driver(FACTORS[j], round_bdt(float(impacts[j])),
                   round(abs(float(impacts[j])) / total, 3), facts.get(FACTORS[j], {}))
            for j in order]


def top(drivers: list[Driver], k: int = TOP_K, min_share: float = MIN_SHARE) -> list[Driver]:
    return [d for d in drivers if d.impact_bdt != 0 and d.share >= min_share][:k]
