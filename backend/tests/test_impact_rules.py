"""Impact backtest rules: alert baseline, arrival inside business hours, dispatch timing."""

import numpy as np
import pytest

from app.rules.impact_rules import (
    ImpactConfig,
    arrival,
    baseline_alerts,
    dispatch_now,
    fee_bdt,
    interpolate,
    is_open,
    refill_amount,
    van_cost_bdt,
)

CFG = ImpactConfig()


def test_business_hours() -> None:
    assert [is_open(h, CFG) for h in (7, 8, 20, 21)] == [False, True, True, False]


def test_arrival_digital_is_next_hour_any_time() -> None:
    assert arrival(10, 0.25, 22, physical=False, cfg=CFG) == 11
    assert arrival(10, 0.0, 3, physical=False, cfg=CFG) == 11


def test_arrival_physical_waits_for_opening() -> None:
    assert arrival(10, 3.0, 9, physical=True, cfg=CFG) == 13  # 12:00, open
    assert arrival(10, 3.0, 20, physical=True, cfg=CFG) == 22  # 23:00 -> next day 08:00
    assert arrival(10, 0.4, 20, physical=True, cfg=CFG) == 22  # 21:00 is closed already
    assert arrival(10, 2.5, 5, physical=True, cfg=CFG) == 13  # 08:00 exactly


def test_baseline_alerts_once_until_delivery() -> None:
    balance = np.array([10_000.0, 19_999.0, 20_000.0, 5_000.0])
    capacity = np.full(4, 100_000.0)
    pending = np.array([0.0, 0.0, 0.0, 30_000.0])
    assert baseline_alerts(balance, capacity, pending, CFG).tolist() == [True, True, False, False]


def test_refill_amount_rounds_up_to_500() -> None:
    assert refill_amount(10_000, 50_000) == 40_000
    assert refill_amount(10_100, 50_000) == 40_000
    assert refill_amount(10_600, 50_000) == 39_500
    assert refill_amount(60_000, 50_000) == 0


def test_dispatch_only_when_next_round_is_too_late() -> None:
    assert dispatch_now(12, 36, 4)  # nothing later
    assert not dispatch_now(20, 6, 4)  # 14 h left after the next round
    assert dispatch_now(9, 6, 4)  # only 3 h left after it: too late for a van
    assert dispatch_now(0, 6, 0.25)  # already urgent


def test_interpolate_inside_range_only() -> None:
    sweep = [(322.0, 786.0), (152.0, 1198.0), (718.0, 528.0)]
    assert interpolate(sweep, 237) == pytest.approx(992.0)
    assert interpolate(sweep, 322) == 786
    assert interpolate(sweep, 76) is None
    assert interpolate(sweep, 800) is None
    assert interpolate([], 1) is None


def test_valuation() -> None:
    assert fee_bdt(100_000, CFG) == pytest.approx(1_850)
    assert van_cost_bdt(3, CFG) == 4_500


@pytest.mark.parametrize("kwargs", [
    {"alert_share": 0.0}, {"alert_share": 1.0}, {"open_hour": 9, "close_hour": 9},
    {"decision_hours": ()}, {"decision_hours": (24,)}, {"cashout_fee_pct": -1},
])
def test_config_rejects_nonsense(kwargs: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        ImpactConfig(**kwargs)  # type: ignore[arg-type]
