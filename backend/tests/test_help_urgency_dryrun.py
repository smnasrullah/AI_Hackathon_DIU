"""Deadline floor and urgency (bigger first wave), and dry-run / kill-switch clarity: the manual
run and the admin job say nothing was sent and list what WOULD have been."""

from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_engine
from app.models import Notification
from app.models.enums import FloatType
from app.rules import help_trigger_rules as rules
from app.rules.help_trigger_rules import TriggerPolicy
from app.services import help_trigger_run, jobs
from tests.auth_helpers import ADMIN, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.help_helpers import (
    ADMIN_API,
    AGENT_SUNAMGANJ,
    API,
    TRIGGER_API,
    request_row,
    responses,
    set_policy,
    set_trigger,
)
from tests.test_help_trigger_service import (
    REQUESTER,
    arrange_neighbours,
    count_requests,
    install_signals,
)

RUN = f"{ADMIN_API}/run-trigger"


def _notifications() -> int:
    with Session(get_engine()) as s:
        return s.scalar(select(func.count()).select_from(Notification)) or 0


def test_deadline_floor_defaults_to_15_minutes_and_is_configurable() -> None:
    assert rules.deadline_after(0.1, TriggerPolicy()) == timedelta(minutes=15)
    assert rules.deadline_after(0.1, TriggerPolicy(deadline_floor_min=45)) == timedelta(
        minutes=45)
    assert rules.deadline_after(3.0, TriggerPolicy(deadline_floor_min=45)) == timedelta(hours=2)
    assert get_settings().help_trigger_deadline_floor_min == 15
    for bad in ({"deadline_floor_min": 0}, {"urgent_wave_multiplier": 0.5}):
        with pytest.raises(ValueError):
            TriggerPolicy(**bad)  # type: ignore[arg-type]


def test_urgent_below_twice_the_floor_and_wave_one_grows() -> None:
    p = TriggerPolicy()  # floor 15 min: urgent below 30 min
    assert rules.is_urgent(0.49, p) and not rules.is_urgent(0.5, p)
    assert rules.is_urgent(0.9, TriggerPolicy(deadline_floor_min=30))
    assert rules.wave_one_agents(5, False, p) == 5
    assert rules.wave_one_agents(5, True, p) == 10
    assert rules.wave_one_agents(3, True, TriggerPolicy(urgent_wave_multiplier=1.5)) == 5


def test_urgent_request_asks_more_agents_first(client: TestClient, seeded: Path,
                                               monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_policy(client, max_recipients_per_wave=1)
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash), short_balance=0.0)
    rid = help_trigger_run.run_trigger(help_trigger_run.now_utc()).created[0]
    assert set(responses(rid)) == {DIST_DHAKA, AGENT_PATIYA, AGENT_SUNAMGANJ}  # 1 x 2 agents
    row = request_row(rid)
    assert row.urgent is True
    for who in (DIST_DHAKA, AGENT_PATIYA):  # owner side and helpers both see it is urgent
        assert client.get(f"{API}/{rid}", headers=bearer(client, who)).json()["urgent"] is True


def test_wave_multiplier_and_floor_are_admin_settings(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_policy(client, max_recipients_per_wave=1)
    body = set_trigger(client, urgent_wave_multiplier=1.0, deadline_floor_min=20)
    assert (body["urgent_wave_multiplier"], body["deadline_floor_min"]) == (1.0, 20)
    assert client.put(TRIGGER_API, json={"deadline_floor_min": 0},
                      headers=bearer(client, ADMIN)).status_code == 422
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash), short_balance=0.0)
    rid = help_trigger_run.run_trigger(help_trigger_run.now_utc()).created[0]
    assert request_row(rid).urgent is True
    assert set(responses(rid)) == {DIST_DHAKA, AGENT_PATIYA}  # multiplier 1: normal size


def test_manual_run_under_dry_run_lists_what_would_be_sent(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_policy(client, max_recipients_per_wave=1, dry_run=True)
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    before = _notifications()
    res = client.post(RUN, headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["dry_run"] is True and body["sent"] is False
    assert body["created_request_ids"] == []
    [would] = body["would_create"]
    assert (would["agent_code"], would["float_type"], would["fires"]) == ("AGT-0001", "cash", True)
    assert [a["display"] for a in would["asks"]] == ["DST-DHK", "AGT-0002"]
    assert would["reason_category"] == "unknown" and would["needed_by"] is not None
    assert count_requests() == 0 and _notifications() == before  # nothing written or sent

    set_policy(client, dry_run=False, enabled=False)  # kill switch: also nothing sent
    off = client.post(RUN, headers=bearer(client, ADMIN)).json()
    assert (off["enabled"], off["sent"], len(off["would_create"])) == (False, False, 1)
    assert count_requests() == 0

    set_policy(client, enabled=True)
    live = client.post(RUN, headers=bearer(client, ADMIN)).json()
    assert live["sent"] is True and len(live["created_request_ids"]) == 1
    assert live["would_create"] == [] and count_requests() == 1
    assert client.post(RUN, headers=bearer(client, AGENT_PATIYA)).status_code == 403


def test_admin_job_result_says_dry_run(client: TestClient, seeded: Path,
                                       monkeypatch: pytest.MonkeyPatch) -> None:
    arrange_neighbours()
    set_policy(client, max_recipients_per_wave=1, dry_run=True)
    install_signals(monkeypatch, short=(REQUESTER, FloatType.cash))
    result = jobs.RUNNERS["help_trigger"](get_settings(), 0, lambda step, pct: None)
    assert result["dry_run"] is True and result["sent"] is False
    assert result["would_create"] == 1 and result["requests_created"] == 0
    assert result["would_ask.AGT-0001.cash"] == "DST-DHK, AGT-0002"
