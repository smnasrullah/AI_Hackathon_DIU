"""Help trigger over HTTP: admin-only tools, demo helper gating and audit, opt-out, privacy."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_engine
from app.models import Agent, AuditLog
from app.models.enums import FloatType
from tests.auth_helpers import (
    ADMIN,
    AGENT_MIRPUR,
    AGENT_PATIYA,
    DIST_DHAKA,
    agent_id,
    bearer,
)
from tests.help_helpers import ADMIN_API, AGENT_SUNAMGANJ, API, make_request, set_trigger

DRY_RUN = f"{ADMIN_API}/dry-run"
SIMULATE = f"{ADMIN_API}/simulate-shortage"
OPT_OUT = f"{API}/opt-out"
SETTINGS = f"{ADMIN_API}/trigger-settings"


def _audit_actions() -> list[str]:
    with Session(get_engine()) as s:
        return list(s.scalars(select(AuditLog.action)))


def test_trigger_tools_are_admin_only(client: TestClient, seeded: Path) -> None:
    agent = bearer(client, AGENT_MIRPUR)
    assert client.get(SETTINGS, headers=agent).status_code == 403
    assert client.put(SETTINGS, json={}, headers=agent).status_code == 403
    assert client.post(DRY_RUN, json={}, headers=agent).status_code == 403
    assert client.post(SIMULATE, json={"agent_id": agent_id("AGT-0001"),
                                       "float_type": "cash"}, headers=agent).status_code == 403
    dist = bearer(client, DIST_DHAKA)
    assert client.post(DRY_RUN, json={}, headers=dist).status_code == 403


def test_dry_run_reports_and_sends_nothing(client: TestClient, seeded: Path) -> None:
    set_trigger(client, horizon_h=3)
    res = client.post(DRY_RUN, json={"agent_ids": [agent_id("AGT-0001")]},
                      headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sent"] is False and body["would_create"] == 0 and body["items"] == []
    with Session(get_engine()) as s:
        assert s.scalars(select(AuditLog.id).where(
            AuditLog.action.like("liquidity_request.%"))).first() is None


def test_demo_helper_is_unavailable_when_demo_mode_is_off(
        client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    res = client.post(SIMULATE, json={"agent_id": agent_id("AGT-0001"), "float_type": "cash"},
                      headers=bearer(client, ADMIN))
    assert (res.status_code, res.json()["detail"]) == (404, "demo_mode_off")
    assert "help_demo.simulate_shortage" not in _audit_actions()


def test_demo_helper_is_audited_when_on(client: TestClient, seeded: Path) -> None:
    res = client.post(SIMULATE, json={"agent_id": agent_id("AGT-0001"), "float_type": "cash"},
                      headers=bearer(client, ADMIN))
    # No trained forecast in this fast test, so there is nothing to act on: a clear 409.
    assert (res.status_code, res.json()["detail"]) == (409, "no_forecast")
    assert "help_demo.simulate_shortage" in _audit_actions()
    with Session(get_engine()) as s:
        row = s.scalars(select(AuditLog).where(
            AuditLog.action == "help_demo.simulate_shortage")).one()
        assert row.payload["simulated"] is True and row.payload["float_type"] == FloatType.cash


def test_demo_helper_rejects_unknown_agent(client: TestClient, seeded: Path) -> None:
    res = client.post(SIMULATE, json={"agent_id": 999_999, "float_type": "cash"},
                      headers=bearer(client, ADMIN))
    assert (res.status_code, res.json()["detail"]) == (404, "unknown_agent")


def test_agent_can_opt_out_of_being_asked(client: TestClient, seeded: Path) -> None:
    res = client.post(OPT_OUT, json={"opted_out": True}, headers=bearer(client, AGENT_PATIYA))
    assert res.status_code == 200 and res.json() == {"opted_out": True}
    with Session(get_engine()) as s:
        assert s.scalar(select(Agent.help_opt_out).where(Agent.code == "AGT-0002")) is True
    back = client.post(OPT_OUT, json={"opted_out": False}, headers=bearer(client, AGENT_PATIYA))
    assert back.json() == {"opted_out": False}
    denied = client.post(OPT_OUT, json={"opted_out": True}, headers=bearer(client, DIST_DHAKA))
    assert denied.status_code == 403


def test_recipient_view_shows_no_balances_or_forecast(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request([AGENT_PATIYA, AGENT_SUNAMGANJ], amount="25000")
    res = client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_PATIYA))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["view"] == "recipient"
    assert body["requester"]["code"] == "AGT-0001"  # name and area are fine to show
    assert body["amount_needed"] == 25000.0 and body["float_type"] == "cash"
    assert body["reason_summary"] is None and body["recipients"] is None
    assert body["claimed_by"] is None
    text = str(body).lower()
    for leaked in ("balance", "forecast", "quantile", "stockout", "buffer", "surplus"):
        assert leaked not in text
    assert body["simulated"] is False
