"""Channel rule branches on hand-made shortages (0.01 deg latitude ~ 1.11 km)."""

import pytest

from app.models.enums import FloatType
from app.models.enums import RecommendationChannel as Ch
from app.rules.channel_rules import ChannelConfig, Shortage, SwapCover, choose

CFG = ChannelConfig(van_min_batch_amount_bdt=100_000, van_lead_time_h=4, van_cluster_radius_km=10,
                    van_cost_per_trip_bdt=1_500, topup_fee_pct=0.5, self_fetch_max_km=10,
                    self_fetch_speed_kmh=15, travel_cost_per_km_bdt=10,
                    urgent_manual_cost_bdt=2_500)
LAT, LNG = 23.80, 90.37


def _s(key: int, amount: float = 30_000, hours: float = 6.0, lat_off: float = 0.0,
       dist: int = 1, ft: FloatType = FloatType.cash, hub_km: float | None = 50.0,
       swap: SwapCover | None = None) -> Shortage:
    return Shortage(key=key, distributor_id=dist, lat=LAT + lat_off, lng=LNG, float_type=ft,
                    amount=amount, hours_to_deadline=hours, hub_km=hub_km, swap=swap)


def test_emoney_is_always_top_up_never_van() -> None:
    # Big enough and early enough for a van, near a hub, but e-money goes digitally.
    c = choose([_s(1, amount=200_000, ft=FloatType.emoney, hub_km=1.0)], CFG)[1]
    assert c.channel == Ch.top_up and c.van_route_id is None
    alts = {a.channel: a for a in c.alternatives}
    assert c.alternatives[0].channel == Ch.top_up
    assert alts[Ch.top_up].est_cost_bdt == 1_000  # 0.5% of 200,000
    assert not alts[Ch.van].feasible and "never goes by van" in alts[Ch.van].reason
    assert [(t.rule, t.passed) for t in c.trace] == [("emoney_top_up", True)]


def test_covering_swap_wins_over_van() -> None:
    cover = SwapCover(swap_id=7, amount=60_000, distance_km=2.0)
    shortages = [_s(1, amount=60_000, swap=cover), _s(2, amount=60_000, lat_off=0.01)]
    out = choose(shortages, CFG)
    assert out[1].channel == Ch.swap
    swap_alt = out[1].alternatives[0]
    assert swap_alt.est_cost_bdt == 20 and "swap #7" in swap_alt.reason  # 2 km x 10 BDT
    # The covered agent is not clustered, so 60,000 alone stays under the van batch.
    assert out[2].channel == Ch.urgent_manual


def test_partial_swap_falls_through() -> None:
    cover = SwapCover(swap_id=7, amount=20_000, distance_km=2.0)
    c = choose([_s(1, amount=60_000, swap=cover, hub_km=3.0)], CFG)[1]
    assert c.channel == Ch.self_fetch
    assert [(t.rule, t.passed) for t in c.trace] == [
        ("emoney_top_up", False), ("swap_covers", False), ("van_batch", False),
        ("self_fetch", True)]


@pytest.mark.parametrize(("amounts", "van"), [((50_000, 50_000), True),
                                              ((50_000, 49_500), False)])
def test_van_batch_threshold(amounts: tuple[float, float], van: bool) -> None:
    out = choose([_s(1, amount=amounts[0]), _s(2, amount=amounts[1], lat_off=0.02)], CFG)
    channels = {out[k].channel for k in (1, 2)}
    if van:
        assert channels == {Ch.van}
        assert out[1].van_route_id == out[2].van_route_id == "VAN-D1-01"
        assert out[1].alternatives[0].est_cost_bdt == 750  # one trip split by 2
    else:
        assert channels == {Ch.urgent_manual}
        assert "99,500 BDT vs minimum batch 100,000 BDT" in out[1].trace[2].detail


def test_van_clusters_by_distributor_radius_and_lead_time() -> None:
    out = choose([
        _s(1, amount=80_000),
        _s(2, amount=30_000, lat_off=0.05),  # ~5.6 km: joins cluster 1
        _s(3, amount=80_000, lat_off=0.30),  # ~33 km: own cluster, too small
        _s(4, amount=60_000, dist=2),  # other distributor
        _s(5, amount=60_000, dist=2, lat_off=0.01, hours=3.0),  # cannot wait for a van
        _s(6, amount=120_000, lat_off=0.60),  # far, but big enough alone: second trip
    ], CFG)
    assert out[1].channel == out[2].channel == Ch.van
    assert out[6].channel == Ch.van
    assert out[6].van_route_id == "VAN-D1-01"  # largest amount seeds first
    assert out[1].van_route_id == out[2].van_route_id == "VAN-D1-02"
    assert {out[k].channel for k in (3, 4, 5)} == {Ch.urgent_manual}
    assert "< van lead time" in {a.channel: a for a in out[5].alternatives}[Ch.van].reason


def test_self_fetch_needs_range_and_time() -> None:
    out = choose([_s(1, hours=2.0, hub_km=3.0),  # round trip 0.4 h
                  _s(2, hours=0.2, hub_km=3.0, lat_off=1.0),  # round trip too long
                  _s(3, hours=2.0, hub_km=12.0, lat_off=2.0),  # beyond max km
                  _s(4, hours=2.0, hub_km=None, lat_off=3.0)], CFG)
    assert out[1].channel == Ch.self_fetch
    first = out[1].alternatives[0]
    assert (first.est_cost_bdt, first.eta_h) == (60, 0.4)
    assert {out[k].channel for k in (2, 3, 4)} == {Ch.urgent_manual}


def test_urgent_manual_ranks_alternatives() -> None:
    c = choose([_s(1, hours=0.0, hub_km=3.0)], CFG)[1]
    assert c.channel == Ch.urgent_manual
    ranked = [a.channel for a in c.alternatives]
    assert ranked[0] == Ch.urgent_manual and set(ranked) == set(Ch)
    assert not any(a.feasible for a in c.alternatives[1:])
    assert c.trace[-1].rule == "urgent_manual"


def test_config_rejects_negative_costs() -> None:
    with pytest.raises(ValueError):
        ChannelConfig(van_cost_per_trip_bdt=-1)
