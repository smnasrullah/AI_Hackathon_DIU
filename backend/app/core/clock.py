"""The one time base of the help workflow, and its only bridge to the forecast's timeline.

Every workflow timestamp (created_at, needed_by, claim_expires_at, wave timers, notification
times, the countdown in the UI) is real UTC wall-clock time from now(). The forecast is a frozen
synthetic snapshot: its hours are offsets from the forecast origin (SIM_NOW). forecast_to_wall()
places a forecast moment on the wall clock by treating the origin as "now", so "stock-out in
3 h 40 m" on the agent page is "stock-out 3 h 40 m after the trigger ran" on a help request.

Tests replace _source (monkeypatch) to get a fake clock everywhere at once.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta


def _system_now() -> datetime:
    return datetime.now(UTC)


_source: Callable[[], datetime] = _system_now


def now() -> datetime:
    return _source()


def as_utc(ts: datetime) -> datetime:
    """Naive values (SQLite) are UTC; aware values are converted."""
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def forecast_to_wall(forecast_ts: datetime, origin: datetime, wall_now: datetime) -> datetime:
    """A moment on the forecast timeline -> wall clock, keeping its distance from the origin."""
    return as_utc(wall_now) + (as_utc(forecast_ts) - as_utc(origin))


def hours_after(wall_now: datetime, hours: float) -> datetime:
    """forecast_to_wall() for a forecast offset given in hours from the origin."""
    return as_utc(wall_now) + timedelta(hours=hours)
