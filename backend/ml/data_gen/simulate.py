"""Hour-by-hour dual-float simulation: refills, ad-hoc top-ups, turned-away demand.

Cash-in: customer hands cash, agent sends e-money (cash +, e-money -).
Cash-out: agent pays cash, receives e-money (cash -, e-money +).
Between refills cash + e-money is conserved. Snapshot ts = balance at the top of hour ts,
after any refill at that hour; transactions at ts cover [ts, ts + 1h).
"""

from dataclasses import dataclass

import numpy as np

from ml.data_gen import calendar_effects as cal
from ml.data_gen.agents import AgentSpec
from ml.data_gen.demand import Demand
from ml.data_gen.timeline import N_DAYS, N_HOURS, hour_of_day, weekday_of_day

ADHOC_LOW_SHARE = 0.08  # a float below 8% of capacity triggers an ad-hoc top-up attempt
ADHOC_PROB = 0.12  # per business hour
ADHOC_HOURS = range(8, 21)
EID_STOCK_UP = range(-7, -2)  # agents hold more cash in the pre-Eid rush
EID_STOCK_UP_MULT = 1.3


@dataclass
class Floats:
    cash: np.ndarray
    emoney: np.ndarray
    served_in: np.ndarray
    served_out: np.ndarray
    cnt_in: np.ndarray
    cnt_out: np.ndarray
    unmet_in: np.ndarray
    unmet_out: np.ndarray
    refill: np.ndarray
    scheduled: np.ndarray
    cash_target: np.ndarray  # (agents, hours)
    emoney_target: np.ndarray  # (agents,)
    adhoc_u: np.ndarray  # uniform draws deciding ad-hoc top-ups (reused by demo_scenario)

    @classmethod
    def empty(cls, n: int) -> "Floats":
        f = np.zeros((n, N_HOURS))
        i = np.zeros((n, N_HOURS), dtype=np.int64)
        b = np.zeros((n, N_HOURS), dtype=bool)
        return cls(f.copy(), f.copy(), f.copy(), f.copy(), i.copy(), i.copy(), f.copy(),
                   f.copy(), b.copy(), b.copy(), f.copy(), np.zeros(n), f.copy())


def refill_schedule(agents: list[AgentSpec]) -> np.ndarray:
    wd = np.repeat(weekday_of_day(), 24)
    closed = np.repeat(cal.bank_closed_days(), 24)
    hod = hour_of_day()
    return np.array([np.isin(wd, a.refill_weekdays) & (hod == a.refill_hour) & ~closed
                     for a in agents])


def cash_targets(agents: list[AgentSpec]) -> np.ndarray:
    stock = np.ones(N_DAYS)
    for i in range(N_DAYS):
        if (cal.days()[i] - cal.EID_DAY).days in EID_STOCK_UP:
            stock[i] = EID_STOCK_UP_MULT
    per_hour = np.repeat(stock, 24)
    return np.array([np.minimum(a.cash_capacity * a.cash_target * per_hour,
                                0.95 * a.cash_capacity) for a in agents])


def serve(cash: np.ndarray, em: np.ndarray, d_in: np.ndarray, d_out: np.ndarray
          ) -> tuple[np.ndarray, np.ndarray]:
    """Served (cash_in, cash_out) for one hour, both floats kept >= 0."""
    in1 = np.minimum(d_in, em)
    out = np.minimum(d_out, cash + in1)
    in2 = np.minimum(d_in - in1, em - in1 + out)
    return in1 + in2, out


def run(agents: list[AgentSpec], d: Demand, fl: Floats, rows: np.ndarray,
        start: int, cash0: np.ndarray, em0: np.ndarray) -> None:
    """Simulate `rows` from hour `start` with the given opening balances, writing into fl."""
    cash_cap = np.array([agents[r].cash_capacity for r in rows], dtype=float)
    em_cap = np.array([agents[r].emoney_capacity for r in rows], dtype=float)
    cash, em = cash0.astype(float), em0.astype(float)
    hod = hour_of_day()
    for t in range(start, N_HOURS):
        sched = fl.scheduled[rows, t]
        cash = np.where(sched, fl.cash_target[rows, t], cash)
        em = np.where(sched, fl.emoney_target[rows], em)
        adhoc = np.zeros_like(sched)
        if hod[t] in ADHOC_HOURS:
            low = (cash < ADHOC_LOW_SHARE * cash_cap) | (em < ADHOC_LOW_SHARE * em_cap)
            adhoc = low & (fl.adhoc_u[rows, t] < ADHOC_PROB)
            cash = np.where(adhoc, fl.cash_target[rows, t], cash)
            em = np.where(adhoc, fl.emoney_target[rows], em)
        fl.refill[rows, t] = sched | adhoc
        fl.cash[rows, t], fl.emoney[rows, t] = cash, em
        d_in, d_out = d.amt_in[rows, t], d.amt_out[rows, t]
        s_in, s_out = serve(cash, em, d_in, d_out)
        fl.served_in[rows, t], fl.served_out[rows, t] = s_in, s_out
        fl.unmet_in[rows, t], fl.unmet_out[rows, t] = d_in - s_in, d_out - s_out
        fl.cnt_in[rows, t] = _scaled_count(d.cnt_in[rows, t], s_in, d_in)
        fl.cnt_out[rows, t] = _scaled_count(d.cnt_out[rows, t], s_out, d_out)
        cash, em = cash + s_in - s_out, em - s_in + s_out


def _scaled_count(cnt: np.ndarray, served: np.ndarray, demand: np.ndarray) -> np.ndarray:
    ratio = np.divide(served, demand, out=np.ones_like(served), where=demand > 0)
    return np.where(served > 0, np.maximum(np.round(cnt * ratio), 1), 0).astype(np.int64)


def simulate(agents: list[AgentSpec], d: Demand, rng: np.random.Generator) -> Floats:
    n = len(agents)
    fl = Floats.empty(n)
    fl.scheduled[:] = refill_schedule(agents)
    fl.cash_target[:] = cash_targets(agents)
    fl.emoney_target[:] = [a.emoney_capacity * a.emoney_target for a in agents]
    fl.adhoc_u[:] = rng.random((n, N_HOURS))
    run(agents, d, fl, np.arange(n), 0, fl.cash_target[:, 0], fl.emoney_target)
    return fl
