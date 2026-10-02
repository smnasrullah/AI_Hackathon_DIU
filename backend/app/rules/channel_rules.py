"""Delivery channel per recommendation: swap, top_up, van, self_fetch or urgent_manual.

Checked in order, first match wins:
 1. e-money shortage -> top_up (digital, instant; never a van).
 2. cash, and a pending/approved swap covers the whole amount -> swap.
 3. cash, no covering swap: receivers that can wait for a van (time to deadline >= van lead
    time) are greedily clustered per distributor (largest amount seeds a cluster; every other
    unassigned receiver within the radius of the seed joins). Cluster total >= minimum batch
    -> van, one trip (van_route_id) per cluster.
 4. distributor point within the self-fetch range and the round trip fits the deadline
    -> self_fetch.
 5. otherwise -> urgent_manual (call the distributor).
Every channel is also scored as an alternative (est. cost, ETA, reason) so the choice is
explainable. Costs come from ChannelConfig (settings). Advisory only: nothing moves money.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.models.enums import FloatType
from app.models.enums import RecommendationChannel as Channel
from app.rules.swap_rules import haversine_km


@dataclass(frozen=True)
class ChannelConfig:
    van_min_batch_amount_bdt: float = 100_000.0  # one van trip is worth it from this total
    van_lead_time_h: float = 4.0  # time from booking a van to its arrival
    van_cluster_radius_km: float = 10.0  # receivers this close to the seed share a trip
    van_cost_per_trip_bdt: float = 1_500.0  # split evenly across the cluster
    topup_fee_pct: float = 0.5  # e-money top-up fee, % of the amount
    topup_eta_h: float = 0.25
    self_fetch_max_km: float = 10.0  # agent to distributor point, one way
    self_fetch_speed_kmh: float = 15.0  # local road speed for self-fetch and swap hand-over
    travel_cost_per_km_bdt: float = 10.0
    urgent_manual_cost_bdt: float = 2_500.0  # dedicated emergency delivery

    def __post_init__(self) -> None:
        if self.self_fetch_speed_kmh <= 0:
            raise ValueError("self-fetch speed must be > 0")
        if min(self.van_min_batch_amount_bdt, self.van_lead_time_h, self.van_cluster_radius_km,
               self.van_cost_per_trip_bdt, self.topup_fee_pct, self.topup_eta_h,
               self.self_fetch_max_km, self.travel_cost_per_km_bdt,
               self.urgent_manual_cost_bdt) < 0:
            raise ValueError("channel thresholds and costs must be >= 0")


@dataclass(frozen=True)
class SwapCover:
    swap_id: int
    amount: float
    distance_km: float


@dataclass(frozen=True)
class Shortage:
    key: int  # caller's id for the result
    distributor_id: int
    lat: float
    lng: float
    float_type: FloatType
    amount: float
    hours_to_deadline: float
    hub_km: float | None  # agent to its distributor point; None = unknown
    swap: SwapCover | None = None


@dataclass(frozen=True)
class Alternative:
    channel: Channel
    feasible: bool
    est_cost_bdt: float | None
    eta_h: float | None
    reason: str


@dataclass(frozen=True)
class Step:
    rule: str
    passed: bool
    detail: str


@dataclass(frozen=True)
class Choice:
    channel: Channel
    van_route_id: str | None
    alternatives: list[Alternative]  # chosen first, then feasible by cost, then infeasible
    trace: list[Step] = field(default_factory=list)


@dataclass(frozen=True)
class _Cluster:
    route_id: str
    total: float
    size: int


def _bdt(v: float) -> str:
    return f"{v:,.0f} BDT"


def _clusters(shortages: Sequence[Shortage], cfg: ChannelConfig) -> dict[int, _Cluster]:
    """Greedy van clusters over the given cash receivers; only clusters reaching the batch."""
    out: dict[int, _Cluster] = {}
    by_dist: dict[int, list[Shortage]] = {}
    for s in shortages:
        by_dist.setdefault(s.distributor_id, []).append(s)
    for dist_id in sorted(by_dist):
        left = sorted(by_dist[dist_id], key=lambda s: (-s.amount, s.key))
        trip = 0
        while left:
            seed = left[0]
            members = [s for s in left if s is seed or haversine_km(
                seed.lat, seed.lng, s.lat, s.lng) <= cfg.van_cluster_radius_km]
            left = [s for s in left if s not in members]
            total = sum(s.amount for s in members)
            if total >= cfg.van_min_batch_amount_bdt:
                trip += 1
                cluster = _Cluster(f"VAN-D{dist_id}-{trip:02d}", total, len(members))
                out |= {s.key: cluster for s in members}
            else:
                out |= {s.key: _Cluster("", total, len(members)) for s in members}
    return out


def _travel(km: float, cfg: ChannelConfig) -> tuple[float, float]:
    """Round trip: (cost, hours)."""
    return 2 * km * cfg.travel_cost_per_km_bdt, 2 * km / cfg.self_fetch_speed_kmh


def _alternatives(s: Shortage, cluster: _Cluster | None, cfg: ChannelConfig
                  ) -> dict[Channel, Alternative]:
    cash = s.float_type == FloatType.cash
    fee = s.amount * cfg.topup_fee_pct / 100
    alts = {Channel.top_up: Alternative(
        Channel.top_up, not cash, round(fee, 2), cfg.topup_eta_h,
        "physical cash cannot be sent digitally" if cash
        else f"digital e-money top-up, fee {cfg.topup_fee_pct}%")}
    if s.swap is None:
        alts[Channel.swap] = Alternative(Channel.swap, False, None, None,
                                         "no pending or approved swap partner")
    else:
        cost, hours = _travel(s.swap.distance_km / 2, cfg)
        covers = cash and s.swap.amount >= s.amount
        alts[Channel.swap] = Alternative(
            Channel.swap, covers, round(cost, 2), round(hours, 2),
            f"swap #{s.swap.swap_id} gives {_bdt(s.swap.amount)} of {_bdt(s.amount)} at "
            f"{s.swap.distance_km:.1f} km")
    van_ok = cash and cluster is not None and bool(cluster.route_id)
    share = cfg.van_cost_per_trip_bdt / (cluster.size if cluster else 1)
    if not cash:
        van_reason = "e-money never goes by van"
    elif s.hours_to_deadline < cfg.van_lead_time_h:
        van_reason = (f"{s.hours_to_deadline:.1f} h to deadline < van lead time "
                      f"{cfg.van_lead_time_h:g} h")
    elif cluster is not None:
        route = f" on {cluster.route_id}" if cluster.route_id else ""
        van_reason = (f"cluster of {cluster.size}{route} needs {_bdt(cluster.total)} vs minimum "
                      f"batch {_bdt(cfg.van_min_batch_amount_bdt)}")
    else:
        van_reason = "already covered by a swap"
    alts[Channel.van] = Alternative(Channel.van, van_ok, round(share, 2), cfg.van_lead_time_h,
                                    van_reason)
    if s.hub_km is None:
        alts[Channel.self_fetch] = Alternative(Channel.self_fetch, False, None, None,
                                               "distributor point location unknown")
    else:
        cost, hours = _travel(s.hub_km, cfg)
        fits = cash and s.hub_km <= cfg.self_fetch_max_km and hours <= s.hours_to_deadline
        alts[Channel.self_fetch] = Alternative(
            Channel.self_fetch, fits, round(cost, 2), round(hours, 2),
            f"distributor point {s.hub_km:.1f} km away (max {cfg.self_fetch_max_km:g} km), "
            f"round trip {hours:.1f} h vs {s.hours_to_deadline:.1f} h to deadline")
    alts[Channel.urgent_manual] = Alternative(
        Channel.urgent_manual, True, cfg.urgent_manual_cost_bdt, None,
        "call the distributor for an emergency delivery")
    return alts


def _rank(chosen: Channel, alts: dict[Channel, Alternative]) -> list[Alternative]:
    rest = sorted((a for c, a in alts.items() if c != chosen),
                  key=lambda a: (not a.feasible, a.est_cost_bdt is None, a.est_cost_bdt or 0.0,
                                 a.channel.value))
    return [alts[chosen], *rest]


def _decide(s: Shortage, cluster: _Cluster | None, alts: dict[Channel, Alternative]) -> Choice:
    trace: list[Step] = []
    emoney = s.float_type == FloatType.emoney
    trace.append(Step("emoney_top_up", emoney, f"{s.float_type.value} shortage"))
    if emoney:
        return Choice(Channel.top_up, None, _rank(Channel.top_up, alts), trace)
    order = ((Channel.swap, "swap_covers"), (Channel.van, "van_batch"),
             (Channel.self_fetch, "self_fetch"))
    for channel, rule in order:
        alt = alts[channel]
        trace.append(Step(rule, alt.feasible, alt.reason))
        if alt.feasible:
            route = cluster.route_id if channel == Channel.van and cluster else None
            return Choice(channel, route, _rank(channel, alts), trace)
    trace.append(Step("urgent_manual", True, alts[Channel.urgent_manual].reason))
    return Choice(Channel.urgent_manual, None, _rank(Channel.urgent_manual, alts), trace)


def _covered(s: Shortage) -> bool:
    return s.swap is not None and s.swap.amount >= s.amount


def choose(shortages: Sequence[Shortage], cfg: ChannelConfig) -> dict[int, Choice]:
    """Channel per shortage key."""
    can_wait = [s for s in shortages if s.float_type == FloatType.cash and not _covered(s)
                and s.hours_to_deadline >= cfg.van_lead_time_h]
    clusters = _clusters(can_wait, cfg)
    out: dict[int, Choice] = {}
    for s in shortages:
        cluster = clusters.get(s.key)
        out[s.key] = _decide(s, cluster, _alternatives(s, cluster, cfg))
    return out
