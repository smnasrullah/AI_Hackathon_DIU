"""Event rows (events table) derived from the same constants that drive demand."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import numpy as np

from app.models.enums import EventType, UrbanRural
from ml.data_gen import calendar_effects as cal
from ml.data_gen.geography import HAT_WEEKDAY
from ml.data_gen.timeline import BDT, days
from ml.data_gen.weather import WeatherDay, rain_multiplier

DISTRICT_BN: dict[str, str] = {"Dhaka": "ঢাকা", "Gazipur": "গাজীপুর", "Chattogram": "চট্টগ্রাম",
                               "Sylhet": "সিলেট", "Sunamganj": "সুনামগঞ্জ"}


@dataclass(frozen=True)
class EventRow:
    type: EventType
    name_en: str
    name_bn: str
    starts_at: datetime
    ends_at: datetime
    district: str | None
    # Peak demand multiplier of the event (e.g. 2.3 = cash-out x2.3; 0.7 = demand -30%).
    intensity: float


def _at(d: date, hour: int = 0) -> datetime:
    return datetime.combine(d, time(hour), tzinfo=BDT)


def build_events(weather: list[WeatherDay]) -> list[EventRow]:
    out: list[EventRow] = []
    all_days = days()
    for d in all_days:
        if d.day == 1:
            out.append(EventRow(EventType.salary, "Salary days (1st-3rd)", "বেতন দিবস (১-৩ তারিখ)",
                                _at(d), _at(d + timedelta(days=3)), None,
                                cal.SALARY_OUT[UrbanRural.urban][0]))
        if d.day == cal.GARMENT_DAYS[0]:
            for district in cal.GARMENT_DISTRICTS:
                out.append(EventRow(EventType.salary, "Factory wage days", "কারখানার মজুরি দিবস",
                                    _at(d), _at(d + timedelta(days=len(cal.GARMENT_DAYS))),
                                    district, cal.GARMENT_OUT))
        wd = d.weekday()
        for district, hat_wd in HAT_WEEKDAY.items():
            if wd == hat_wd:
                out.append(EventRow(EventType.hat_bazar, f"{district} weekly hat",
                                    f"{DISTRICT_BN[district]} সাপ্তাহিক হাট",
                                    _at(d, cal.HAT_HOURS.start), _at(d, cal.HAT_HOURS.stop),
                                    district, cal.HAT_OUT[UrbanRural.rural]))
    eid0 = cal.EID_DAY + timedelta(days=cal.EID_OFFSETS[0])
    eid1 = cal.EID_DAY + timedelta(days=cal.EID_OFFSETS[-1] + 1)
    out.append(EventRow(EventType.eid, "Eid-ul-Fitr (pre-Eid rush and holidays)", "ঈদুল ফিতর",
                        _at(eid0), _at(eid1), None, max(cal.EID_OUT[UrbanRural.rural])))
    for d, en, bn in cal.HOLIDAYS:
        out.append(EventRow(EventType.holiday, en, bn, _at(d), _at(d + timedelta(days=1)), None,
                            cal.HOLIDAY_MULT[UrbanRural.urban]))
    for w in weather:
        if w.severe:
            mult = float(rain_multiplier(np.array([w.rain_mm]), UrbanRural.rural)[0])
            out.append(EventRow(EventType.weather, "Heavy rain", "ভারী বৃষ্টি", _at(w.date),
                                _at(w.date + timedelta(days=1)), w.district, round(mult, 3)))
    return sorted(out, key=lambda e: (e.starts_at, e.type.value, e.district or ""))
