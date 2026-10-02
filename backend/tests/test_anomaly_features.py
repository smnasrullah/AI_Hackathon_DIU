"""Anomaly window features + peer evidence on hand-made series (exact answers)."""

import numpy as np
import pytest

from ml.explain.anomaly_evidence import evidence, percentile_rank
from ml.features.anomaly import (
    GLOBAL_GROUP,
    HISTORY_H,
    MIN_PEERS,
    RAW,
    WINDOW_H,
    Series,
    assign_groups,
    hour_shift,
    refill_count,
    robust_z,
    window_features,
)

END = WINDOW_H + HISTORY_H
N = 12  # agents; row 0 is the odd one


def _series() -> Series:
    """Twelve agents trading 1,000 BDT each way every daytime hour; agent 0 turns nocturnal and
    is refilled every day of the window."""
    hours = np.arange(END)
    day = ((hours % 24) >= 9) & ((hours % 24) < 21)
    flow = np.tile(np.where(day, 1_000.0, 0.0), (N, 1))
    out, inn = flow.copy(), flow.copy()
    night = ~day & (hours >= END - WINDOW_H)
    out[0, night] += 5_000
    inn[0, night] += 1_000
    total = np.full((N, END), 100_000.0)
    for d in range(7):
        total[0, END - WINDOW_H + 24 * d:] += 20_000  # step up = one refill per day
    return Series(agent_ids=np.arange(1, N + 1), codes=[f"A{i}" for i in range(N)],
                  groups=["g"] * N, cash_out=out, cash_in=inn, total=total)


def test_refill_count_ignores_rounding_and_gaps() -> None:
    total = np.array([[100.0, 101.0, 5_000.0, 5_000.0, np.nan, 5_000.0]])
    assert refill_count(total).tolist() == [1]


def test_hour_shift_zero_for_same_shape_and_one_for_disjoint() -> None:
    a = np.zeros((2, 24))
    b = np.zeros((2, 24))
    a[:, 10], b[0, 10], b[1, 2] = 1, 7, 3
    assert hour_shift(a, b) == pytest.approx([0.0, 1.0])
    assert hour_shift(np.zeros((1, 24)), b[:1]).tolist() == [0.0]


def test_robust_z_is_per_group_with_floor() -> None:
    v = np.array([1.0, 1.0, 1.0, 2.0, 10.0, 20.0, 30.0])
    g = np.array(["a", "a", "a", "a", "b", "b", "b"])
    z = robust_z(v, g)
    assert z[3] == pytest.approx(1 / 0.05)  # MAD 0 -> spread floored
    assert z[4:].tolist() == pytest.approx([-10 / (1.4826 * 10), 0.0, 10 / (1.4826 * 10)])


def test_small_groups_fall_back_to_global() -> None:
    keys = ["t1-urban"] * MIN_PEERS + ["t3-rural"] * (MIN_PEERS - 1)
    groups = assign_groups(keys)
    assert set(groups[:MIN_PEERS]) == {"t1-urban"}
    assert set(groups[MIN_PEERS:]) == {GLOBAL_GROUP}


def test_window_features_single_out_the_odd_agent() -> None:
    w = window_features(_series(), END)
    raw = dict(zip(RAW, w.raw.T, strict=True))
    assert raw["refills_per_day"][0] == 1 and raw["refills_per_day"][1:].max() == 0
    assert raw["hour_shift"][0] > 0.3 and raw["hour_shift"][1:].max() == pytest.approx(0)
    assert raw["cash_out_growth"][0] > 1 and raw["out_in_log_ratio"][0] > 0.5
    # Model inputs are peer z-scores; the eleven ordinary agents sit at 0.
    assert (w.x[0] > 2).all() and np.abs(w.x[1:]).max() == pytest.approx(0)
    assert w.refills[0] == 7 and w.cash_out_bdt[0] > w.baseline_cash_out_bdt[0]


def test_window_needs_full_history() -> None:
    with pytest.raises(ValueError):
        window_features(_series(), END - 1)


def test_evidence_lists_peer_distribution_and_reasons() -> None:
    w = window_features(_series(), END)
    score = np.r_[0.8, np.full(N - 1, 0.4)]
    ev = evidence(w, score, np.full(N, 0.6), np.array(["g"] * N), 0)
    assert (ev["peer_group"], ev["peer_count"], ev["threshold"]) == ("g", N, 0.6)
    assert [f["name"] for f in ev["features"]] == list(RAW)
    refills = next(f for f in ev["features"] if f["name"] == "refills_per_day")
    # 11 peers below, itself counted half: 11.5 / 12.
    assert (refills["value"], refills["p50"], refills["percentile"]) == (1, 0, 95.8)
    assert 1 <= len(ev["reasons"]) <= 3
    assert all(r["direction"] == "high" and r["deviation"] >= 2 for r in ev["reasons"])
    assert ev["peer_scores"] == {"p50": 0.4, "p90": 0.4, "max": 0.8}
    assert ev["context"]["refills"] == 7


def test_percentile_rank_counts_ties_half() -> None:
    assert percentile_rank(np.array([1.0, 2.0, 2.0, 3.0]), 2.0) == 50.0
