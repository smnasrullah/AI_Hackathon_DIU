"""Risk levels: stockout probability within 6 / 24 / 72 h -> green | amber | red.

A level is per float and horizon; the agent's level is the worst of its floats. Near horizons
use lower cut-offs: a 30% chance of running dry in the next 6 h already needs action.
Overrides come from settings (RISK_THRESHOLDS='{"6": [0.1, 0.3], ...}').
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from app.models.enums import RiskLevelCode

HORIZONS: tuple[int, ...] = (6, 24, 72)
# Headline level of a float / agent. 72 h assumes no refill at all, so it is shown, not headlined.
HEADLINE_HORIZON = 24
SEVERITY: dict[RiskLevelCode, int] = {
    RiskLevelCode.green: 0, RiskLevelCode.amber: 1, RiskLevelCode.red: 2,
}


@dataclass(frozen=True)
class Cut:
    amber: float  # P(stockout within horizon) >= amber -> amber
    red: float  # ... >= red -> red


DEFAULT_CUTS: dict[int, Cut] = {6: Cut(0.10, 0.30), 24: Cut(0.20, 0.50), 72: Cut(0.35, 0.70)}


@dataclass(frozen=True)
class RiskConfig:
    cuts: Mapping[int, Cut]

    def as_dict(self) -> dict[str, list[float]]:
        return {str(h): [c.amber, c.red] for h, c in sorted(self.cuts.items())}


def build_config(overrides: Mapping[int, Sequence[float]] | None = None) -> RiskConfig:
    cuts = dict(DEFAULT_CUTS)
    for horizon, pair in (overrides or {}).items():
        if horizon not in HORIZONS:
            raise ValueError(f"risk threshold horizon must be one of {HORIZONS}: {horizon}")
        if len(pair) != 2 or not 0 < pair[0] < pair[1] <= 1:
            raise ValueError(f"risk thresholds for {horizon} h need 0 < amber < red <= 1: {pair}")
        cuts[horizon] = Cut(float(pair[0]), float(pair[1]))
    return RiskConfig(cuts)


def level_for(probability: float, horizon_h: int, cfg: RiskConfig) -> RiskLevelCode:
    cut = cfg.cuts[horizon_h]
    if probability >= cut.red:
        return RiskLevelCode.red
    if probability >= cut.amber:
        return RiskLevelCode.amber
    return RiskLevelCode.green


def level_confidence(probability: float) -> float:
    """How decisive the yes/no stockout call behind a level is: max(p, 1 - p)."""
    return max(probability, 1.0 - probability)


def worst(levels: Iterable[RiskLevelCode]) -> RiskLevelCode:
    return max(levels, key=SEVERITY.__getitem__, default=RiskLevelCode.green)
