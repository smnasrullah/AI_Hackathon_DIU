"""Hourly panel read from the database: demand per agent, calendar/event flags, weather.

Hour index t covers [START + t h, START + (t + 1) h) on the fixed simulated timeline (local time
Asia/Dhaka). `load_panel(session, end=t0)` reads only transactions before t0, so inference at
an origin can never see the future.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent
from app.models.enums import EventType, TxnType, UrbanRural
from app.models.timeseries import Event, Transaction, WeatherDaily
from ml.data_gen.timeline import N_DAYS, N_HOURS, START, day_index, local_hours

AREA_CODE: dict[UrbanRural, int] = {UrbanRural.urban: 0, UrbanRural.peri_urban: 1,
                                    UrbanRural.rural: 2}
# Event flag rows in Panel.events; EID holds the day number inside the Eid window (-1 = none).
SALARY, WAGE, EID, HOLIDAY, HAT, SEVERE = range(6)
N_EVENT_FEATURES = 6
TARGETS = ("cash_out", "cash_in")


@dataclass
class Panel:
    agent_ids: np.ndarray  # (A,) agents.id, ordered by id
    tier: np.ndarray  # (A,)
    area: np.ndarray  # (A,) AREA_CODE
    district: np.ndarray  # (A,) index into districts
    cash_cap: np.ndarray  # (A,) BDT
    emoney_cap: np.ndarray  # (A,) BDT
    districts: list[str]
    demand: dict[str, np.ndarray]  # target -> (A, N_HOURS) BDT served per hour
    events: np.ndarray  # (D, N_EVENT_FEATURES, N_HOURS)
    rain_mm: np.ndarray  # (D, N_DAYS)
    temp_c: np.ndarray  # (D, N_DAYS)
    hour: np.ndarray  # (N_HOURS,) local hour of day
    dow: np.ndarray  # (N_HOURS,) Mon=0
    dom: np.ndarray  # (N_HOURS,) day of month


def _utc(ts: datetime) -> datetime:
    # SQLite returns naive datetimes; values are written in UTC.
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts


def hour_of(ts: datetime) -> int:
    return int((_utc(ts) - START) // timedelta(hours=1))


def ts_of(t: int) -> datetime:
    return (START + timedelta(hours=t)).astimezone(UTC)


def _agents(session: Session) -> tuple[list[Agent], list[str]]:
    agents = list(session.scalars(select(Agent).order_by(Agent.id)))
    return agents, sorted({a.district for a in agents})


def _demand(session: Session, row_of: dict[int, int], end: int) -> dict[str, np.ndarray]:
    out = {k: np.zeros((len(row_of), N_HOURS)) for k in TARGETS}
    q = select(Transaction.agent_id, Transaction.ts, Transaction.txn_type, Transaction.amount_bdt)
    if end < N_HOURS:
        q = q.where(Transaction.ts < ts_of(end))
    for aid, ts, kind, amount in session.execute(q):
        t, r = hour_of(ts), row_of.get(aid)
        if r is not None and 0 <= t < end:
            out[TxnType(kind).value][r, t] += float(amount)
    return out


def _hour_span(start: datetime, end: datetime) -> slice:
    return slice(max(hour_of(start), 0), min(hour_of(end), N_HOURS))


def _events(session: Session, districts: list[str]) -> np.ndarray:
    ev = np.zeros((len(districts), N_EVENT_FEATURES, N_HOURS))
    ev[:, EID, :] = -1
    for e in session.scalars(select(Event)):
        rows = [districts.index(e.district)] if e.district in districts else (
            list(range(len(districts))) if e.district is None else [])
        span = _hour_span(e.starts_at, e.ends_at)
        kind = EventType(e.type)
        for r in rows:
            if kind is EventType.eid:
                ev[r, EID, span] = (np.arange(span.start, span.stop) - span.start) // 24
            elif kind is EventType.salary:
                ev[r, WAGE if e.district else SALARY, span] = 1
            else:
                flag = {EventType.holiday: HOLIDAY, EventType.hat_bazar: HAT,
                        EventType.weather: SEVERE}[kind]
                ev[r, flag, span] = 1
    return ev


def _weather(session: Session, districts: list[str]) -> tuple[np.ndarray, np.ndarray]:
    rain = np.zeros((len(districts), N_DAYS))
    temp = np.full((len(districts), N_DAYS), 25.0)
    for w in session.scalars(select(WeatherDaily)):
        d: date = w.date
        i = day_index(d)
        if w.district in districts and 0 <= i < N_DAYS:
            r = districts.index(w.district)
            rain[r, i], temp[r, i] = float(w.rain_mm), float(w.temp_c)
    return rain, temp


def load_panel(session: Session, end: int = N_HOURS) -> Panel:
    """Read the panel; demand after hour index `end` (exclusive) is left at zero."""
    agents, districts = _agents(session)
    row_of = {a.id: i for i, a in enumerate(agents)}
    rain, temp = _weather(session, districts)
    loc = local_hours()
    return Panel(
        agent_ids=np.array([a.id for a in agents], dtype=np.int64),
        tier=np.array([a.tier for a in agents], dtype=float),
        area=np.array([AREA_CODE[UrbanRural(a.urban_rural)] for a in agents], dtype=float),
        district=np.array([districts.index(a.district) for a in agents], dtype=np.int64),
        cash_cap=np.array([float(a.cash_capacity) for a in agents]),
        emoney_cap=np.array([float(a.emoney_capacity) for a in agents]),
        districts=districts,
        demand=_demand(session, row_of, end),
        events=_events(session, districts),
        rain_mm=rain,
        temp_c=temp,
        hour=np.array([t.hour for t in loc], dtype=float),
        dow=np.array([t.weekday() for t in loc], dtype=float),
        dom=np.array([t.day for t in loc], dtype=float),
    )
