"""Per-agent window features for the anomaly detector (F9).

A window is the WINDOW_H hours before hour index `end` (exclusive); the agent's own baseline is
the HISTORY_H hours before the window. Every transaction conserves cash + e-money, so any jump in
that total between two hourly snapshots is a refill.
"""

from collections import Counter
from dataclasses import dataclass

import numpy as np
from scipy.spatial.distance import jensenshannon
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent
from app.models.enums import TxnType, UrbanRural
from app.models.timeseries import FloatSnapshot, Transaction
from ml.data_gen.timeline import N_HOURS
from ml.features.panel import hour_of, ts_of

WINDOW_H = 7 * 24
HISTORY_H = 28 * 24
STRIDE_H = 24
REFILL_MIN_BDT = 10.0  # snapshots round each float to 1 BDT; a refill moves the total far more
MIN_PEERS = 10  # smaller tier x area groups use the global group
GLOBAL_GROUP = "all"
Z_FLOOR = 0.05  # floor of the robust spread, so a flat peer group does not divide by ~0
# Raw window measures (shown as evidence) and the model inputs: each measure as a robust z vs
# the agent's peer group in the same window, so market-wide shifts (Eid, salary days) cancel.
RAW = ("cash_out_growth", "hour_shift", "refills_per_day", "out_in_log_ratio")
FEATURES = ("cash_out_peer_z", "hour_shift_peer_z", "refills_peer_z", "out_in_ratio_peer_z")
# Only "more than peers" is suspicious for these; below-peer values are clipped to 0.
ONE_SIDED = (True, True, True, False)


@dataclass
class Series:
    agent_ids: np.ndarray  # (A,) agents.id, ordered by id
    codes: list[str]
    groups: list[str]  # peer group per agent
    cash_out: np.ndarray  # (A, N_HOURS) BDT served
    cash_in: np.ndarray  # (A, N_HOURS) BDT served
    total: np.ndarray  # (A, N_HOURS) cash + e-money at the top of the hour; nan = no snapshot


def group_key(tier: int, area: UrbanRural) -> str:
    return f"t{tier}-{UrbanRural(area).value}"


def assign_groups(keys: list[str]) -> list[str]:
    counts = Counter(keys)
    return [k if counts[k] >= MIN_PEERS else GLOBAL_GROUP for k in keys]


def load_series(session: Session, end: int = N_HOURS) -> Series:
    """Hourly flows and float totals; nothing at or after hour index `end` is read."""
    agents = list(session.scalars(select(Agent).order_by(Agent.id)))
    row_of = {a.id: i for i, a in enumerate(agents)}
    shape = (len(agents), N_HOURS)
    flows = {TxnType.cash_out: np.zeros(shape), TxnType.cash_in: np.zeros(shape)}
    total = np.full(shape, np.nan)
    stop = ts_of(end)
    for aid, ts, kind, amount in session.execute(
            select(Transaction.agent_id, Transaction.ts, Transaction.txn_type,
                   Transaction.amount_bdt).where(Transaction.ts < stop)):
        t, r = hour_of(ts), row_of.get(aid)
        if r is not None and 0 <= t < end:
            flows[TxnType(kind)][r, t] += float(amount)
    for aid, ts, cash, em in session.execute(
            select(FloatSnapshot.agent_id, FloatSnapshot.ts, FloatSnapshot.cash_balance,
                   FloatSnapshot.emoney_balance).where(FloatSnapshot.ts < stop)):
        t, r = hour_of(ts), row_of.get(aid)
        if r is not None and 0 <= t < end:
            total[r, t] = float(cash) + float(em)
    return Series(
        agent_ids=np.array([a.id for a in agents], dtype=np.int64),
        codes=[a.code for a in agents],
        groups=assign_groups([group_key(a.tier, a.urban_rural) for a in agents]),
        cash_out=flows[TxnType.cash_out], cash_in=flows[TxnType.cash_in], total=total,
    )


def robust_z(values: np.ndarray, groups: np.ndarray) -> np.ndarray:
    """(value - group median) / (1.4826 x group MAD), spread floored at Z_FLOOR."""
    z = np.zeros_like(values, dtype=float)
    for g in np.unique(groups):
        m = groups == g
        med = np.median(values[m])
        spread = max(1.4826 * float(np.median(np.abs(values[m] - med))), Z_FLOOR)
        z[m] = (values[m] - med) / spread
    return z


def hour_profile(amounts: np.ndarray, first_hour: int) -> np.ndarray:
    """(A, 24) amount per local hour of day; hour index 0 is local midnight."""
    hod = (first_hour + np.arange(amounts.shape[1])) % 24
    return np.stack([amounts[:, hod == h].sum(axis=1) for h in range(24)], axis=1)


def hour_shift(window: np.ndarray, history: np.ndarray) -> np.ndarray:
    """Jensen-Shannon distance (base 2, 0..1) between two (A, 24) hour profiles."""
    ok = (window.sum(axis=1) > 0) & (history.sum(axis=1) > 0)
    out = np.zeros(window.shape[0])
    if ok.any():
        out[ok] = jensenshannon(window[ok], history[ok], axis=1, base=2)
    return np.nan_to_num(out)


def refill_count(total: np.ndarray) -> np.ndarray:
    """Hours whose total float differs from the previous hour's; total has one leading hour."""
    with np.errstate(invalid="ignore"):
        return (np.abs(np.diff(total, axis=1)) > REFILL_MIN_BDT).sum(axis=1)


@dataclass(frozen=True)
class Window:
    raw: np.ndarray  # (A, len(RAW))
    x: np.ndarray  # (A, len(FEATURES)) model input
    cash_out_bdt: np.ndarray  # (A,) window totals, kept as evidence
    cash_in_bdt: np.ndarray
    baseline_cash_out_bdt: np.ndarray  # own history rate scaled to the window length
    refills: np.ndarray


def window_features(s: Series, end: int) -> Window:
    w0, h0 = end - WINDOW_H, end - WINDOW_H - HISTORY_H
    if h0 < 0 or end > N_HOURS:
        raise ValueError(f"window ending at hour {end} lacks history")
    out_w, in_w = s.cash_out[:, w0:end].sum(axis=1), s.cash_in[:, w0:end].sum(axis=1)
    out_base = s.cash_out[:, h0:w0].sum(axis=1) * WINDOW_H / HISTORY_H
    growth = np.log((out_w + 1) / (out_base + 1))
    flow = s.cash_out + s.cash_in
    shift = hour_shift(hour_profile(flow[:, w0:end], w0), hour_profile(flow[:, h0:w0], h0))
    refills = refill_count(s.total[:, w0 - 1:end])
    raw = np.column_stack([growth, shift, refills / (WINDOW_H / 24),
                           np.log((out_w + 1) / (in_w + 1))])
    groups = np.array(s.groups)
    x = np.column_stack([robust_z(raw[:, j], groups) for j in range(len(RAW))])
    x[:, list(ONE_SIDED)] = np.maximum(x[:, list(ONE_SIDED)], 0)
    return Window(raw, x, out_w, in_w, out_base, refills)
