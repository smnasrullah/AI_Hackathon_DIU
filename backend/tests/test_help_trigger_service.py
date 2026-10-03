"""Automatic help trigger on the database: candidates, dry run, kill switch, cooldown, waves,
escalation. The forecast is replaced by fixed signals (no trained model needed here); the real
forecast path is covered by the slow story test."""

from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Agent, AuditLog, LiquidityRequest
from app.models.enums import FloatType, HelpOrigin, HelpResponse, RiskLevelCode, UserRole
from app.rules.help_trigger_rules import TriggerPolicy
from app.services import help_settings, help_trigger_run, help_waves
from app.services import help_trigger as trig
from app.services.liquidity_requests import Candidate, create, now_utc
from tests.auth_helpers import ADMIN, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.help_helpers import (
    AGENT_SUNAMGANJ,
    audits,
    notes,
    request_row,
    responses,
    set_policy,
    set_trigger,
    user_id,
)

REQUESTER = "AGT-0001"  # Mirpur, distributor DST-DHK; made short of cash by the fake signals
NEAR, FAR = "AGT-0002", "AGT-0003"  # AGENT_PATIYA (nearer), AGENT_SUNAMGANJ (farther)
TRIGGER_API = "/api/v1/admin/liquidity-requests/trigger-settings"
Key = tuple[int, FloatType]


def arrange_neighbours() -> None:
    """Put the two demo agents under the requester's distributor, close by, in a known order."""
    with Session(get_engine()) as s, s.begin():
        req = s.scalar(select(Agent).where(Agent.code == REQUESTER))
        assert req is not None
        for code, step in ((NEAR, 0.01), (FAR, 0.02)):
            a = s.scalar(select(Agent).where(Agent.code == code))
            assert a is not None
            a.distributor_id, a.lat, a.lng, a.is_active = (
                req.distributor_id, req.lat + step, req.lng + step, True)


def install_signals(monkeypatch: pytest.MonkeyPatch, *, short: tuple[str, FloatType] | None,
                    balances: dict[str, float] | None = None,
                    short_balance: float = 3000.0) -> None:
    """Fixed signals for every agent. The `short` agent and float: red, `short_balance` left
    (default one hour of float: short, but not urgent), drained at 3 000 BDT an hour. Everyone
    else holds a large balance and has no drain."""
    overrides = balances or {}

    def fake(session: Session, now: Any, tp: TriggerPolicy, demo: Any) -> dict[Key, trig.Signal]:
        out: dict[Key, trig.Signal] = {}
        for agent in session.scalars(select(Agent).where(Agent.is_active.is_(True))):
            for ft in FloatType:
                hit = short == (agent.code, ft)
                out[(agent.id, ft)] = trig.Signal(
                    agent=agent, float_type=ft,
                    balance=short_balance if hit else overrides.get(agent.code, 1_000_000.0),
                    level=RiskLevelCode.red if hit else None,
                    drain=np.full((24, 3), 3000.0) if hit else np.zeros((24, 3)),
                    inflow=np.zeros((24, 3)), median_h=None, buffer=0.0, simulated=False)
        return out

    monkeypatch.setattr(trig, "signals", fake)


def count_requests() -> int:
    with Session(get_engine()) as s:
        return len(s.scalars(select(LiquidityRequest.id)).all())


def fired(plans: list[trig.AgentPlan]) -> list[str | None]:
    return [p.skipped for p in plans if p.verdict.fires]


def test_candidates_skip_opted_out_and_short_helpers(client: TestClient, seeded: Path,
                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    install_signals(monkeypatch, short=None, balances={FAR: 100.0})  # FAR cannot cover 25 000
    with Session(get_engine()) as s, s.begin():
        s.scalar(select(Agent).where(Agent.code == NEAR)).help_opt_out = True
    now, tp = now_utc(), TriggerPolicy()
    with Session(get_engine()) as s:
        req = s.scalar(select(Agent).where(Agent.code == REQUESTER))
        assert req is not None
        pool = trig.ranked_helpers(s, req, FloatType.cash, 25_000.0, now, tp,
                                   trig.signals(s, now, tp, None), set())
    assert [a.role for a in pool.distributors] == [UserRole.distributor]
    assert pool.agents == []  # NEAR opted out, FAR would become short


def test_ranking_leaves_out_agents_asked_recently(client: TestClient, seeded: Path,
                                                  monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    install_signals(monkeypatch, short=None)
    with Session(get_engine()) as s, s.begin():
        req = s.scalar(select(Agent).where(Agent.code == REQUESTER))
        assert req is not None
        create(s, requester_agent_id=req.id, float_type=FloatType.cash,
               amount_needed=Decimal("5000"), needed_by=now_utc() + timedelta(hours=3),
               reason_summary=None, candidates=[Candidate(user_id(AGENT_SUNAMGANJ), 2.0)],
               created_by=HelpOrigin.system)  # FAR was asked just now
    now, tp = now_utc(), TriggerPolicy()
    with Session(get_engine()) as s:
        req = s.scalar(select(Agent).where(Agent.code == REQUESTER))
        assert req is not None
        pool = trig.ranked_helpers(s, req, FloatType.emoney, 25_000.0, now, tp,
                                   trig.signals(s, now, tp, None), set())
    assert [a.display for a in pool.agents] == [NEAR]


def test_run_creates_once_and_respects_kill_switch_and_dry_run(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    set_policy(client, dry_run=True)
    dry = help_trigger_run.run_trigger(now_utc())
    assert dry.created == [] and count_requests() == 0
    assert fired(dry.plans) == [None]  # the plan knows what it would do

    set_policy(client, dry_run=False, enabled=False)
    assert help_trigger_run.run_trigger(now_utc()).created == [] and count_requests() == 0

    set_policy(client, enabled=True)
    first = help_trigger_run.run_trigger(now_utc())
    assert len(first.created) == 1 and count_requests() == 1
    row = request_row(first.created[0])
    assert row.created_by == HelpOrigin.system and row.simulated is False
    assert row.wave_started_at is not None and row.amount_needed > 0

    second = help_trigger_run.run_trigger(now_utc())  # same shortage again: no duplicate
    assert second.created == [] and count_requests() == 1
    assert fired(second.plans) == ["active_request"]


def test_cooldown_blocks_a_second_request_for_the_same_agent(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    assert len(help_trigger_run.run_trigger(now_utc()).created) == 1
    install_signals(monkeypatch, short=(REQUESTER, FloatType.emoney))  # other float, too soon
    report = help_trigger_run.run_trigger(now_utc())
    assert report.created == [] and fired(report.plans) == ["cooldown"]
    assert count_requests() == 1


def test_wave_one_is_the_distributor_plus_the_best_agent(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_policy(client, max_recipients_per_wave=1)
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    rid = help_trigger_run.run_trigger(now_utc()).created[0]
    assert set(responses(rid)) == {DIST_DHAKA, AGENT_PATIYA}  # distributor always, then nearest


def test_waves_advance_once_then_escalate(client: TestClient, seeded: Path,
                                          monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_policy(client, max_recipients_per_wave=1)
    set_trigger(client, wave_timeout_min=1, max_waves=2)
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    t0 = now_utc()
    rid = help_trigger_run.run_trigger(t0).created[0]

    assert help_waves.advance_due(t0 + timedelta(seconds=30)) == (0, 0)  # not waited long enough
    assert help_waves.advance_due(t0 + timedelta(minutes=2)) == (1, 0)  # wave 2 goes out
    assert set(responses(rid)) == {DIST_DHAKA, AGENT_PATIYA, AGENT_SUNAMGANJ}
    assert request_row(rid).wave_number == 2
    assert "still_open" in notes(rid)[AGENT_PATIYA]  # the earlier recipient stays informed
    assert notes(rid)[AGENT_SUNAMGANJ] == ["new"]

    assert help_waves.advance_due(t0 + timedelta(minutes=2)) == (0, 0)  # same moment: no-op
    assert help_waves.advance_due(t0 + timedelta(minutes=2, seconds=10)) == (0, 0)

    assert help_waves.advance_due(t0 + timedelta(minutes=4)) == (0, 1)  # no wave left
    assert request_row(rid).status.value == "expired"
    assert help_waves.advance_due(t0 + timedelta(minutes=6)) == (0, 0)  # already ended
    assert "escalated" in notes(rid)[ADMIN]
    assert "escalated" in notes(rid)[DIST_DHAKA]
    assert "expired" in notes(rid)[AGENT_PATIYA]
    assert any(a.action == "liquidity_request.exhaust" for a in audits(rid))


def test_two_workers_send_the_same_wave_only_once(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_policy(client, max_recipients_per_wave=1)
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    rid = help_trigger_run.run_trigger(now_utc()).created[0]
    now = now_utc() + timedelta(minutes=5)
    member = [trig.Ask(user_id(AGENT_SUNAMGANJ), FAR, UserRole.agent, 2.0)]
    with Session(get_engine()) as s:
        hp = help_settings.current(s)
    with Session(get_engine()) as slow:
        stale = slow.get(LiquidityRequest, rid)  # this worker read wave 1 and is still busy
        assert stale is not None
        with Session(get_engine()) as fast, fast.begin():
            fresh = fast.get(LiquidityRequest, rid)
            assert fresh is not None
            assert help_waves._send_wave(fast, fresh, member, now, hp) == "advanced"
        assert help_waves._send_wave(slow, stale, member, now, hp) == "skipped"
    assert request_row(rid).wave_number == 2
    assert responses(rid)[AGENT_SUNAMGANJ] == HelpResponse.none


def test_no_forecast_means_nothing_is_planned_or_written(client: TestClient,
                                                         seeded: Path) -> None:
    report = help_trigger_run.run_trigger(now_utc())
    assert report.plans == [] and report.created == [] and count_requests() == 0
    assert help_trigger_run.tick()["requests_created"] == 0


def test_trigger_settings_are_audited_and_bounded(client: TestClient, seeded: Path) -> None:
    assert set_trigger(client, buffer_pct=30.0)["buffer_pct"] == 30.0
    with Session(get_engine()) as s:
        row = s.scalars(select(AuditLog).where(
            AuditLog.action == "help_trigger_settings.update")).all()[-1]
        assert row.payload["after"]["buffer_pct"] == 30.0
    res = client.put(TRIGGER_API, json={"max_waves": 0}, headers=bearer(client, ADMIN))
    assert res.status_code == 422
