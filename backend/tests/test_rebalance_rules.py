from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from app.rules.rebalance_rules import RebalanceConfig, advise, assess, buffer_for

NOW = datetime(2026, 3, 1, 9, tzinfo=UTC)
CFG = RebalanceConfig()  # 24 h, lead 3 h, buffer max(2,000, 10% of capacity)


def _flat(v: float, h: int = 72) -> np.ndarray:
    return np.full(h, float(v))


def test_need_is_peak_net_drain_at_high_quantile() -> None:
    need = assess(5_500, 400_000, _flat(1_000), _flat(0), CFG)
    assert need.peak_drain == 24_000 and need.shortfall == 18_500
    assert need.buffer == 40_000 and need.crossing_h == 5.5
    # Inflow offsets the drain; the peak (not the end) of the cumulative path counts.
    assert assess(0, 1, _flat(1_000), _flat(400), CFG).peak_drain == 14_400
    drain, inflow = np.zeros(72), np.zeros(72)
    drain[0], inflow[1] = 5_000, 3_000
    assert assess(10_000, 100_000, drain, inflow, CFG).peak_drain == 5_000


def test_amount_is_shortfall_plus_buffer_and_deadline_is_stockout_minus_lead() -> None:
    advice = advise(assess(5_500, 400_000, _flat(1_000), _flat(0), CFG), NOW, 5.5, CFG)
    assert advice is not None
    assert advice.amount == 58_500  # 18,500 shortfall + 40,000 buffer
    assert advice.stockout_at == NOW + timedelta(hours=5.5)
    assert advice.deadline_at == NOW + timedelta(hours=2.5)
    assert not advice.capped and not advice.urgent


def test_amount_rounds_up_to_500_and_caps_at_free_capacity() -> None:
    advice = advise(assess(5_500, 400_000, _flat(1_001), _flat(0), CFG), NOW, None, CFG)
    assert advice is not None and advice.amount == 59_000  # 58,524 -> 59,000
    # Wants 18,500 + 2,000 but only 14,500 fits under the 20,000 capacity.
    capped = advise(assess(5_500, 20_000, _flat(1_000), _flat(0), CFG), NOW, None, CFG)
    assert capped is not None and capped.capped and capped.amount == 14_500


def test_earlier_stockout_wins_and_lead_time_past_is_urgent() -> None:
    need = assess(5_500, 400_000, _flat(1_000), _flat(0), CFG)
    early = advise(need, NOW, 4.0, CFG)
    assert early is not None and early.deadline_at == NOW + timedelta(hours=1)
    slow = RebalanceConfig(lead_time_h=8)
    late = advise(need, NOW, 5.5, slow)
    assert late is not None and late.urgent and late.deadline_at == NOW


def test_covered_float_gets_no_advice_and_reports_surplus() -> None:
    need = assess(60_000, 100_000, _flat(1_000), _flat(0), CFG)
    assert advise(need, NOW, None, CFG) is None
    assert need.surplus == 60_000 - 24_000 - 10_000
    assert assess(20_000, 100_000, _flat(1_000), _flat(0), CFG).surplus == 0


def test_config_is_validated_and_buffer_has_a_floor() -> None:
    assert buffer_for(5_000, CFG) == 2_000
    with pytest.raises(ValueError):
        RebalanceConfig(horizon_h=0)
    with pytest.raises(ValueError):
        RebalanceConfig(lead_time_h=-1)
