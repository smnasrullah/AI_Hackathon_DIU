"""Inject ~3% anomalous agents (labelled ground truth for Isolation Forest evaluation)."""

from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from ml.data_gen import demo_spec
from ml.data_gen.agents import AgentSpec
from ml.data_gen.demand import Demand
from ml.data_gen.timeline import HOLDOUT_START, N_DAYS, START, hour_index

ANOMALY_SHARE = 0.03
KINDS = ("night_structuring", "volume_burst", "circular_flow")
NIGHT_HOURS = (23, 0, 1, 2, 3, 4)
STRUCTURING_TICKET = (4500.0, 4990.0)  # just under a BDT 5,000 round number
CIRCULAR_TICKET = 9990.0
BURST_RANGE = (3.5, 5.5)
DURATION_DAYS = {"night_structuring": (5, 8), "volume_burst": (4, 7), "circular_flow": (7, 11)}


@dataclass(frozen=True)
class AnomalyLabel:
    agent_code: str
    kind: str
    window_start: datetime
    window_end: datetime  # exclusive

    def as_json(self) -> dict[str, str]:
        return {"agent_code": self.agent_code, "kind": self.kind,
                "window_start": self.window_start.isoformat(),
                "window_end": self.window_end.isoformat()}


def _apply(kind: str, i: int, h0: int, h1: int, d: Demand, rng: np.random.Generator) -> None:
    hours = np.arange(h0, h1)
    if kind == "night_structuring":
        hours = hours[np.isin(hours % 24, NIGHT_HOURS)]
        add_in = rng.poisson(12, hours.size)
        add_out = rng.poisson(10, hours.size)
        d.cnt_in[i, hours] += add_in
        d.cnt_out[i, hours] += add_out
        d.amt_in[i, hours] += np.round(add_in * rng.uniform(*STRUCTURING_TICKET, hours.size))
        d.amt_out[i, hours] += np.round(add_out * rng.uniform(*STRUCTURING_TICKET, hours.size))
    elif kind == "volume_burst":
        hours = hours[d.lam_out[i, hours] > 0]
        k = np.repeat(rng.uniform(*BURST_RANGE, N_DAYS), 24)[hours]
        for amt, cnt in ((d.amt_in, d.cnt_in), (d.amt_out, d.cnt_out)):
            amt[i, hours] = np.round(amt[i, hours] * k)
            cnt[i, hours] = np.round(cnt[i, hours] * k).astype(np.int64)
    elif kind == "circular_flow":
        hours = hours[d.lam_out[i, hours] > 0]
        c = rng.poisson(15, hours.size)
        for amt, cnt in ((d.amt_in, d.cnt_in), (d.amt_out, d.cnt_out)):
            cnt[i, hours] += c
            amt[i, hours] += c * CIRCULAR_TICKET
    else:
        raise ValueError(kind)


def _random_window(kind: str, in_holdout: bool, rng: np.random.Generator) -> tuple[int, int]:
    lo, hi = DURATION_DAYS[kind]
    length = int(rng.integers(lo, hi))
    holdout_day = (HOLDOUT_START - START).days
    first = holdout_day if in_holdout else 14
    last = N_DAYS - length if in_holdout else holdout_day - length
    start = int(rng.integers(first, last + 1))
    return start * 24, (start + length) * 24


def inject_anomalies(agents: list[AgentSpec], d: Demand, rng: np.random.Generator
                     ) -> list[AnomalyLabel]:
    codes = [a.code for a in agents]
    labels: list[AnomalyLabel] = []
    w0, w1 = demo_spec.ANOMALY_WINDOW
    demo_i = codes.index(demo_spec.ANOMALY_AGENT)
    _apply("night_structuring", demo_i, hour_index(w0), hour_index(w1), d, rng)
    labels.append(AnomalyLabel(demo_spec.ANOMALY_AGENT, "night_structuring", w0, w1))

    n_total = max(2, round(ANOMALY_SHARE * len(agents)))
    pinned = {demo_spec.STOCKOUT_AGENT, demo_spec.DONOR_AGENT, demo_spec.ANOMALY_AGENT}
    candidates = [i for i, c in enumerate(codes) if c not in pinned]
    chosen = rng.choice(candidates, size=n_total - 1, replace=False)
    for k, i in enumerate(sorted(int(x) for x in chosen)):
        kind = KINDS[k % len(KINDS)]
        h0, h1 = _random_window(kind, in_holdout=k % 2 == 1, rng=rng)
        _apply(kind, i, h0, h1, d, rng)
        labels.append(AnomalyLabel(codes[i], kind, START + timedelta(hours=h0),
                                   START + timedelta(hours=h1)))
    return labels
