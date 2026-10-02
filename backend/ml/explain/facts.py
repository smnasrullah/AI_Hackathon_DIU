"""Plain facts behind each factor: the numbers and event names a reason sentence may quote."""

from collections.abc import Sequence
from datetime import UTC, datetime

import numpy as np

from app.models.enums import EventType
from app.models.timeseries import Event
from ml.data_gen.timeline import BDT
from ml.features.build import SCALE_FLOOR, WEEK_H
from ml.features.panel import SEVERE, Panel

Facts = dict[str, str | int | float | bool]
# Weather events are covered by the rain factor's own facts (rain_mm, severe).
EVENT_FACTOR: dict[EventType, str] = {EventType.salary: "salary", EventType.eid: "eid",
                                      EventType.holiday: "holiday",
                                      EventType.hat_bazar: "hat_bazar"}


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts


def numeric_facts(panel: Panel, target: str, origin: int, window_h: int) -> list[dict[str, Facts]]:
    """Per panel agent: factor -> facts about the window [origin, origin + window_h)."""
    y = panel.demand[target]
    t = np.arange(origin, origin + window_h)
    scale = np.maximum(y[:, origin - WEEK_H:origin].mean(axis=1), SCALE_FLOOR)
    last_week = y[:, t - WEEK_H].sum(axis=1) / (scale * window_h)
    recent = y[:, origin - 24:origin].mean(axis=1) / scale
    days = np.unique(t // 24)
    d = panel.district
    rain = panel.rain_mm[d][:, days].max(axis=1)
    temp = panel.temp_c[d][:, days].mean(axis=1)
    severe = panel.events[d, SEVERE][:, t].max(axis=1) > 0
    weekday = int(panel.dow[origin + window_h // 2])
    return [{
        "last_week": {"ratio": round(float(last_week[i]), 1)},
        "recent_demand": {"ratio": round(float(recent[i]), 1)},
        "rain": {"rain_mm": round(float(rain[i]), 1), "severe": bool(severe[i])},
        "temperature": {"temp_c": int(round(float(temp[i])))},
        "weekday": {"weekday": weekday},
    } for i in range(len(panel.agent_ids))]


def when(starts_at: datetime, now: datetime) -> tuple[str, int]:
    """ongoing | today | tomorrow | in_days, and whole local days until the start."""
    start = _utc(starts_at)
    if start <= now:
        return "ongoing", 0
    days = (start.astimezone(BDT).date() - now.astimezone(BDT).date()).days
    return ("today" if days == 0 else "tomorrow" if days == 1 else "in_days"), days


def event_facts(events: Sequence[Event], district: str, now: datetime) -> dict[str, Facts]:
    """factor -> the earliest event of that kind for the district (or nationwide)."""
    out: dict[str, Facts] = {}
    for e in sorted(events, key=lambda e: (_utc(e.starts_at), e.id)):
        factor = EVENT_FACTOR.get(EventType(e.type))
        if factor is None or factor in out or e.district not in (None, district):
            continue
        phase, days = when(e.starts_at, now)
        out[factor] = {"event_en": e.name_en, "event_bn": e.name_bn, "when": phase, "days": days}
    return out


def merge(numeric: dict[str, Facts], events: dict[str, Facts]) -> dict[str, Facts]:
    return {k: {**numeric.get(k, {}), **events.get(k, {})} for k in numeric.keys() | events.keys()}
