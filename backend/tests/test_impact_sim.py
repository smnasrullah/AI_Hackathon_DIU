"""Impact replay on hand-made tiny worlds (exact answers).

World hour 0 = 20:00 Dhaka. Customers cash out 10,000 BDT per hour from 08:00 to 17:00 next day
(world hours 12..21, 100,000 BDT in all); no cash-in. Cash refills target 50,000 of 100,000.
"""

from datetime import UTC, datetime

import numpy as np

from app.models.enums import FloatType
from app.models.enums import RecommendationChannel as Channel
from app.rules.channel_rules import ChannelConfig
from app.rules.impact_rules import ImpactConfig
from app.rules.rebalance_rules import RebalanceConfig
from app.rules.swap_rules import SwapConfig
from app.services.impact import tally
from app.services.impact_policies import AiPolicy, BaselinePolicy, Forecasts
from app.services.impact_sim import Delivery, Site, World, run

START = datetime(2026, 4, 21, 14, tzinfo=UTC)  # 20:00 Dhaka
HOURS = 36
DEMAND = 10_000.0
CFG = ImpactConfig()
RCFG, SCFG, CCFG = RebalanceConfig(), SwapConfig(), ChannelConfig()


def _world(cash0: list[float], em0: list[float], busy: list[bool]) -> World:
    n = len(cash0)
    hod = (20 + np.arange(HOURS)) % 24
    open_ = ((hod >= 8) & (hod < 18)).astype(float)
    # Agents 0.1 km apart, one distributor, distributor point unknown (no self-fetch).
    sites = [Site(i + 1, 7, 23.8000 + 0.0009 * i, 90.3700, None) for i in range(n)]
    return World(
        sites=sites, start=START, hod=hod, cash_cap=np.full(n, 100_000.0),
        em_cap=np.full(n, 100_000.0), demand_in=np.zeros((n, HOURS)),
        demand_out=np.outer([DEMAND if b else 0.0 for b in busy], open_),
        scheduled=np.zeros((n, HOURS), dtype=bool), cash_target=np.full((n, HOURS), 50_000.0),
        em_target=np.full(n, 50_000.0), cash0=np.array(cash0), em0=np.array(em0))


def _perfect(w: World, at: tuple[int, ...] = (0,)) -> Forecasts:
    """Flat-band forecast equal to the true demand, from each round over 24 h."""
    out: Forecasts = {}
    for t in at:
        span = slice(t, t + 24)
        out[t] = {"cash_out": np.repeat(w.demand_out[:, span, None], 3, axis=2),
                  "cash_in": np.repeat(w.demand_in[:, span, None], 3, axis=2)}
    return out


class _Nothing:
    def decide(self, t: int, cash: np.ndarray, em: np.ndarray, pending: np.ndarray
               ) -> list[Delivery]:
        return []


def _stockout_hours(w: World, policy: object) -> tuple[list[int], float, list[Delivery]]:
    o = run(w, policy)  # type: ignore[arg-type]
    hit = (o.unmet_out + o.unmet_in) > 0.5
    return np.flatnonzero(hit.any(axis=0)).tolist(), float(o.unmet_out.sum()), o.deliveries


def test_nothing_done_runs_dry() -> None:
    w = _world([30_000], [50_000], [True])
    hours, lost, _ = _stockout_hours(w, _Nothing())
    assert hours == list(range(15, 22)) and lost == 70_000


def test_baseline_alerts_late_and_runs_dry_twice() -> None:
    w = _world([30_000], [50_000], [True])
    hours, lost, deliveries = _stockout_hours(w, BaselinePolicy(w, CFG, CCFG.topup_eta_h))
    # 10:00 alert (10,000 < 20,000) lands 13:00; 16:00 alert lands 19:00, after closing demand.
    assert hours == [15, 16, 21] and lost == 30_000
    assert [(d.ordered, d.arrive, d.amount, d.channel) for d in deliveries] == [
        (14, 17, 40_000, Channel.urgent_manual), (20, 23, 40_000, Channel.urgent_manual)]
    assert len({d.trip for d in deliveries}) == 2


def test_ai_orders_the_evening_before() -> None:
    w = _world([30_000], [50_000], [True])
    hours, lost, deliveries = _stockout_hours(
        w, AiPolicy(w, _perfect(w), CFG, RCFG, SCFG, CCFG))
    assert hours == [] and lost == 0
    (d,) = deliveries
    # Need 100,000 vs 30,000 held: shortfall + buffer capped at free capacity (70,000);
    # 70,000 is below a van batch and no distributor point -> emergency, lands at 08:00.
    assert (d.ordered, d.arrive, d.amount, d.channel, d.float_type) == (
        0, 12, 70_000, Channel.urgent_manual, FloatType.cash)


def test_ai_counts_in_flight_deliveries() -> None:
    w = _world([30_000], [50_000], [True])
    _, _, deliveries = _stockout_hours(w, AiPolicy(w, _perfect(w, (0, 9)), CFG, RCFG, SCFG,
                                                   CCFG))
    # 20:00 orders (the 05:00 round would leave 3 h < van lead time); 05:00 sees the 70,000
    # still on its way and orders nothing more.
    assert [(d.ordered, d.amount) for d in deliveries] == [(0, 70_000)]


def test_ai_waits_for_the_next_round_when_there_is_time() -> None:
    w = _world([30_000], [50_000], [True])
    _, _, deliveries = _stockout_hours(w, AiPolicy(w, _perfect(w, (0, 2)), CFG, RCFG, SCFG,
                                                   CCFG))
    assert [d.ordered for d in deliveries] == [2]


def test_ai_swaps_with_a_neighbour_instead_of_a_van() -> None:
    w = _world([30_000, 100_000], [80_000, 50_000], [True, False])
    hours, lost, deliveries = _stockout_hours(
        w, AiPolicy(w, _perfect(w), CFG, RCFG, SCFG, CCFG))
    (d,) = deliveries
    assert (d.channel, d.row, d.donor, d.amount, d.trip, d.arrive) == (
        Channel.swap, 0, 1, 70_000, None, 12)
    assert hours == [] and lost == 0


def test_tally_by_distributor_and_day() -> None:
    w = _world([30_000], [50_000], [True])
    cells = tally(w, run(w, BaselinePolicy(w, CFG, CCFG.topup_eta_h)))
    assert sorted(cells) == [(7, 0)]  # 36 h -> one whole day
    c = cells[(7, 0)]
    assert (c.n_agents, c.stockout_hours, c.stockout_cash_h, c.lost_out, len(c.trips)) == (
        1, 3, 3, 30_000, 2)
    assert c.actions == {"urgent_manual": 2}
