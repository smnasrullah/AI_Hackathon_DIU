from pathlib import Path

import pytest

from app.core.config import get_settings
from app.models.enums import RiskLevelCode
from app.rules.risk_rules import (
    Cut,
    build_config,
    cut_at,
    level_at,
    level_confidence,
    level_for,
    worst,
)

G, A, R = RiskLevelCode.green, RiskLevelCode.amber, RiskLevelCode.red


@pytest.mark.parametrize(("p", "horizon", "level"), [
    (0.09, 6, G), (0.10, 6, A), (0.30, 6, R),
    (0.19, 24, G), (0.20, 24, A), (0.49, 24, A), (0.50, 24, R),
    (0.34, 72, G), (0.35, 72, A), (0.70, 72, R), (1.0, 72, R),
])
def test_default_cut_offs(p: float, horizon: int, level: RiskLevelCode) -> None:
    assert level_for(p, horizon, build_config()) == level


def test_cut_at_any_hour_interpolates_between_horizons() -> None:
    cfg = build_config()
    for h, cut in cfg.cuts.items():
        assert cut_at(h, cfg) == cut
    assert cut_at(0, cfg) == cut_at(3, cfg) == cfg.cuts[6]
    assert cut_at(15, cfg).amber == pytest.approx(0.15)
    assert cut_at(15, cfg).red == pytest.approx(0.40)
    assert cut_at(48, cfg).amber == pytest.approx(0.275)
    assert cut_at(80, cfg) == cfg.cuts[72]
    assert level_at(0.12, 3, cfg) == A and level_at(0.12, 15, cfg) == G
    assert level_at(0.6, 24, cfg) == level_for(0.6, 24, cfg) == R


def test_worst_and_confidence() -> None:
    assert worst([G, A, G]) == A and worst([A, R]) == R and worst([]) == G
    assert level_confidence(0.2) == 0.8 and level_confidence(0.9) == 0.9


def test_overrides_and_validation() -> None:
    cfg = build_config({6: [0.05, 0.2]})
    assert cfg.cuts[6] == Cut(0.05, 0.2) and cfg.cuts[24] == Cut(0.20, 0.50)
    assert level_for(0.06, 6, cfg) == A
    for bad in ({12: [0.1, 0.2]}, {6: [0.3, 0.2]}, {6: [0.0, 0.2]}, {6: [0.1]}):
        with pytest.raises(ValueError):
            build_config(bad)


def test_thresholds_from_settings(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RISK_THRESHOLDS", '{"72": [0.5, 0.9]}')
    get_settings.cache_clear()
    cfg = build_config(get_settings().risk_thresholds)
    assert cfg.cuts[72] == Cut(0.5, 0.9)
    assert cfg.as_dict()["72"] == [0.5, 0.9]
