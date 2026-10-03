import numpy as np
import pytest

from app.models.enums import FloatType
from app.rules.swap_rules import Donor, Receiver, SwapConfig, haversine_km, match

CASH, EM = FloatType.cash, FloatType.emoney
KM = 1 / 111.195  # degrees of longitude per km at the equator
CFG = SwapConfig(radius_km=5, min_amount_bdt=5_000)


def _d(agent: int, x_km: float, cash: float = 100_000, dist: int = 1) -> Donor:
    return Donor(agent, dist, 0.0, x_km * KM, {CASH: cash, EM: 0.0})


def _r(agent: int, x_km: float, need: float = 20_000, dist: int = 1,
       ft: FloatType = CASH) -> Receiver:
    return Receiver(agent, dist, 0.0, x_km * KM, ft, need)


def test_haversine_known_distances() -> None:
    assert haversine_km(0, 0, 1, 0) == pytest.approx(111.195, abs=0.01)
    # Mirpur 10 -> Uttara (Dhaka), about 7.7 km.
    assert haversine_km(23.8069, 90.3687, 23.8759, 90.3795) == pytest.approx(7.75, abs=0.1)


def test_assignment_minimises_total_distance() -> None:
    # Greedy (R1 -> nearest D1) costs 1 + 4 km; the optimum swaps partners for 2 + 1 km.
    found = match([_d(1, 0), _d(2, 3)], [_r(10, 1), _r(11, -1)], CFG)
    assert {(m.donor.agent_id, m.receiver.agent_id) for m in found} == {(2, 10), (1, 11)}
    assert sum(m.distance_km for m in found) == pytest.approx(3, abs=0.01)


def test_pinned_receiver_keeps_its_only_donor() -> None:
    # Live-data shape: one donor, the demo receiver ~1 km away, a stranger 0.27 km away.
    donor, demo, stranger = _d(1, 0), _r(10, 1), _r(11, 0.27)
    (plain,) = match([donor], [demo, stranger], CFG)
    assert plain.receiver.agent_id == 11  # distance alone hands the donor to the stranger
    (pinned,) = match([donor], [demo, stranger], CFG, first=frozenset({10}))
    assert (pinned.donor.agent_id, pinned.receiver.agent_id) == (1, 10)
    # The stranger still gets the donor left over.
    found = match([donor, _d(2, 0.5)], [demo, stranger], CFG, first=frozenset({10}))
    assert {(m.donor.agent_id, m.receiver.agent_id) for m in found} == {(2, 10), (1, 11)}


def test_infeasible_pairs_are_never_matched() -> None:
    assert match([_d(1, 6)], [_r(10, 0)], CFG) == []  # outside radius
    assert match([_d(1, 1, dist=2)], [_r(10, 0)], CFG) == []  # other distributor
    assert match([_d(1, 1, cash=4_999)], [_r(10, 0)], CFG) == []  # below minimum
    assert match([_d(1, 1)], [_r(10, 0, ft=EM)], CFG) == []  # no surplus in that float
    assert match([], [_r(10, 0)], CFG) == [] and match([_d(1, 0)], [], CFG) == []


def test_amount_is_capped_by_surplus_and_full_cover_saves_a_van() -> None:
    (full,) = match([_d(1, 1, cash=50_000)], [_r(10, 0, need=20_000)], CFG)
    assert full.amount == 20_000 and full.van_trip_saved and full.score == 0.8
    (part,) = match([_d(1, 1, cash=12_345)], [_r(10, 0, need=20_000)], CFG)
    assert part.amount == 12_000 and not part.van_trip_saved


def test_random_markets_respect_every_rule() -> None:
    rng = np.random.default_rng(42)
    donors = [Donor(i, int(rng.integers(1, 3)), float(rng.uniform(0, 0.08)),
                    float(rng.uniform(0, 0.08)),
                    {CASH: float(rng.uniform(0, 60_000)), EM: float(rng.uniform(0, 60_000))})
              for i in range(40)]
    receivers = [Receiver(100 + i, int(rng.integers(1, 3)), float(rng.uniform(0, 0.08)),
                          float(rng.uniform(0, 0.08)), CASH if i % 2 else EM,
                          float(rng.uniform(5_000, 80_000))) for i in range(40)]
    found = match(donors, receivers, CFG)
    assert found
    for m in found:
        assert m.amount <= m.donor.surplus[m.receiver.float_type]
        assert m.amount <= m.receiver.need and m.amount >= CFG.min_amount_bdt
        assert m.amount % 500 == 0
        d = haversine_km(m.donor.lat, m.donor.lng, m.receiver.lat, m.receiver.lng)
        assert d <= CFG.radius_km and m.distance_km == round(d, 2)
        assert m.donor.distributor_id == m.receiver.distributor_id
    assert len({m.donor.agent_id for m in found}) == len(found)
    assert len({m.receiver.agent_id for m in found}) == len(found)
