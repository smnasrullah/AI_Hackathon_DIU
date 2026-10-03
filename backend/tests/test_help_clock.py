"""One time base (wall clock, app/core/clock.py) for the whole help workflow, with a fake clock:
deadlines, claim timeouts, the sweep and the trigger agree, the request's stock-out matches the
agent page's "stock-out in X", and notifications say the deadline in Dhaka time in words."""

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.models import Agent
from app.models.enums import FloatType, Lang, RiskLevelCode
from app.rules.help_trigger_rules import TriggerPolicy
from app.services import help_trigger as trig
from app.services import help_trigger_run
from app.services.help_time_text import deadline_text
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.help_helpers import API, act, help_params, make_request, request_row, set_lang
from tests.test_help_trigger_service import arrange_neighbours

T0 = datetime(2026, 10, 3, 9, 0, tzinfo=UTC)  # 15:00 in Dhaka
EN_TIME = re.compile(r"^(today|tomorrow|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}) at "
                     r"\d{1,2}:\d{2} (AM|PM)$")


class FakeClock:
    def __init__(self, start: datetime) -> None:
        self.now = start

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def fake_clock(monkeypatch: pytest.MonkeyPatch) -> FakeClock:
    fake = FakeClock(T0)
    monkeypatch.setattr(clock, "_source", fake)
    return fake


def test_forecast_times_keep_their_distance_from_the_origin() -> None:
    origin = datetime(2026, 4, 30, 14, 0, tzinfo=UTC)  # SIM_NOW (20:00 Dhaka)
    stockout = origin + timedelta(hours=3, minutes=40)
    assert clock.forecast_to_wall(stockout, origin, T0) == T0 + timedelta(hours=3, minutes=40)
    naive = stockout.replace(tzinfo=None)  # SQLite hands back naive UTC
    assert clock.forecast_to_wall(naive, origin, T0) == T0 + timedelta(hours=3, minutes=40)
    assert clock.hours_after(T0, 3 + 40 / 60) == T0 + timedelta(hours=3, minutes=40)


def test_deadline_text_is_dhaka_time_in_words() -> None:
    assert deadline_text(T0 + timedelta(hours=2, minutes=5), T0, Lang.en) == "today at 5:05 PM"
    assert deadline_text(T0 + timedelta(hours=2, minutes=5), T0, Lang.bn) == "আজ বিকেল 5:05"
    nine_am = datetime(2026, 10, 4, 3, 0, tzinfo=UTC)  # 09:00 Dhaka, the next day
    assert deadline_text(nine_am, T0, Lang.en) == "tomorrow at 9:00 AM"
    assert deadline_text(nine_am, T0, Lang.bn) == "আগামীকাল সকাল 9:00"
    later = datetime(2026, 10, 9, 13, 30, tzinfo=UTC)  # 19:30 Dhaka, Friday
    assert deadline_text(later, T0, Lang.en) == "Fri 9 Oct at 7:30 PM"
    assert deadline_text(later, T0, Lang.bn) == "9 অক্টোবর সন্ধ্যা 7:30"
    late_night = datetime(2026, 10, 3, 18, 30, tzinfo=UTC)  # 00:30 Dhaka on the 4th
    assert deadline_text(late_night, T0, Lang.en) == "tomorrow at 12:30 AM"
    assert deadline_text(late_night, T0, Lang.bn) == "আগামীকাল রাত 12:30"


def test_claim_timeout_and_sweep_run_on_the_same_clock(client: TestClient, seeded: Path,
                                                       fake_clock: FakeClock) -> None:
    req_id, _ = make_request([AGENT_PATIYA], hours=3)
    row = request_row(req_id)
    assert clock.as_utc(row.needed_by) == T0 + timedelta(hours=3)
    claimed = act(client, req_id, "claim", AGENT_PATIYA).json()
    assert claimed["claim_expires_at"] == (T0 + timedelta(minutes=20)).isoformat().replace(
        "+00:00", "Z")
    fake_clock.now = T0 + timedelta(minutes=19)
    assert help_trigger_run.tick()["reopened"] == 0  # not yet
    fake_clock.now = T0 + timedelta(minutes=21)
    assert help_trigger_run.tick()["reopened"] == 1  # the scheduler's tick releases it
    assert request_row(req_id).status.value == "open"
    fake_clock.now = T0 + timedelta(hours=3, minutes=1)
    assert help_trigger_run.tick()["expired"] == 1


def _signals_with_median(median_h: float) -> Any:
    def fake(session: Session, now: Any, tp: TriggerPolicy, demo: Any) -> dict[Any, Any]:
        out = {}
        for agent in session.scalars(select(Agent).where(Agent.is_active.is_(True))):
            for ft in FloatType:
                short = (agent.code, ft) == ("AGT-0001", FloatType.cash)
                out[(agent.id, ft)] = trig.Signal(
                    agent=agent, float_type=ft, balance=12_000.0 if short else 1_000_000.0,
                    level=RiskLevelCode.red if short else None,
                    drain=np.full((24, 3), 3000.0) if short else np.zeros((24, 3)),
                    inflow=np.zeros((24, 3)), median_h=median_h if short else None,
                    buffer=0.0, simulated=False)
        return out
    return fake


def test_request_countdown_matches_the_agent_page(client: TestClient, seeded: Path,
                                                  fake_clock: FakeClock,
                                                  monkeypatch: pytest.MonkeyPatch) -> None:
    """The agent page says "stock-out in 5 h" (median); the request made now says stock-out at
    now + 5 h, and its deadline is earlier (cautious path 4 h, minus the 1 h lead margin)."""
    arrange_neighbours()
    monkeypatch.setattr(trig, "signals", _signals_with_median(5.0))
    rid = help_trigger_run.run_trigger(clock.now()).created[0]
    owner = client.get(f"{API}/{rid}", headers=bearer(client, AGENT_MIRPUR)).json()
    stockout = datetime.fromisoformat(owner["stockout_at"].replace("Z", "+00:00"))
    needed_by = datetime.fromisoformat(owner["needed_by"].replace("Z", "+00:00"))
    assert stockout - T0 == timedelta(hours=5)  # same hours as the agent page shows
    assert needed_by - T0 == timedelta(hours=3)  # 12 000 / 3 000 = 4 h, minus 1 h lead
    assert needed_by < stockout
    helper = client.get(f"{API}/{rid}", headers=bearer(client, AGENT_PATIYA)).json()
    assert "stockout_at" not in helper  # helpers never see forecast times


def test_notifications_say_the_deadline_in_words_with_a_deep_link(
        client: TestClient, seeded: Path, fake_clock: FakeClock) -> None:
    set_lang(AGENT_PATIYA, Lang.en)
    set_lang(DIST_DHAKA, Lang.bn)
    req_id, _ = make_request([AGENT_PATIYA, DIST_DHAKA], hours=2)  # 17:00 Dhaka
    patiya = help_params(req_id, AGENT_PATIYA)[0]
    assert patiya["needed_by"] == "today at 5:00 PM" and EN_TIME.match(patiya["needed_by"])
    assert patiya["link"] == "/agent/help"
    dist = help_params(req_id, DIST_DHAKA)[0]
    assert dist["needed_by"] == "আজ বিকেল 5:00"
    assert dist["link"] == f"/distributor/help-requests/{req_id}"
    mirpur = help_params(req_id, AGENT_MIRPUR)[0]  # the requester's "created" notice
    assert mirpur["link"] == "/agent/help"
    for params in (patiya, dist, mirpur):
        assert "T" not in str(params["needed_by"]) and "+00:00" not in str(params["needed_by"])
    act(client, req_id, "cancel", ADMIN)
    assert all(p["link"].startswith("/") for p in help_params(req_id, AGENT_PATIYA))
