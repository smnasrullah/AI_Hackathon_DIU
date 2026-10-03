"""Automatic help trigger rules: pure functions, no database."""

import uuid
from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from app.models.enums import RiskLevelCode
from app.rules import help_trigger_rules as rules
from app.rules.help_trigger_rules import Helper, TriggerPolicy

T0 = datetime(2026, 10, 3, 9, 0, tzinfo=UTC)
ZERO = np.zeros(24)


def _drain(per_hour: float, hours: int = 24) -> np.ndarray:
    return np.full(hours, per_hour)


def test_buffer_follows_the_agents_own_demand() -> None:
    p = TriggerPolicy(buffer_pct=25.0)
    small, big = rules.buffer_bdt(4_000, p), rules.buffer_bdt(80_000, p)
    assert small == 1_000 and big == 20_000  # 25 % of each agent's own daily demand
    assert rules.buffer_bdt(0, p) == 0
    assert rules.buffer_bdt(1_000, p) == 500  # 250 rounds up to one step


def test_fires_only_when_red_and_below_buffer() -> None:
    p = TriggerPolicy(horizon_h=6, min_shortfall_bdt=5_000)
    drain = _drain(3_000, 6)  # 18 000 over 6 hours on the pessimistic path
    v = rules.evaluate(10_000, drain, ZERO, 2_000, RiskLevelCode.red, None, p)
    assert v.fires and v.reason == "ok"
    assert v.projected_low_bdt == -8_000
    assert v.amount_bdt == 10_000  # shortfall to zero (8 000) + buffer (2 000)


def test_amber_or_healthy_or_small_gap_do_not_fire() -> None:
    p = TriggerPolicy(horizon_h=6, min_shortfall_bdt=5_000)
    drain = _drain(3_000, 6)
    amber = rules.evaluate(10_000, drain, ZERO, 2_000, RiskLevelCode.amber, None, p)
    assert (amber.fires, amber.reason) == (False, "risk_not_red")
    healthy = rules.evaluate(50_000, drain, ZERO, 2_000, RiskLevelCode.red, None, p)
    assert (healthy.fires, healthy.reason) == (False, "above_buffer")
    strict = TriggerPolicy(horizon_h=6, min_shortfall_bdt=20_000)
    small = rules.evaluate(10_000, drain, ZERO, 2_000, RiskLevelCode.red, None, strict)
    assert (small.fires, small.reason) == (False, "below_min_shortfall")


def test_horizon_limits_what_counts() -> None:
    drain = np.concatenate([np.zeros(6), _drain(3_000, 18)])  # trouble only after hour 6
    short = rules.evaluate(10_000, drain, ZERO, 2_000, RiskLevelCode.red, None,
                           TriggerPolicy(horizon_h=6))
    long = rules.evaluate(10_000, drain, ZERO, 2_000, RiskLevelCode.red, None,
                          TriggerPolicy(horizon_h=24))
    assert not short.fires and long.fires


def test_amount_is_capped_by_the_maximum() -> None:
    v = rules.evaluate(10_000, _drain(3_000, 6), ZERO, 2_000, RiskLevelCode.red, None,
                       TriggerPolicy(horizon_h=6, max_request_bdt=5_000))
    assert v.fires and v.amount_bdt == 5_000


def test_needed_by_is_stockout_minus_lead_margin() -> None:
    p = TriggerPolicy(lead_margin_h=1.0)
    assert rules.deadline_after(3.5, p) == timedelta(hours=2.5)
    assert rules.deadline_after(0.2, p) == rules.MIN_DEADLINE  # never a time already past


def test_stockout_is_the_earlier_of_path_and_median() -> None:
    p = TriggerPolicy(horizon_h=6)
    v = rules.evaluate(10_000, _drain(3_000, 6), ZERO, 2_000, RiskLevelCode.red, 5.0, p)
    assert v.stockout_h == pytest.approx(10_000 / 3_000)  # path crosses before the median


def test_helper_keeps_its_own_buffer() -> None:
    surplus = rules.surplus_bdt(10_000, ZERO, ZERO, 2_000, TriggerPolicy())
    assert surplus == 8_000
    assert rules.surplus_bdt(1_000, _drain(3_000, 6), ZERO, 2_000, TriggerPolicy()) == 0


def _helper(distance: float, asks: int = 0, asked: int = 0, accepted: int = 0,
            surplus: float = 1_000.0) -> Helper:
    return Helper(uuid.uuid4(), distance, surplus, asks, asked, accepted)


def test_ranking_prefers_near_and_reliable_and_rotates_away_from_frequent_asks() -> None:
    near_busy = _helper(0.5, asks=3)
    far_fresh = _helper(1.0)
    far_reliable = _helper(1.0, asked=5, accepted=5)
    ranked = rules.rank([near_busy, far_fresh, far_reliable])
    assert ranked[0] is far_reliable  # says yes almost always
    assert ranked[1] is far_fresh
    assert ranked[2] is near_busy  # asked three times this week: rotated down


def test_ranking_ties_go_to_more_surplus_then_user_id() -> None:
    a, b = _helper(1.0, surplus=2_000), _helper(1.0, surplus=9_000)
    assert rules.rank([a, b])[0] is b


def test_asked_recently_uses_the_window() -> None:
    p = TriggerPolicy(recent_ask_h=2.0)
    assert rules.asked_recently(T0 - timedelta(hours=1), T0, p)
    assert not rules.asked_recently(T0 - timedelta(hours=3), T0, p)
    assert not rules.asked_recently(None, T0, p)


def test_policy_bounds_are_enforced() -> None:
    with pytest.raises(ValueError):
        TriggerPolicy(horizon_h=0)
    with pytest.raises(ValueError):
        TriggerPolicy(buffer_pct=150)
    with pytest.raises(ValueError):
        TriggerPolicy(max_waves=0)
