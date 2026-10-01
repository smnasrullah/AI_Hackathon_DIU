"""Guarantee the demo story on top of the generated data.

1. STOCKOUT_AGENT runs out of cash at ~15:40 tomorrow (SIM_NOW + 1 day, salary day): from its
   last refill to tomorrow it follows the noise-free expected demand, and the refill amount is
   solved backwards so the balance crosses zero at 15:40 (linear within the hour).
2. DONOR_AGENT (~1 km, same distributor) holds >= DONOR_MIN_CASH for the next 24 h.
3. ANOMALY_AGENT carries a night-structuring pattern up to SIM_NOW (injected in anomalies.py).

CLI: `python -m ml.data_gen.demo_scenario` re-applies these agents' rows in the database.
"""

import argparse
import json
import logging
import math
import sys
from typing import TYPE_CHECKING, Any

import numpy as np

from ml.data_gen import demo_spec as spec
from ml.data_gen.simulate import run
from ml.data_gen.timeline import N_HOURS, SIM_NOW, hour_index

if TYPE_CHECKING:
    from ml.data_gen.dataset import Dataset

log = logging.getLogger(__name__)
MAX_DONOR_KM = 2.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _use_expected(ds: "Dataset", i: int, h0: int, h1: int) -> None:
    d = ds.demand
    for lam, amt, cnt, ticket in ((d.lam_in, d.amt_in, d.cnt_in, d.ticket_in[i]),
                                  (d.lam_out, d.amt_out, d.cnt_out, d.ticket_out[i])):
        amt[i, h0:h1] = np.round(lam[i, h0:h1])
        cnt[i, h0:h1] = np.where(amt[i, h0:h1] > 0,
                                 np.maximum(np.round(amt[i, h0:h1] / ticket), 1), 0)


def _force_stockout(ds: "Dataset") -> dict[str, Any]:
    i = ds.index(spec.STOCKOUT_AGENT)
    d, fl, a = ds.demand, ds.floats, ds.agents[i]
    t_r, t_s = hour_index(spec.STOCKOUT_REFILL_AT), hour_index(SIM_NOW)
    t_c = hour_index(spec.STOCKOUT_AT.replace(minute=0))
    frac = spec.STOCKOUT_AT.minute / 60
    day_end = (t_c // 24 + 1) * 24
    _use_expected(ds, i, t_s, day_end)
    if fl.scheduled[i, t_r + 1:t_c + 1].any():
        raise RuntimeError("demo stockout agent has a scheduled refill before the stockout")
    d_in, d_out = d.amt_in[i], d.amt_out[i]
    if d_out[t_c] <= d_in[t_c]:
        raise RuntimeError("demo stockout hour is not net cash-out")
    cash = np.zeros(t_c + 1)
    cash[t_c] = round(frac * (d_out[t_c] - d_in[t_c]))
    for t in range(t_c - 1, t_r - 1, -1):
        cash[t] = cash[t + 1] - d_in[t] + d_out[t]
    em = np.zeros(t_c + 2)
    em[t_r] = fl.emoney_target[i]
    for t in range(t_r, t_c + 1):
        em[t + 1] = em[t] - d_in[t] + d_out[t]
    if cash[t_r:].min() <= 0 or cash[t_r] > a.cash_capacity or em[t_r:t_c + 1].min() < 0:
        raise RuntimeError("demo stockout path is infeasible; adjust demo_spec")

    sl = slice(t_r, t_c)
    fl.cash[i, t_r:t_c + 1], fl.emoney[i, t_r:t_c + 1] = cash[t_r:], em[t_r:t_c + 1]
    fl.served_in[i, sl], fl.served_out[i, sl] = d_in[sl], d_out[sl]
    fl.cnt_in[i, sl], fl.cnt_out[i, sl] = d.cnt_in[i, sl], d.cnt_out[i, sl]
    fl.unmet_in[i, sl] = fl.unmet_out[i, sl] = 0
    fl.refill[i, t_r], fl.refill[i, t_r + 1:t_c + 1] = True, False
    # Stockout hour: cash runs dry after `frac` of the hour; then only cash taken in is paid out.
    # = frac * out + (1 - frac) * in, kept integral so the hour closes at exactly zero cash.
    out_served = cash[t_c] + d_in[t_c]
    fl.served_in[i, t_c], fl.served_out[i, t_c] = d_in[t_c], out_served
    fl.unmet_in[i, t_c], fl.unmet_out[i, t_c] = 0, d_out[t_c] - out_served
    fl.cnt_in[i, t_c] = d.cnt_in[i, t_c]
    fl.cnt_out[i, t_c] = max(1, round(d.cnt_out[i, t_c] * out_served / d_out[t_c]))
    end_cash = cash[t_c] + d_in[t_c] - out_served
    end_em = em[t_c] - d_in[t_c] + out_served
    run(ds.agents, d, fl, np.array([i]), t_c + 1, np.array([end_cash]), np.array([end_em]))
    shortfall = float(d.lam_out[i, t_c:day_end].sum() - d.lam_in[i, t_c:day_end].sum()
                      - cash[t_c])
    return {"agent_code": a.code, "stockout_at": spec.STOCKOUT_AT.isoformat(),
            "cash_at_sim_now": float(cash[t_s]), "refill_at": spec.STOCKOUT_REFILL_AT.isoformat(),
            "refill_cash": float(cash[t_r]), "shortfall_rest_of_day": round(shortfall)}


def _check_donor(ds: "Dataset") -> dict[str, Any]:
    i, j = ds.index(spec.DONOR_AGENT), ds.index(spec.STOCKOUT_AGENT)
    a, b = ds.agents[i], ds.agents[j]
    km = haversine_km(a.lat, a.lng, b.lat, b.lng)
    t_s = hour_index(SIM_NOW)
    min_cash = float(ds.floats.cash[i, t_s:min(t_s + 25, N_HOURS)].min())
    if a.distributor_code != b.distributor_code or km > MAX_DONOR_KM:
        raise RuntimeError("demo donor is not a nearby agent of the same distributor")
    if min_cash < spec.DONOR_MIN_CASH:
        raise RuntimeError(f"demo donor cash dips to {min_cash:.0f} within 24 h")
    return {"agent_code": a.code, "distance_km": round(km, 2), "min_cash_next_24h": min_cash}


def apply(ds: "Dataset") -> dict[str, Any]:
    """Enforce the demo story in-place; returns a JSON-able summary (stored in system_meta)."""
    w0, w1 = spec.ANOMALY_WINDOW
    return {
        "sim_now": SIM_NOW.isoformat(),
        "stockout": _force_stockout(ds),
        "donor": _check_donor(ds),
        "anomaly": {"agent_code": spec.ANOMALY_AGENT, "kind": "night_structuring",
                    "window_start": w0.isoformat(), "window_end": w1.isoformat()},
    }


def main() -> int:
    from sqlalchemy.orm import Session

    from app.core.config import get_settings
    from app.core.db import get_engine
    from ml.data_gen.dataset import build_dataset
    from ml.data_gen.load import load

    logging.basicConfig(level=logging.INFO, format="[demo_scenario] %(message)s")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", type=int, default=get_settings().seed)
    args = parser.parse_args()
    ds = build_dataset(args.seed)
    codes = {spec.STOCKOUT_AGENT, spec.DONOR_AGENT, spec.ANOMALY_AGENT}
    with Session(get_engine()) as session, session.begin():
        counts = load(session, ds, only_agents=codes)
    log.info("rows written: %s", counts)
    print(json.dumps(ds.demo, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
