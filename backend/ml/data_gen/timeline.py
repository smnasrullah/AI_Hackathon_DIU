"""Fixed simulated timeline: local time is Asia/Dhaka (UTC+6, no DST)."""

from datetime import UTC, date, datetime, timedelta, timezone

import numpy as np

BDT = timezone(timedelta(hours=6), "Asia/Dhaka")

START = datetime(2026, 1, 5, tzinfo=BDT)
N_DAYS = 120
N_HOURS = N_DAYS * 24
END = START + timedelta(hours=N_HOURS)  # exclusive: 2026-05-05 00:00
HOLDOUT_DAYS = 14
HOLDOUT_START = START + timedelta(days=N_DAYS - HOLDOUT_DAYS)  # 2026-04-21 00:00
# Fixed "now" of the demo; inside the holdout, so the 72 h after it are never trained on.
SIM_NOW = datetime(2026, 4, 30, 20, tzinfo=BDT)

# Python weekday numbers (Mon=0). Bangladesh weekend: Friday (+ Saturday for offices/banks).
SUN, MON, TUE, WED, THU, FRI, SAT = 6, 0, 1, 2, 3, 4, 5


def hour_index(ts: datetime) -> int:
    return int((ts - START) / timedelta(hours=1))


def day_index(d: date) -> int:
    return (d - START.date()).days


def days() -> list[date]:
    return [START.date() + timedelta(days=i) for i in range(N_DAYS)]


def local_hours() -> list[datetime]:
    return [START + timedelta(hours=i) for i in range(N_HOURS)]


def utc_hours() -> list[datetime]:
    return [t.astimezone(UTC) for t in local_hours()]


def weekday_of_day() -> np.ndarray:
    return np.array([d.weekday() for d in days()], dtype=np.int64)


def hour_of_day() -> np.ndarray:
    return np.arange(N_HOURS, dtype=np.int64) % 24


def holdout_mask() -> np.ndarray:
    return np.arange(N_HOURS) >= hour_index(HOLDOUT_START)
