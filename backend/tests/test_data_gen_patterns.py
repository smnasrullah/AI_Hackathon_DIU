"""Each injected synthetic pattern is present in the generated data (seed 42, 300 agents)."""

from datetime import timedelta

import numpy as np
import pytest

from app.models.enums import EventType, UrbanRural
from app.services.seed import DEMO_AGENTS
from ml.data_gen import calendar_effects as cal
from ml.data_gen import demo_spec
from ml.data_gen.dataset import Dataset, build_dataset
from ml.data_gen.demo_scenario import haversine_km
from ml.data_gen.geography import HAT_WEEKDAY, cluster_for
from ml.data_gen.timeline import (
    END,
    FRI,
    HOLDOUT_START,
    N_DAYS,
    N_HOURS,
    SAT,
    SIM_NOW,
    THU,
    days,
    holdout_mask,
    hour_index,
)

DAYS = days()
WD = np.array([d.weekday() for d in DAYS])
PLAIN = np.array([d.day not in (1, 2, 3, *cal.GARMENT_DAYS)
                  and abs((d - cal.EID_DAY).days) > 8
                  and all(d != h[0] for h in cal.HOLIDAYS) for d in DAYS])


@pytest.fixture(scope="module")
def ds() -> Dataset:
    return build_dataset(42)


def _daily(x: np.ndarray) -> np.ndarray:
    return x.reshape(x.shape[0], N_DAYS, 24).sum(-1)


def _mask(ds: Dataset, area: UrbanRural | None = None, district: str | None = None) -> np.ndarray:
    anomalous = {lab.agent_code for lab in ds.anomalies}
    return np.array([a.code not in anomalous and (area is None or a.area is area)
                     and (district is None or a.district == district) for a in ds.agents])


def _volume(ds: Dataset) -> np.ndarray:
    return ds.floats.served_in + ds.floats.served_out


def test_deterministic_for_fixed_seed() -> None:
    a, b, c = build_dataset(42, 20), build_dataset(42, 20), build_dataset(7, 20)
    assert np.array_equal(a.floats.cash, b.floats.cash)
    assert np.array_equal(a.floats.served_out, b.floats.served_out)
    assert [x.lat for x in a.agents] == [x.lat for x in b.agents]
    assert not np.array_equal(a.floats.served_out, c.floats.served_out)


def test_population(ds: Dataset) -> None:
    assert len(ds.agents) == 300 and len({a.code for a in ds.agents}) == 300
    by_dist = {d: sum(a.distributor_code == d for a in ds.agents)
               for d in ("DST-DHK", "DST-CTG", "DST-SYL")}
    assert by_dist == {"DST-DHK": 110, "DST-CTG": 100, "DST-SYL": 90}
    assert {a.tier for a in ds.agents} == {1, 2, 3}
    assert {a.area for a in ds.agents} == set(UrbanRural)
    for a in ds.agents:
        c = cluster_for(a.upazila)
        assert 20.5 < a.lat < 26.7 and 88.0 < a.lng < 92.7
        assert haversine_km(a.lat, a.lng, c.lat, c.lng) < 4 * c.spread_km + 0.5
    seeded = {s.code: s for s in DEMO_AGENTS}
    for a in ds.agents[:3]:
        assert (a.lat, a.lng, a.tier) == (seeded[a.code].lat, seeded[a.code].lng,
                                          seeded[a.code].tier)


def test_hour_of_day_seasonality(ds: Dataset) -> None:
    vol = _volume(ds)
    for area, peak in ((UrbanRural.urban, range(17, 21)), (UrbanRural.rural, range(9, 13))):
        m = _mask(ds, area)
        by_hour = vol[m].reshape(m.sum(), N_DAYS, 24).sum((0, 1))
        assert by_hour.argmax() in peak
        assert by_hour[:7].sum() / by_hour.sum() < 0.005


def test_weekday_seasonality(ds: Dataset) -> None:
    m = _mask(ds, UrbanRural.urban)
    daily = _daily(_volume(ds)[m])
    fri, thu = daily[:, PLAIN & (WD == FRI)].mean(), daily[:, PLAIN & (WD == THU)].mean()
    assert fri / thu < 0.8
    noon = _volume(ds)[m].reshape(m.sum(), N_DAYS, 24)[:, :, 12:14].sum(-1)
    assert noon[:, PLAIN & (WD == FRI)].mean() / noon[:, PLAIN & (WD == THU)].mean() < 0.5


def test_salary_day_spike(ds: Dataset) -> None:
    m = _mask(ds, UrbanRural.urban)
    out = _daily(ds.floats.served_out[m])
    inn = _daily(ds.floats.served_in[m])
    day1 = np.array([d.day == 1 for d in DAYS])
    assert out[:, day1].mean() / out[:, PLAIN].mean() > 1.8
    assert out[:, day1].sum() / inn[:, day1].sum() > out[:, PLAIN].sum() / inn[:, PLAIN].sum()
    salary = [e for e in ds.events if e.type is EventType.salary and e.district is None]
    assert [e.starts_at.day for e in salary] == [1, 1, 1, 1]


def test_eid_spike_is_cash_out_heavy(ds: Dataset) -> None:
    pre = np.array([-3 <= (d - cal.EID_DAY).days <= -1 for d in DAYS])
    eid = np.array([d == cal.EID_DAY for d in DAYS])
    for area in (UrbanRural.urban, UrbanRural.rural):
        m = _mask(ds, area)
        out, inn = _daily(ds.floats.served_out[m]), _daily(ds.floats.served_in[m])
        assert out[:, pre].mean() / out[:, PLAIN].mean() > 1.8
        assert (out[:, pre].mean() / inn[:, pre].mean()) > (out[:, PLAIN].mean()
                                                           / inn[:, PLAIN].mean())
    urban = _mask(ds, UrbanRural.urban)
    vol = _daily(_volume(ds)[urban])
    assert vol[:, eid].mean() / vol[:, PLAIN].mean() < 0.5
    assert any(e.type is EventType.eid for e in ds.events)


def test_weekly_hat_bazar_per_region(ds: Dataset) -> None:
    m = _mask(ds, UrbanRural.rural, "Sunamganj")
    hat_hours = _volume(ds)[m].reshape(m.sum(), N_DAYS, 24)[:, :, 9:17].sum(-1)
    hat_day = PLAIN & (HAT_WEEKDAY["Sunamganj"] == WD)
    other = PLAIN & ~np.isin(WD, [FRI, SAT, THU])
    assert hat_hours[:, hat_day].mean() / hat_hours[:, other].mean() > 1.4
    hats = [e for e in ds.events if e.type is EventType.hat_bazar]
    for district, weekday in HAT_WEEKDAY.items():
        mine = [e for e in hats if e.district == district]
        assert len(mine) >= 17 and {e.starts_at.weekday() for e in mine} == {weekday}
    regions = {cluster.distributor_code for cluster in map(cluster_for, (
        a.upazila for a in ds.agents if a.district in HAT_WEEKDAY))}
    assert regions == {"DST-DHK", "DST-CTG", "DST-SYL"}


def test_rain_lowers_demand(ds: Dataset) -> None:
    demand = _daily(ds.demand.amt_in + ds.demand.amt_out)
    wet_season = np.array([d.month >= 4 for d in DAYS]) & PLAIN
    ratios: list[float] = []
    for i, a in enumerate(ds.agents):
        if a.area is not UrbanRural.rural or not _mask(ds)[i]:
            continue
        rain = ds.rain[a.district]
        base = demand[i][wet_season & (rain == 0)].mean()
        ratios += list(demand[i][wet_season & (rain >= 30)] / base)
    assert len(ratios) > 50 and float(np.mean(ratios)) < 0.8
    assert any(w.severe for w in ds.weather)
    assert any(e.type is EventType.weather for e in ds.events)


def test_urban_vs_rural(ds: Dataset) -> None:
    fl = ds.floats
    urban, rural = _mask(ds, UrbanRural.urban), _mask(ds, UrbanRural.rural)
    assert fl.served_in[urban].sum() / fl.served_out[urban].sum() > 1.0
    assert fl.served_in[rural].sum() / fl.served_out[rural].sum() < 0.7
    biz = ds.demand.lam_out > 0
    rural_rate = (fl.unmet_out[rural] > 0)[biz[rural]].mean()
    urban_rate = (fl.unmet_out[urban] > 0)[biz[urban]].mean()
    assert rural_rate > urban_rate
    overall = ((fl.unmet_out > 0) | (fl.unmet_in > 0))[biz].mean()
    assert 0.005 < overall < 0.08


def test_scheduled_refills_and_float_conservation(ds: Dataset) -> None:
    fl = ds.floats
    wd = np.repeat(WD, 24)
    for i, a in enumerate(ds.agents):
        sched = fl.scheduled[i]
        assert sched.sum() > 0
        assert set(np.unique(wd[sched])) <= set(a.refill_weekdays)
        if a.area is UrbanRural.urban:
            assert not np.isin(wd[sched], [FRI, SAT]).any()
    eid_closed = hour_index(SIM_NOW.replace(month=3, day=20, hour=0))
    assert not fl.scheduled[:, eid_closed:eid_closed + 24].any()
    # Between refills, cash + e-money is conserved and each float follows the flows.
    nxt = ~fl.refill[:, 1:]
    cash_step = fl.cash[:, :-1] + fl.served_in[:, :-1] - fl.served_out[:, :-1]
    assert np.allclose(fl.cash[:, 1:][nxt], cash_step[nxt], atol=1.0)
    total = fl.cash + fl.emoney
    assert np.allclose(total[:, 1:][nxt], total[:, :-1][nxt], atol=1.0)
    assert (fl.cash >= -1e-6).all() and (fl.emoney >= -1e-6).all()


def test_anomalous_agents(ds: Dataset) -> None:
    labels = ds.anomalies
    assert len(labels) == 9 and len({lab.agent_code for lab in labels}) == 9
    assert {lab.kind for lab in labels} == {"night_structuring", "volume_burst", "circular_flow"}
    assert any(lab.window_start >= HOLDOUT_START for lab in labels)
    assert any(lab.window_end <= HOLDOUT_START for lab in labels)
    fl = ds.floats
    normal_night = fl.cnt_in[_mask(ds)].reshape(-1, N_DAYS, 24)[:, :, :5].sum()
    for lab in labels:
        i = ds.index(lab.agent_code)
        h0, h1 = hour_index(lab.window_start), hour_index(lab.window_end)
        cnt = fl.cnt_in[i] + fl.cnt_out[i]
        inside = np.zeros(N_HOURS, dtype=bool)
        inside[h0:h1] = True
        if lab.kind == "night_structuring":
            night = np.isin(np.arange(N_HOURS) % 24, [0, 1, 2, 3, 4])
            assert cnt[inside & night].sum() > 100 and normal_night == 0
        elif lab.kind == "volume_burst":
            vol = _volume(ds)[i]
            per_day_in = vol[inside].sum() / ((h1 - h0) / 24)
            per_day_out = vol[~inside].sum() / ((N_HOURS - (h1 - h0)) / 24)
            assert per_day_in / per_day_out > 2.5
        else:
            per_h_in = cnt[inside].sum() / inside.sum()
            per_h_out = cnt[~inside].sum() / (~inside).sum()
            assert per_h_in / per_h_out > 2.5


def test_holdout_is_last_14_days(ds: Dataset) -> None:
    hold = holdout_mask()
    assert hold.sum() == 14 * 24 and hold[-1] and not hold[-14 * 24 - 1]
    assert HOLDOUT_START.date().isoformat() == "2026-04-21"
    assert HOLDOUT_START <= SIM_NOW and SIM_NOW + timedelta(hours=72) <= END


def test_demo_stockout_tomorrow_1540(ds: Dataset) -> None:
    i = ds.index(demo_spec.STOCKOUT_AGENT)
    fl, d = ds.floats, ds.demand
    t_s, t_c = hour_index(SIM_NOW), hour_index(demo_spec.STOCKOUT_AT.replace(minute=0))
    assert demo_spec.STOCKOUT_AT.date() == (SIM_NOW + timedelta(days=1)).date()
    assert demo_spec.STOCKOUT_AT.day == 1  # salary day
    assert (fl.cash[i, t_s:t_c + 1] > 0).all()
    assert not fl.refill[i, t_s:t_c + 1].any()
    minutes = fl.cash[i, t_c] / (d.amt_out[i, t_c] - d.amt_in[i, t_c]) * 60
    assert abs(minutes - 40) < 1
    end_cash = fl.cash[i, t_c] + fl.served_in[i, t_c] - fl.served_out[i, t_c]
    assert abs(end_cash) < 1 and fl.unmet_out[i, t_c] > 0
    # Not obviously low tonight: a naive 20%-of-capacity rule would stay silent.
    assert fl.cash[i, t_s] > 0.2 * ds.agents[i].cash_capacity


def test_demo_donor_and_anomaly(ds: Dataset) -> None:
    r = ds.agents[ds.index(demo_spec.STOCKOUT_AGENT)]
    dn = ds.agents[ds.index(demo_spec.DONOR_AGENT)]
    assert dn.distributor_code == r.distributor_code
    assert haversine_km(r.lat, r.lng, dn.lat, dn.lng) < 2.0
    t_s = hour_index(SIM_NOW)
    donor_cash = ds.floats.cash[ds.index(demo_spec.DONOR_AGENT), t_s:t_s + 25]
    assert donor_cash.min() >= demo_spec.DONOR_MIN_CASH
    assert donor_cash.min() > ds.demo["stockout"]["shortfall_rest_of_day"]
    lab = next(x for x in ds.anomalies if x.agent_code == demo_spec.ANOMALY_AGENT)
    assert lab.window_end == SIM_NOW
    assert ds.agents[ds.index(lab.agent_code)].distributor_code == r.distributor_code
