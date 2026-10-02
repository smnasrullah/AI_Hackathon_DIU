"""Stockout projection on hand-made balances and demand paths with known answers."""

import numpy as np
import pytest

from ml.inference.stockout import StockoutConfig, demand_quantile, project

H = 72
CFG = StockoutConfig(n_paths=500)


def flat(value: float) -> np.ndarray:
    return np.full((H, 3), float(value))


def rng() -> np.random.Generator:
    return np.random.default_rng(0)


def test_quantile_function_hits_the_three_quantiles_and_clips_at_zero() -> None:
    q = np.array([[100.0, 300.0, 700.0]])
    got = demand_quantile(q, np.array([[0.1, 0.5, 0.9]]).T)
    np.testing.assert_allclose(got[:, 0], [100, 300, 700])
    assert demand_quantile(q, np.array([[0.0]]))[0, 0] == 50  # linear tail: 100 - 0.1 * 500
    assert demand_quantile(np.array([[10.0, 300.0, 700.0]]), np.array([[0.0]]))[0, 0] == 0


def test_constant_drain_runs_out_mid_hour() -> None:
    r = project(5500, flat(1000), flat(0), CFG, rng())
    assert r.hours == pytest.approx(5.5)
    assert r.confidence == 1.0
    assert r.prob_within(5) == 0.0 and r.prob_within(6) == 1.0 and r.prob_within(72) == 1.0


def test_inflow_offsets_drain() -> None:
    r = project(5000, flat(1500), flat(500), CFG, rng())
    assert r.hours == pytest.approx(5.0)
    assert r.prob_within(4) == 0.0 and r.prob_within(5) == 1.0


def test_floor_counts_as_empty() -> None:
    r = project(5500, flat(1000), flat(0), StockoutConfig(n_paths=50, floor_bdt=500), rng())
    assert r.hours == pytest.approx(5.0)


def test_never_runs_out_within_horizon() -> None:
    r = project(1_000_000, flat(100), flat(0), CFG, rng())
    assert r.hours is None
    assert r.confidence == 1.0
    assert float(r.cdf.max()) == 0.0


def test_already_empty() -> None:
    r = project(0, flat(0), flat(0), CFG, rng())
    assert r.hours == 0.0 and r.confidence == 1.0 and float(r.cdf.min()) == 1.0


def test_known_probability_with_full_path_correlation() -> None:
    """rho = 1: one level u per path, demand Q(u) every hour, so T = b / Q(u).

    b = 24,000, q10/q50/q90 = 500/1,000/1,500: T <= 24 iff Q(u) >= 1,000 iff u >= 0.5 -> 0.5.
    T <= 12 needs Q >= 2,000 (u >= 1.3): never. T <= 72 needs Q >= 333 (u >= -0.03): always.
    """
    q = np.tile([500.0, 1000.0, 1500.0], (H, 1))
    r = project(24_000, q, flat(0), StockoutConfig(n_paths=20_000, rho=1.0), rng())
    assert r.prob_within(24) == pytest.approx(0.5, abs=0.02)
    assert r.prob_within(12) == 0.0 and r.prob_within(72) == 1.0
    assert r.hours == pytest.approx(24.0, abs=0.5)


def test_uncertain_paths_are_monotone_and_reproducible() -> None:
    q = np.tile([200.0, 800.0, 1600.0], (H, 1))
    a = project(20_000, q, flat(0), CFG, rng())
    b = project(20_000, q, flat(0), CFG, rng())
    np.testing.assert_array_equal(a.cdf, b.cdf)
    assert a.hours == b.hours and a.confidence == b.confidence
    assert np.all(np.diff(a.cdf) >= 0)
    assert 0 < a.prob_within(24) < 1 and 0 < a.confidence < 1
