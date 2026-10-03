"""DEMO_MODE help requests: the admin simulation is never held back by the cooldown, daily cap
or recent-ask window; the demo reset; demo defaults; the demo cap on automatic requests; the
start delay only after a fresh bootstrap. With DEMO_MODE off the real rules stay unchanged."""

from dataclasses import asdict
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

import bootstrap
from app.core import clock
from app.core.config import get_settings
from app.core.db import get_engine
from app.core.leader import Leader
from app.models import Agent, AuditLog, SystemMeta
from app.models.enums import FloatType, HelpOrigin, HelpStatus, RiskLevelCode
from app.rules.help_trigger_rules import TriggerPolicy
from app.services import help_scheduler, help_settings, help_trigger_run, liquidity_requests
from app.services import help_trigger as trig
from app.services.liquidity_requests import Candidate, HelpError, now_utc
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, agent_id, bearer
from tests.help_helpers import (
    ADMIN_API,
    AGENT_SUNAMGANJ,
    TRIGGER_API,
    act,
    make_request,
    request_row,
    responses,
    set_policy,
    user_id,
)
from tests.test_help_trigger_service import REQUESTER, arrange_neighbours, install_signals

SIMULATE = f"{ADMIN_API}/simulate-shortage"
RESET = f"{ADMIN_API}/demo-reset"
DEMO = f"{ADMIN_API}/demo"
Key = tuple[int, FloatType]


def _env(monkeypatch: pytest.MonkeyPatch, **values: str) -> None:
    for k, v in values.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()


def _demo_signals(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only the simulated agent and float are short (one hour of float); everyone else has
    plenty, so the neighbours can help."""

    def fake(session: Session, now: Any, tp: TriggerPolicy,
             demo: trig.Demo | None) -> dict[Key, trig.Signal]:
        out: dict[Key, trig.Signal] = {}
        for agent in session.scalars(select(Agent).where(Agent.is_active.is_(True))):
            for ft in FloatType:
                hit = demo is not None and (demo.agent_id, demo.float_type) == (agent.id, ft)
                out[(agent.id, ft)] = trig.Signal(
                    agent=agent, float_type=ft, balance=3000.0 if hit else 1_000_000.0,
                    level=RiskLevelCode.red if hit else None,
                    drain=np.full((24, 3), 3000.0) if hit else np.zeros((24, 3)),
                    inflow=np.zeros((24, 3)), median_h=None, buffer=0.0, simulated=hit)
        return out

    monkeypatch.setattr(trig, "signals", fake)


def _simulate(client: TestClient, float_type: str = "cash") -> Any:
    return client.post(SIMULATE, json={"agent_id": agent_id(REQUESTER), "float_type": float_type},
                       headers=bearer(client, ADMIN))


def _audit(action: str) -> list[AuditLog]:
    with Session(get_engine()) as s:
        return list(s.scalars(select(AuditLog).where(AuditLog.action == action)))


# --- simulate: never blocked by the limits ------------------------------------------------------

def test_simulate_works_after_cap_cooldown_and_recent_ask(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    _demo_signals(monkeypatch)
    set_policy(client, daily_cap_per_agent=1, cooldown_min=600)
    # An earlier emoney request: AGT-0001 is in cooldown and at its cap, Patiya asked just now.
    make_request([AGENT_PATIYA], float_type=FloatType.emoney)
    res = _simulate(client)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["blocked_reason"] is None and body["sent"] is True
    (req_id,) = body["created_request_ids"]
    row = request_row(req_id)
    assert row.simulated is True and row.float_type == FloatType.cash
    assert AGENT_PATIYA in responses(req_id)  # the recent-ask window did not leave them out
    created = [a for a in _audit("liquidity_request.create") if a.entity_id == str(req_id)]
    assert created and created[0].payload["simulated"] is True
    assert _audit("help_demo.simulate_shortage")


def test_scheduler_still_respects_the_limits_for_a_simulated_shortage(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Only the admin's own simulate call skips the limits; the scheduler tick does not."""
    arrange_neighbours()
    _demo_signals(monkeypatch)
    set_policy(client, cooldown_min=600)
    (first,) = _simulate(client).json()["created_request_ids"]
    act(client, first, "cancel", DIST_DHAKA)
    tick = help_trigger_run.run_trigger(now_utc())
    assert tick.created == []
    assert [p.skipped for p in tick.plans if p.verdict.fires] == ["cooldown"]


def test_simulate_gives_a_clear_reason_when_it_cannot(client: TestClient, seeded: Path,
                                                      monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    _demo_signals(monkeypatch)
    assert _simulate(client).json()["created_request_ids"]
    again = _simulate(client).json()  # already one open for this agent and float
    assert again["created_request_ids"] == [] and again["blocked_reason"] == "active_request"
    set_policy(client, enabled=False)
    off = _simulate(client, "emoney").json()
    assert off["blocked_reason"] == "feature_disabled" and off["created_request_ids"] == []


# --- reset ---------------------------------------------------------------------------------------

def test_reset_cancels_open_requests_and_clears_caps(client: TestClient, seeded: Path,
                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_policy(client, daily_cap_per_agent=1, cooldown_min=600)
    open_id, _ = make_request([AGENT_PATIYA])
    _demo_signals(monkeypatch)
    _simulate(client, "emoney")
    res = client.post(RESET, headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    body = res.json()
    assert open_id in body["cancelled_request_ids"] and agent_id(REQUESTER) in body["agent_ids"]
    assert request_row(open_id).status == HelpStatus.cancelled  # kept, not deleted
    (row,) = _audit("help_demo.reset")
    assert row.payload["cancelled_request_ids"] == body["cancelled_request_ids"]
    with Session(get_engine()) as s:
        assert s.get(SystemMeta, trig.DEMO_KEY) is None  # the simulated shortage ended
        assert trig.abuse_block(s, agent_id(REQUESTER), now_utc(),
                                help_settings.current(s)) is None
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    assert len(help_trigger_run.run_trigger(now_utc()).created) == 1  # a clean start
    info = client.get(DEMO, headers=bearer(client, ADMIN)).json()
    assert info["last_reset_at"] is not None


@pytest.mark.parametrize("who", [AGENT_MIRPUR, DIST_DHAKA])
def test_only_admins_can_reset(client: TestClient, seeded: Path, who: str) -> None:
    assert client.post(RESET, headers=bearer(client, who)).status_code == 403
    assert _audit("help_demo.reset") == []


# --- demo defaults -------------------------------------------------------------------------------

def test_demo_defaults_apply_and_admin_settings_win(client: TestClient, seeded: Path,
                                                    monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch, HELP_DEMO_DEFAULTS="true")
    h = bearer(client, ADMIN)
    trigger = client.get(TRIGGER_API, headers=h).json()
    assert (trigger["max_request_bdt"], trigger["wave_timeout_min"], trigger["max_waves"],
            trigger["recent_ask_h"]) == (100_000.0, 2, 3, 0.0)
    assert client.get(f"{ADMIN_API}/settings", headers=h).json()["max_recipients_per_wave"] == 1
    info = client.get(DEMO, headers=h).json()
    assert info["demo_mode"] is True and info["defaults_on"] is True
    assert {o["name"] for o in info["overrides"]} == {
        "max_recipients_per_wave", "max_request_bdt", "wave_timeout_min", "max_waves",
        "recent_ask_h"}
    assert client.put(TRIGGER_API, json={"wave_timeout_min": 5}, headers=h).status_code == 200
    assert client.get(TRIGGER_API, headers=h).json()["wave_timeout_min"] == 5
    names = {o["name"] for o in client.get(DEMO, headers=h).json()["overrides"]}
    assert "wave_timeout_min" not in names and "max_waves" in names


# --- demo cap on automatic requests --------------------------------------------------------------

def _auto_twice(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> list[int]:
    arrange_neighbours()
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    set_policy(client, cooldown_min=0)
    first = help_trigger_run.run_trigger(now_utc()).created
    assert len(first) == 1
    act(client, first[0], "cancel", DIST_DHAKA)
    return help_trigger_run.run_trigger(now_utc()).created


def test_auto_trigger_makes_one_request_per_agent_float_day(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch, HELP_DEMO_AUTO_PER_DAY="1")
    assert _auto_twice(client, monkeypatch) == []
    with Session(get_engine()) as s:
        plans = trig.plan(s, now_utc(), help_settings.trigger_current(s),
                          help_settings.current(s))
    assert [p.skipped for p in plans if p.verdict.fires] == ["demo_daily_auto"]


def test_auto_cap_is_configurable(client: TestClient, seeded: Path,
                                  monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch, HELP_DEMO_AUTO_PER_DAY="2")
    assert len(_auto_twice(client, monkeypatch)) == 1


# --- DEMO_MODE off: nothing changes --------------------------------------------------------------

def test_nothing_changes_without_demo_mode(client: TestClient, seeded: Path,
                                           monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch, DEMO_MODE="false", HELP_DEMO_DEFAULTS="true", HELP_DEMO_AUTO_PER_DAY="1")
    assert help_settings.defaults() == help_settings._env_defaults()
    assert asdict(help_settings.trigger_defaults()) == asdict(
        help_settings._env_trigger_defaults())
    h = bearer(client, ADMIN)
    assert _simulate(client).status_code == 404
    assert client.post(RESET, headers=h).json()["detail"] == "demo_mode_off"
    info = client.get(DEMO, headers=h).json()
    assert info["demo_mode"] is False and info["overrides"] == []
    assert len(_auto_twice(client, monkeypatch)) == 1  # no demo auto cap
    # The demo bypass is ignored: a simulated create still meets the cooldown.
    set_policy(client, cooldown_min=600)
    with Session(get_engine()) as s, pytest.raises(HelpError, match="cooldown"):
        liquidity_requests.create(
            s, requester_agent_id=agent_id(REQUESTER), float_type=FloatType.emoney,
            amount_needed=Decimal("5000"),
            needed_by=now_utc() + timedelta(hours=3),
            candidates=[Candidate(user_id(AGENT_SUNAMGANJ), 2.0)],
            created_by=HelpOrigin.system, simulated=True, bypass_limits=True)


# --- start delay only after a fresh bootstrap ----------------------------------------------------

def _leader() -> Leader:
    return Leader(get_engine(), "help-scheduler", help_scheduler.LOCK_ID)


def _scheduler_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(help_scheduler, "_start", {"ticked": False})
    _env(monkeypatch, HELP_SCHEDULER_DEMO_START_DELAY_S="120")
    get_settings().bootstrap_state_file.write_text("ready", encoding="utf-8")


def test_restart_of_an_existing_database_does_not_wait(client: TestClient, seeded: Path,
                                                       monkeypatch: pytest.MonkeyPatch) -> None:
    _scheduler_env(monkeypatch)
    leader = _leader()
    try:
        assert help_scheduler.run_once(leader, 60) == "ran"  # no fresh-bootstrap stamp
    finally:
        leader.release()


def test_an_old_fresh_bootstrap_does_not_wait(client: TestClient, seeded: Path,
                                              monkeypatch: pytest.MonkeyPatch) -> None:
    _scheduler_env(monkeypatch)
    with Session(get_engine()) as s, s.begin():
        s.merge(SystemMeta(key=help_scheduler.FRESH_READY_KEY,
                           value=(clock.now() - timedelta(hours=3)).isoformat()))
    leader = _leader()
    try:
        assert help_scheduler.run_once(leader, 60) == "ran"
    finally:
        leader.release()


def test_mark_ready_stamps_only_a_freshly_seeded_run(client: TestClient, seeded: Path) -> None:
    def meta(key: str) -> object:
        with Session(get_engine()) as s:
            row = s.get(SystemMeta, key)
            return None if row is None else row.value

    assert bootstrap.mark_ready() == 0
    assert meta(help_scheduler.FRESH_READY_KEY) is None  # a restart: no stamp
    with Session(get_engine()) as s, s.begin():
        s.merge(SystemMeta(key=help_scheduler.FRESH_SEED_KEY, value=True))  # seed() ran
    assert bootstrap.mark_ready() == 0
    stamp = meta(help_scheduler.FRESH_READY_KEY)
    assert isinstance(stamp, str) and meta(help_scheduler.FRESH_SEED_KEY) is False
    assert help_scheduler.fresh_ready_at() is not None
    assert bootstrap.mark_ready() == 0
    assert meta(help_scheduler.FRESH_READY_KEY) == stamp  # the next restart keeps the old stamp
