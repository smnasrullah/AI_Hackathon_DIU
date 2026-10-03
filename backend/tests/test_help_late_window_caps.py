"""Late confirm after expiry (grace window), "as soon as possible" deadlines, the per-tick cap
on new requests, the DEMO_MODE start delay, and helper-facing schema optionality."""

from datetime import timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import get_settings
from app.core.db import get_engine
from app.core.leader import Leader
from app.main import create_app
from app.models import Agent, SystemMeta, User
from app.models.enums import FloatType, Lang, RiskLevelCode
from app.rules import help_trigger_rules as rules
from app.rules.help_trigger_rules import TriggerPolicy
from app.services import help_scheduler, help_trigger_run, liquidity_requests
from app.services import help_trigger as trig
from tests.auth_helpers import AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.help_helpers import (
    AGENT_SUNAMGANJ,
    API,
    act,
    audits,
    help_params,
    make_request,
    request_row,
    set_lang,
    set_policy,
    set_trigger,
)
from tests.test_help_clock import T0, FakeClock
from tests.test_help_trigger_service import REQUESTER, arrange_neighbours, install_signals

HELPERS = [AGENT_PATIYA, AGENT_SUNAMGANJ, DIST_DHAKA]


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeClock:
    f = FakeClock(T0)
    monkeypatch.setattr(clock, "_source", f)
    return f


def _expire_after_lapse(client: TestClient, fake: FakeClock, lapse: bool = True) -> int:
    """A 1 h request; Patiya's claim times out (if `lapse`), then the request expires at T0+1h.
    Every helper is in wave 1, so waves are held back (long wave timeout) to test the deadline."""
    set_trigger(client, wave_timeout_min=1440)
    req_id, _ = make_request(HELPERS, hours=1)
    if lapse:
        assert act(client, req_id, "claim", AGENT_PATIYA).status_code == 200
        fake.now = T0 + timedelta(minutes=21)
        assert help_trigger_run.tick()["reopened"] == 1
    fake.now = T0 + timedelta(hours=1, minutes=1)
    assert help_trigger_run.tick()["expired"] == 1
    row = request_row(req_id)
    assert row.status.value == "expired" and row.expired_at is not None
    return req_id


# --- 2) late confirm after expiry -----------------------------------------------------------------

def test_late_confirm_on_expired_inside_the_grace_window(client: TestClient, seeded: Path,
                                                         fake: FakeClock) -> None:
    req_id = _expire_after_lapse(client, fake)
    fake.now = T0 + timedelta(hours=20)  # 19 h after expiry, default window 24 h
    assert client.get(f"{API}/{req_id}",
                      headers=bearer(client, AGENT_MIRPUR)).json()["can_confirm_late"] is True
    assert act(client, req_id, "confirm-late", AGENT_SUNAMGANJ).status_code == 403
    res = act(client, req_id, "confirm-late", DIST_DHAKA, {"note": "came next morning"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "fulfilled" and res.json()["claimed_by"]["display"] == "AGT-0002"
    last = audits(req_id)[-1]
    assert last.action == "liquidity_request.confirm_late"
    assert (last.payload["old_status"], last.payload["after_expiry"]) == ("expired", True)


def test_late_confirm_is_refused_after_the_window(client: TestClient, seeded: Path,
                                                 fake: FakeClock) -> None:
    set_policy(client, late_confirm_grace_h=2)
    req_id = _expire_after_lapse(client, fake)
    fake.now = T0 + timedelta(hours=3, minutes=2)  # 2 h 1 min after expiry
    assert client.get(f"{API}/{req_id}",
                      headers=bearer(client, AGENT_MIRPUR)).json()["can_confirm_late"] is False
    res = act(client, req_id, "confirm-late", AGENT_MIRPUR)
    assert (res.status_code, res.json()["detail"]) == (409, "late_window_passed")
    assert request_row(req_id).status.value == "expired"


def test_late_confirm_on_expired_needs_a_previous_claim(client: TestClient, seeded: Path,
                                                       fake: FakeClock) -> None:
    req_id = _expire_after_lapse(client, fake, lapse=False)
    res = act(client, req_id, "confirm-late", AGENT_MIRPUR)
    assert (res.status_code, res.json()["detail"]) == (409, "no_lapsed_claim")


def test_late_confirm_never_on_a_cancelled_request(client: TestClient, seeded: Path,
                                                  fake: FakeClock) -> None:
    set_trigger(client, wave_timeout_min=1440)  # no wave advance during the test
    req_id, _ = make_request(HELPERS, hours=2)
    act(client, req_id, "claim", AGENT_PATIYA)
    fake.now = T0 + timedelta(minutes=21)
    assert help_trigger_run.tick()["reopened"] == 1  # a lapsed claim exists
    assert act(client, req_id, "cancel", AGENT_MIRPUR).status_code == 200
    res = act(client, req_id, "confirm-late", AGENT_MIRPUR)
    assert (res.status_code, res.json()["detail"]) == (409, "invalid_transition")
    assert request_row(req_id).status.value == "cancelled"


# --- 3) deadline after the stock-out: "as soon as possible" -------------------------------------

def test_floor_past_the_stockout_is_flagged() -> None:
    p = TriggerPolicy()  # floor 15 min
    assert rules.deadline_after_stockout(0.1, p)  # stock-out in 6 min, deadline 15 min
    assert rules.deadline_after_stockout(0.0, p)
    assert not rules.deadline_after_stockout(0.25, p)  # exactly the floor: not after
    assert not rules.deadline_after_stockout(2.0, p)


def test_asap_request_says_so_in_api_and_notifications(client: TestClient, seeded: Path,
                                                       monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_lang(AGENT_PATIYA, Lang.en)
    set_lang(DIST_DHAKA, Lang.bn)
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash), short_balance=300.0)  # 6 min
    rid = help_trigger_run.run_trigger(clock.now()).created[0]
    assert request_row(rid).deadline_after_stockout is True
    for who in (AGENT_MIRPUR, AGENT_PATIYA):
        assert client.get(f"{API}/{rid}",
                          headers=bearer(client, who)).json()["deadline_asap"] is True
    helper = client.get(f"{API}/{rid}", headers=bearer(client, AGENT_PATIYA)).json()
    assert "stockout" not in str(helper).lower()  # the instruction, not the forecast
    assert help_params(rid, AGENT_PATIYA)[0]["needed_by"] == "as soon as possible"
    assert help_params(rid, DIST_DHAKA)[0]["needed_by"] == "যত তাড়াতাড়ি সম্ভব"


def test_normal_deadline_keeps_the_time(client: TestClient, seeded: Path,
                                        monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_lang(AGENT_PATIYA, Lang.en)
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash), short_balance=9000.0)  # 3 h
    rid = help_trigger_run.run_trigger(clock.now()).created[0]
    assert request_row(rid).deadline_after_stockout is False
    assert help_params(rid, AGENT_PATIYA)[0]["needed_by"] != "as soon as possible"


# --- 6) per-tick cap and the DEMO_MODE start delay ----------------------------------------------

def _all_short(monkeypatch: pytest.MonkeyPatch, balances: dict[str, float]) -> None:
    """Every listed agent is short of cash; a smaller balance runs out sooner."""
    def fake(session: Session, now: Any, tp: TriggerPolicy, demo: Any) -> dict[Any, Any]:
        out = {}
        for agent in session.scalars(select(Agent).where(Agent.is_active.is_(True))):
            for ft in FloatType:
                short = ft == FloatType.cash and agent.code in balances
                out[(agent.id, ft)] = trig.Signal(
                    agent=agent, float_type=ft,
                    balance=balances[agent.code] if short else 1_000_000.0,
                    level=RiskLevelCode.red if short else None,
                    drain=np.full((24, 3), 3000.0) if short else np.zeros((24, 3)),
                    inflow=np.zeros((24, 3)), median_h=None, buffer=0.0, simulated=False)
        return out
    monkeypatch.setattr(trig, "signals", fake)


def test_new_requests_per_tick_are_capped_most_urgent_first(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    assert TriggerPolicy().max_new_per_tick == 3 == get_settings().help_trigger_max_new_per_tick
    set_trigger(client, max_new_per_tick=1)
    _all_short(monkeypatch, {"AGT-0001": 9000.0, "AGT-0002": 3000.0, "AGT-0003": 6000.0})
    order = []
    for _ in range(3):
        report = help_trigger_run.run_trigger(clock.now())
        assert len(report.created) == 1
        order.append(request_row(report.created[0]).requester_agent_id)
        waiting = [p for p in report.plans if p.skipped == "tick_cap"]
        assert len(waiting) == 2 - len(order) + 1
    with Session(get_engine()) as s:
        codes = {a.id: a.code for a in s.scalars(select(Agent))}
    assert [codes[i] for i in order] == ["AGT-0002", "AGT-0003", "AGT-0001"]  # 1 h, 2 h, 3 h
    assert help_trigger_run.run_trigger(clock.now()).created == []  # dedupe still holds


def test_dry_run_lists_only_this_ticks_requests(client: TestClient, seeded: Path,
                                                monkeypatch: pytest.MonkeyPatch) -> None:
    set_trigger(client, max_new_per_tick=2)
    set_policy(client, dry_run=True)
    _all_short(monkeypatch, {"AGT-0001": 9000.0, "AGT-0002": 3000.0, "AGT-0003": 6000.0})
    report = help_trigger_run.run_trigger(clock.now())
    assert [p.agent_code for p in report.would_create] == ["AGT-0002", "AGT-0003"]
    assert [p.agent_code for p in report.plans if p.skipped == "tick_cap"] == ["AGT-0001"]


def test_demo_mode_holds_the_first_tick(client: TestClient, seeded: Path,
                                        monkeypatch: pytest.MonkeyPatch, fake: FakeClock) -> None:
    monkeypatch.setattr(help_scheduler, "_start", {"ticked": False})
    monkeypatch.setenv("HELP_SCHEDULER_DEMO_START_DELAY_S", "120")
    get_settings.cache_clear()
    get_settings().bootstrap_state_file.write_text("ready", encoding="utf-8")
    with Session(get_engine()) as s, s.begin():  # a fresh bootstrap became ready at T0
        s.merge(SystemMeta(key=help_scheduler.FRESH_READY_KEY, value=T0.isoformat()))
    leader = Leader(get_engine(), "help-scheduler", help_scheduler.LOCK_ID)
    try:
        assert help_scheduler.run_once(leader, 60) == "demo_delay"  # fresh, ready at T0
        fake.now = T0 + timedelta(seconds=119)
        assert help_scheduler.run_once(leader, 60) == "demo_delay"
        fake.now = T0 + timedelta(seconds=120)
        assert help_scheduler.run_once(leader, 60) == "ran"
        fake.now = T0 + timedelta(seconds=180)
        assert help_scheduler.run_once(leader, 60) == "ran"  # only the first tick waits
    finally:
        leader.release()


def test_without_demo_mode_the_first_tick_is_not_held(client: TestClient, seeded: Path,
                                                      monkeypatch: pytest.MonkeyPatch,
                                                      fake: FakeClock) -> None:
    monkeypatch.setattr(help_scheduler, "_start", {"ticked": False})
    monkeypatch.setenv("HELP_SCHEDULER_DEMO_START_DELAY_S", "120")
    monkeypatch.setenv("DEMO_MODE", "false")
    get_settings.cache_clear()
    get_settings().bootstrap_state_file.write_text("ready", encoding="utf-8")
    leader = Leader(get_engine(), "help-scheduler", help_scheduler.LOCK_ID)
    try:
        assert help_scheduler.run_once(leader, 60) == "ran"
    finally:
        leader.release()


# --- 4) helper-facing schema ---------------------------------------------------------------------

def test_fields_omitted_for_helpers_are_optional_in_the_schema(env: Path) -> None:
    item = create_app().openapi()["components"]["schemas"]["HelpRequestItem"]
    required = set(item.get("required", []))
    omitted = {"can_confirm_late", "stockout_at", "wave_number", "max_waves", "is_last_wave"}
    assert omitted & required == set()
    assert "default" not in item["properties"]["can_confirm_late"] or \
        item["properties"]["can_confirm_late"]["default"] is None
    always = {"urgent", "deadline_asap", "reason_category", "needed_by"}
    assert always <= set(item["properties"])


def test_late_confirm_service_rejects_cancelled_even_with_a_lapse(
        client: TestClient, seeded: Path, fake: FakeClock) -> None:
    """Same refusal straight through the service (no HTTP layer)."""
    set_trigger(client, wave_timeout_min=1440)  # no wave advance during the test
    req_id, _ = make_request(HELPERS, hours=2)
    act(client, req_id, "claim", AGENT_PATIYA)
    fake.now = T0 + timedelta(minutes=21)
    help_trigger_run.tick()
    act(client, req_id, "cancel", DIST_DHAKA)
    with Session(get_engine()) as s:
        user = s.scalar(select(User).where(User.email == AGENT_MIRPUR))
        assert user is not None
        with pytest.raises(liquidity_requests.HelpError, match="invalid_transition"):
            liquidity_requests.confirm_late(s, user, req_id)
