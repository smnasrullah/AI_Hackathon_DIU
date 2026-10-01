"""Agent population: 3 distributors, clustered locations, tiers, capacities, refill policy."""

from dataclasses import dataclass, replace
from datetime import date, timedelta

import numpy as np

from app.models.enums import UrbanRural
from app.services.seed import DEMO_AGENTS
from ml.data_gen import demo_spec
from ml.data_gen.geography import CLUSTERS, DISTRIBUTOR_SHARE, REGION_OF, Cluster, cluster_for
from ml.data_gen.timeline import MON, SAT, SUN, THU, TUE, WED


@dataclass(frozen=True)
class AgentSpec:
    code: str
    name: str
    distributor_code: str
    region: str
    district: str
    upazila: str
    area: UrbanRural
    tier: int
    lat: float
    lng: float
    cash_capacity: int
    emoney_capacity: int
    opened_on: date
    # Simulation parameters (not stored in the agents table).
    scale: float = 1.0
    in_bias: float = 1.0
    out_bias: float = 1.0
    cash_target: float = 0.5
    emoney_target: float = 0.5
    refill_weekdays: tuple[int, ...] = ()
    refill_hour: int = 10


TIER_MIX: dict[UrbanRural, list[float]] = {
    UrbanRural.urban: [0.30, 0.45, 0.25],
    UrbanRural.peri_urban: [0.15, 0.45, 0.40],
    UrbanRural.rural: [0.05, 0.35, 0.60],
}
TIER_CAPACITY: dict[int, int] = {1: 400_000, 2: 200_000, 3: 80_000}
# (cash, e-money) refill targets as a share of capacity. Urban agents are net cash-in, so they
# hold more e-money; rural agents are net cash-out, so they hold more cash.
TARGETS: dict[UrbanRural, tuple[float, float]] = {
    UrbanRural.urban: (0.50, 0.65),
    UrbanRural.peri_urban: (0.60, 0.50),
    UrbanRural.rural: (0.75, 0.40),
}
RURAL_VAN_DAYS: tuple[tuple[int, ...], ...] = ((SUN, WED), (MON, THU), (SAT, TUE))
SURNAMES = ("Rahman", "Hossain", "Islam", "Ahmed", "Uddin", "Akter", "Mia", "Khan",
            "Chowdhury", "Sarkar", "Das", "Talukder")
SUFFIXES = ("Telecom", "Store", "Mobile Point", "Enterprise", "General Store", "Traders",
            "Pharmacy", "Varieties")


def refill_policy(area: UrbanRural, rng: np.random.Generator) -> tuple[tuple[int, ...], int]:
    """Urban: bank run Sun-Thu (banks shut Fri/Sat). Peri: 3x a week. Rural: van twice a week."""
    if area is UrbanRural.urban:
        return (SUN, MON, TUE, WED, THU), 10
    if area is UrbanRural.peri_urban:
        return (SUN, TUE, THU), 11
    return RURAL_VAN_DAYS[int(rng.integers(len(RURAL_VAN_DAYS)))], 11


def _offset(c: Cluster, rng: np.random.Generator) -> tuple[float, float]:
    dy, dx = rng.normal(0.0, c.spread_km, size=2)
    lat = c.lat + dy / 111.0
    lng = c.lng + dx / (111.0 * float(np.cos(np.radians(c.lat))))
    return round(lat, 6), round(lng, 6)


def _with_policy(a: AgentSpec, rng: np.random.Generator, jitter: bool) -> AgentSpec:
    days, hour = refill_policy(a.area, rng)
    cash_t, em_t = TARGETS[a.area]
    if jitter:
        cash_t += float(rng.uniform(-0.05, 0.05))
        em_t += float(rng.uniform(-0.05, 0.05))
    return replace(a, refill_weekdays=days, refill_hour=hour, cash_target=cash_t,
                   emoney_target=em_t)


def _pinned(rng: np.random.Generator) -> list[AgentSpec]:
    opened = date(2021, 3, 1)
    seeded = [
        AgentSpec(s.code, s.name, s.distributor_code, s.region, s.district, s.upazila,
                  s.urban_rural, s.tier, s.lat, s.lng, int(s.cash_capacity),
                  int(s.emoney_capacity), opened)
        for s in DEMO_AGENTS
    ]
    donor = AgentSpec(demo_spec.DONOR_AGENT, "Mirpur 11 Bazar Telecom", "DST-DHK", "Dhaka",
                      "Dhaka", "Mirpur", UrbanRural.urban, 1, 23.8155, 90.3660, 450_000, 450_000,
                      date(2019, 7, 1), in_bias=1.5, out_bias=0.65)
    odd = AgentSpec(demo_spec.ANOMALY_AGENT, "Krishi Market Varieties", "DST-DHK", "Dhaka",
                    "Dhaka", "Mohammadpur", UrbanRural.urban, 2, 23.7700, 90.3560, 200_000,
                    200_000, date(2023, 11, 1))
    out = [_with_policy(a, rng, jitter=False) for a in (*seeded, donor, odd)]
    # Mirpur 10 serves garment workers: cash-out heavy. The donor sits on a cash-in market.
    out[0] = replace(out[0], in_bias=0.9, out_bias=1.3)
    out[3] = replace(out[3], cash_target=0.75)
    return out


def _random_agent(code: str, c: Cluster, rng: np.random.Generator) -> AgentSpec:
    tier = int(rng.choice([1, 2, 3], p=TIER_MIX[c.area]))
    cap = TIER_CAPACITY[tier]
    cash_cap = int(round(cap * rng.uniform(0.85, 1.15), -4))
    em_cap = int(round(cash_cap * rng.uniform(0.9, 1.1), -4))
    lat, lng = _offset(c, rng)
    name = f"{c.upazila} {rng.choice(SURNAMES)} {rng.choice(SUFFIXES)}"
    opened = date(2018, 1, 1) + timedelta(days=int(rng.integers(0, 8 * 365)))
    a = AgentSpec(code, name, c.distributor_code, REGION_OF[c.distributor_code], c.district,
                  c.upazila, c.area, tier, lat, lng, cash_cap, em_cap, opened,
                  scale=float(np.clip(rng.lognormal(0.0, 0.3), 0.5, 2.0)),
                  in_bias=float(rng.lognormal(0.0, 0.12)),
                  out_bias=float(rng.lognormal(0.0, 0.12)))
    return _with_policy(a, rng, jitter=True)


def build_agents(n_agents: int, rng: np.random.Generator) -> list[AgentSpec]:
    pinned = _pinned(rng)
    if n_agents < len(pinned) + 2:
        raise ValueError(f"n_agents must be >= {len(pinned) + 2}")
    codes = list(DISTRIBUTOR_SHARE)
    quota = {d: round(n_agents * DISTRIBUTOR_SHARE[d]) for d in codes[:-1]}
    quota[codes[-1]] = n_agents - sum(quota.values())
    agents = list(pinned)
    next_no = len(pinned) + 1
    for d in codes:
        clusters = [c for c in CLUSTERS if c.distributor_code == d]
        w = np.array([c.weight for c in clusters])
        need = quota[d] - sum(1 for a in pinned if a.distributor_code == d)
        for _ in range(max(need, 0)):
            c = clusters[int(rng.choice(len(clusters), p=w / w.sum()))]
            agents.append(_random_agent(f"AGT-{next_no:04d}", c, rng))
            next_no += 1
    return agents


def home_cluster(a: AgentSpec) -> Cluster:
    return cluster_for(a.upazila)
