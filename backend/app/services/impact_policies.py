"""The two policies the impact backtest compares (rules: app/rules/impact_rules.py)."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from app.models.enums import FLOAT_DEMAND, FloatType
from app.models.enums import RecommendationChannel as Channel
from app.rules.channel_rules import ChannelConfig, Shortage, SwapCover, choose
from app.rules.impact_rules import (
    ImpactConfig,
    arrival,
    baseline_alerts,
    dispatch_now,
    is_open,
    refill_amount,
)
from app.rules.rebalance_rules import Advice, RebalanceConfig, advise, assess
from app.rules.swap_rules import Donor, Match, Receiver, SwapConfig, match
from app.services.impact_sim import FLOATS, Delivery, World

INFLOW_OF = {FloatType.cash: FloatType.emoney, FloatType.emoney: FloatType.cash}
Forecasts = dict[int, dict[str, np.ndarray]]  # world hour -> target -> (A, H, 3) BDT
_HOUR = timedelta(hours=1)


@dataclass
class BaselinePolicy:
    """Fixed-threshold alert -> refill to target: cash by dedicated van, e-money by top-up."""

    w: World
    cfg: ImpactConfig
    topup_eta_h: float

    def decide(self, t: int, cash: np.ndarray, em: np.ndarray, pending: np.ndarray
               ) -> list[Delivery]:
        hod = int(self.w.hod[t])
        if not is_open(hod, self.cfg):
            return []
        out: list[Delivery] = []
        for fi, ft in enumerate(FLOATS):
            bal, cap = (cash, em)[fi], self.w.capacity(ft)
            target = self.w.cash_target[:, t] if ft == FloatType.cash else self.w.em_target
            for r in np.flatnonzero(baseline_alerts(bal, cap, pending[:, fi], self.cfg)).tolist():
                amount = min(refill_amount(bal[r], target[r]), cap[r] - bal[r])
                if amount <= 0:
                    continue
                if ft == FloatType.cash:
                    land = arrival(t, self.cfg.emergency_eta_h, hod, True, self.cfg)
                    out.append(Delivery(t, land, r, ft, amount, Channel.urgent_manual,
                                        f"B{t}-{r}"))
                else:
                    land = arrival(t, self.topup_eta_h, hod, False, self.cfg)
                    out.append(Delivery(t, land, r, ft, amount, Channel.top_up))
        return out


@dataclass(frozen=True)
class _Order:
    row: int
    float_type: FloatType
    advice: Advice


@dataclass
class AiPolicy:
    """Forecast -> rebalance recommendation -> swap matching -> delivery channel, each round."""

    w: World
    forecasts: Forecasts
    cfg: ImpactConfig
    rcfg: RebalanceConfig
    scfg: SwapConfig
    ccfg: ChannelConfig

    def decide(self, t: int, cash: np.ndarray, em: np.ndarray, pending: np.ndarray
               ) -> list[Delivery]:
        fc = self.forecasts.get(t)
        if fc is None:
            return []
        now = self.w.start + t * _HOUR
        wait = min((h for h in self.forecasts if h > t), default=self.w.n_hours) - t
        orders: list[_Order] = []
        surplus: dict[int, dict[FloatType, float]] = {}
        for r in range(len(self.w.sites)):
            for fi, ft in enumerate(FLOATS):
                held = float((cash, em)[fi][r])
                drain = fc[FLOAT_DEMAND[ft].value][r]
                inflow = fc[FLOAT_DEMAND[INFLOW_OF[ft]].value][r]
                # In-flight deliveries count towards the need, not towards what can be given.
                need = assess(held + pending[r, fi], float(self.w.capacity(ft)[r]),
                              drain[:, 2], inflow[:, 0], self.rcfg)
                surplus.setdefault(r, {})[ft] = max(0.0, held - need.peak_drain - need.buffer)
                advice = advise(need, now, None, self.rcfg)
                lead = self.ccfg.van_lead_time_h if ft == FloatType.cash else self.ccfg.topup_eta_h
                if advice is not None and advice.amount > 0 and dispatch_now(
                        (advice.deadline_at - now) / _HOUR, wait, lead):
                    orders.append(_Order(r, ft, advice))
        return self._deliveries(t, now, orders, surplus)

    def _swaps(self, orders: Sequence[_Order], surplus: dict[int, dict[FloatType, float]]
               ) -> dict[int, Match]:
        """Receiver row -> swap, for cash orders (e-money is topped up digitally)."""
        sites = self.w.sites
        receivers = {o.row for o in orders if o.float_type == FloatType.cash}
        found = match(
            [Donor(s.agent_id, s.distributor_id, s.lat, s.lng, surplus.get(r, {}))
             for r, s in enumerate(sites) if r not in receivers],
            [Receiver(sites[o.row].agent_id, sites[o.row].distributor_id, sites[o.row].lat,
                      sites[o.row].lng, FloatType.cash, o.advice.amount)
             for o in orders if o.row in receivers], self.scfg)
        row_of = {s.agent_id: r for r, s in enumerate(sites)}
        return {row_of[m.receiver.agent_id]: m for m in found}

    def _deliveries(self, t: int, now: datetime, orders: Sequence[_Order],
                    surplus: dict[int, dict[FloatType, float]]) -> list[Delivery]:
        sites = self.w.sites
        swaps = self._swaps(orders, surplus)
        shortages = []
        for i, o in enumerate(orders):
            m = swaps.get(o.row) if o.float_type == FloatType.cash else None
            s = sites[o.row]
            shortages.append(Shortage(
                key=i, distributor_id=s.distributor_id, lat=s.lat, lng=s.lng,
                float_type=o.float_type, amount=o.advice.amount,
                hours_to_deadline=max(0.0, (o.advice.deadline_at - now) / _HOUR),
                hub_km=s.hub_km, swap=None if m is None else SwapCover(i, m.amount,
                                                                       m.distance_km)))
        choices = choose(shortages, self.ccfg)
        row_of = {s.agent_id: r for r, s in enumerate(sites)}
        out = []
        for i, o in enumerate(orders):
            channel, m = choices[i].channel, swaps.get(o.row)
            donor = row_of[m.donor.agent_id] if channel == Channel.swap and m else None
            out.append(self._delivery(t, o, channel, choices[i].van_route_id, donor,
                                      m.distance_km if donor is not None and m else 0.0))
        return out

    def _delivery(self, t: int, o: _Order, channel: Channel, route: str | None,
                  donor: int | None, swap_km: float) -> Delivery:
        c, hod = self.ccfg, int(self.w.hod[t])
        amount, ft = o.advice.amount, o.float_type
        if channel == Channel.top_up:
            land = arrival(t, c.topup_eta_h, hod, False, self.cfg)
            return Delivery(t, land, o.row, ft, amount, channel)
        if channel == Channel.swap and donor is not None:
            land = arrival(t, swap_km / c.self_fetch_speed_kmh, hod, True, self.cfg)
            return Delivery(t, land, o.row, ft, amount, channel, donor=donor)
        if channel == Channel.van:
            land = arrival(t, c.van_lead_time_h, hod, True, self.cfg)
            return Delivery(t, land, o.row, ft, amount, channel, f"V{t}-{route}")
        if channel == Channel.self_fetch:
            hub = self.w.sites[o.row].hub_km or 0.0
            land = arrival(t, 2 * hub / c.self_fetch_speed_kmh, hod, True, self.cfg)
            return Delivery(t, land, o.row, ft, amount, channel)
        land = arrival(t, self.cfg.emergency_eta_h, hod, True, self.cfg)
        return Delivery(t, land, o.row, ft, amount, Channel.urgent_manual, f"U{t}-{o.row}")
