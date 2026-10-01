"""Demand multipliers from the calendar: salary days, Eid, public holidays, weekly hat-bazar.

Every number here is a synthetic assumption, documented in docs/SYNTHETIC_ASSUMPTIONS.md.
"""

from datetime import date

import numpy as np

from app.models.enums import UrbanRural
from ml.data_gen.geography import HAT_WEEKDAY
from ml.data_gen.timeline import N_DAYS, N_HOURS, days, hour_of_day, weekday_of_day

U, P, R = UrbanRural.urban, UrbanRural.peri_urban, UrbanRural.rural

# Salary credited on the 1st; withdrawals peak on day 1-3. Rural gets remittances a day later.
SALARY_OUT: dict[UrbanRural, tuple[float, float, float]] = {
    U: (2.3, 1.7, 1.3), P: (2.0, 1.6, 1.25), R: (1.5, 1.7, 1.4),
}
SALARY_IN: dict[UrbanRural, tuple[float, float, float]] = {
    U: (1.4, 1.25, 1.1), P: (1.3, 1.2, 1.1), R: (1.0, 1.0, 1.0),
}
# Garment / factory wages, days 7-9, industrial districts only (urban + peri-urban agents).
GARMENT_DAYS = (7, 8, 9)
GARMENT_DISTRICTS = ("Dhaka", "Gazipur", "Chattogram")
GARMENT_OUT, GARMENT_IN = 1.5, 1.3

EID_DAY = date(2026, 3, 21)  # Eid-ul-Fitr 2026 (assumed date)
EID_OFFSETS = tuple(range(-7, 5))
# Cash-out heavy rush before Eid; city shuts down on Eid while villages stay busy.
EID_OUT: dict[UrbanRural, tuple[float, ...]] = {
    U: (1.3, 1.5, 1.7, 1.9, 2.2, 2.5, 2.2, 0.35, 0.45, 0.6, 0.8, 0.9),
    R: (1.4, 1.6, 1.9, 2.3, 2.7, 3.0, 3.2, 1.0, 0.8, 0.8, 0.9, 1.0),
}
EID_IN: dict[UrbanRural, tuple[float, ...]] = {
    U: (1.2, 1.3, 1.4, 1.5, 1.6, 1.5, 1.2, 0.3, 0.4, 0.6, 0.8, 0.9),
    R: (1.1, 1.1, 1.2, 1.2, 1.2, 1.1, 1.0, 0.7, 0.7, 0.8, 0.9, 1.0),
}
EID_BANK_CLOSED = range(-2, 4)

HOLIDAYS: tuple[tuple[date, str, str], ...] = (
    (date(2026, 2, 21), "International Mother Language Day", "আন্তর্জাতিক মাতৃভাষা দিবস"),
    (date(2026, 3, 26), "Independence Day", "স্বাধীনতা দিবস"),
    (date(2026, 4, 14), "Pohela Boishakh", "পহেলা বৈশাখ"),
)
HOLIDAY_MULT: dict[UrbanRural, float] = {U: 0.75, P: 0.85, R: 0.9}

# Hat-bazar: 09:00-17:00 on the district's hat weekday, peri-urban and rural agents only.
HAT_HOURS = range(9, 17)
HAT_OUT: dict[UrbanRural, float] = {U: 1.0, P: 1.4, R: 2.0}
HAT_IN: dict[UrbanRural, float] = {U: 1.0, P: 1.3, R: 1.7}
HAT_EVE_OUT = 1.15  # buyers withdraw the evening before


def _eid_table(table: dict[UrbanRural, tuple[float, ...]], area: UrbanRural) -> np.ndarray:
    if area is P:
        return (np.array(table[U]) + np.array(table[R])) / 2
    return np.array(table[area])


def bank_closed_days() -> np.ndarray:
    """Days with no scheduled refill besides the weekly pattern (Eid holidays, public holidays)."""
    closed = np.zeros(N_DAYS, dtype=bool)
    all_days = days()
    for i, d in enumerate(all_days):
        if (d - EID_DAY).days in EID_BANK_CLOSED or any(d == h[0] for h in HOLIDAYS):
            closed[i] = True
    return closed


def daily_multipliers(area: UrbanRural, district: str) -> tuple[np.ndarray, np.ndarray]:
    """(cash_out, cash_in) multipliers per day."""
    out = np.ones(N_DAYS)
    inn = np.ones(N_DAYS)
    eid_out, eid_in = _eid_table(EID_OUT, area), _eid_table(EID_IN, area)
    for i, d in enumerate(days()):
        if d.day <= 3:
            out[i] *= SALARY_OUT[area][d.day - 1]
            inn[i] *= SALARY_IN[area][d.day - 1]
        if d.day in GARMENT_DAYS and district in GARMENT_DISTRICTS and area is not R:
            out[i] *= GARMENT_OUT
            inn[i] *= GARMENT_IN
        k = (d - EID_DAY).days
        if k in EID_OFFSETS:
            out[i] *= eid_out[k - EID_OFFSETS[0]]
            inn[i] *= eid_in[k - EID_OFFSETS[0]]
        if any(d == h[0] for h in HOLIDAYS):
            out[i] *= HOLIDAY_MULT[area]
            inn[i] *= HOLIDAY_MULT[area]
    return out, inn


def hat_hour_mask(district: str) -> np.ndarray:
    """True for hat hours (09-17) on the district's hat weekday."""
    wd = HAT_WEEKDAY.get(district)
    if wd is None:
        return np.zeros(N_HOURS, dtype=bool)
    day_is_hat = np.repeat(weekday_of_day() == wd, 24)
    return day_is_hat & np.isin(hour_of_day(), list(HAT_HOURS))


def hat_multipliers(area: UrbanRural, district: str) -> tuple[np.ndarray, np.ndarray]:
    """Hourly (cash_out, cash_in) multipliers from the weekly hat (and its eve)."""
    out = np.ones(N_HOURS)
    inn = np.ones(N_HOURS)
    wd = HAT_WEEKDAY.get(district)
    if wd is None or area is U:
        return out, inn
    mask = hat_hour_mask(district)
    out[mask] *= HAT_OUT[area]
    inn[mask] *= HAT_IN[area]
    eve = np.repeat(weekday_of_day() == (wd - 1) % 7, 24) & (hour_of_day() >= 16)
    out[eve] *= HAT_EVE_OUT
    return out, inn
