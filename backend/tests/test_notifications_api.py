"""Notifications: generated on risk recompute and swap events for the right users only; list,
mark read, read all; never another user's."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Notification
from app.rules.risk_rules import build_config
from app.services import rebalance, risk
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, agent_id, bearer
from tests.rebalance_helpers import RCFG, SCFG, build_market

API = "/api/v1/notifications"
DIST_CTG = "dist.chattogram@agentpulse.demo"
DIST_SYL = "dist.sylhet@agentpulse.demo"
AGENT_SUNAMGANJ = "agent.sunamganj@agentpulse.demo"


@pytest.fixture
def market(seeded: Path) -> Path:
    build_market()
    return seeded


def _page(client: TestClient, email: str, **params: Any) -> dict[str, Any]:
    res = client.get(API, params=params, headers=bearer(client, email))
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def _keys(client: TestClient, email: str) -> list[str]:
    return sorted(i["title_key"] for i in _page(client, email)["items"])


def _count() -> int:
    with Session(get_engine()) as session:
        return session.scalar(select(func.count()).select_from(Notification)) or 0


def test_risk_and_swap_events_reach_the_right_users(client: TestClient, market: Path) -> None:
    # AGT-0001 (Dhaka) and AGT-0002 (Chattogram) turn red; AGT-0001 receives a swap.
    mirpur = _page(client, AGENT_MIRPUR)["items"]
    assert sorted(i["title_key"] for i in mirpur) == [
        "notifications.risk_change", "notifications.swap_offer.receiver"]
    change = next(i for i in mirpur if i["type"] == "risk_change")
    assert change["params"] == {"agent_code": "AGT-0001", "from": "green", "to": "red",
                                "horizon_h": 24}
    assert (change["severity"], change["entity_type"]) == ("critical", "agent")
    assert change["entity_id"] == str(agent_id("AGT-0001")) and change["read_at"] is None
    offer = next(i for i in mirpur if i["type"] == "swap_offer")
    assert offer["params"]["counterpart_code"] == "AGT-9001"
    assert offer["params"]["amount_bdt"] == 58_500 and offer["entity_type"] == "swap"

    patiya = _page(client, AGENT_PATIYA)["items"]
    assert [i["params"]["agent_code"] for i in patiya] == ["AGT-0002"]
    assert _keys(client, AGENT_SUNAMGANJ) == []

    dhaka = _page(client, DIST_DHAKA)["items"]
    assert sorted(i["title_key"] for i in dhaka) == [
        "notifications.red_count_change", "notifications.swaps_pending"]
    red = next(i for i in dhaka if i["title_key"] == "notifications.red_count_change")
    assert (red["params"]["previous"], red["params"]["current"]) == (0, 1)
    assert next(i for i in dhaka if i["type"] == "swap_offer")["params"] == {"count": 1}
    assert _keys(client, DIST_CTG) == ["notifications.red_count_change"]
    assert _keys(client, DIST_SYL) == [] and _keys(client, ADMIN) == []


def test_recompute_does_not_repeat_unchanged_events(client: TestClient, market: Path) -> None:
    before = _count()
    with Session(get_engine()) as session, session.begin():
        risk.precompute(session, build_config(), seed=42, force=True)
        rebalance.precompute(session, RCFG, SCFG, force=True)
    assert _count() == before


def test_swap_decision_notifies_both_agents_only(client: TestClient, market: Path) -> None:
    swap_id = next(i["entity_id"] for i in _page(client, AGENT_MIRPUR)["items"]
                   if i["type"] == "swap_offer")
    res = client.post(f"/api/v1/swaps/{swap_id}/decision", json={"decision": "approve",
                      "note": "ok"}, headers=bearer(client, DIST_DHAKA))
    assert res.status_code == 200, res.text
    decided = [i for i in _page(client, AGENT_MIRPUR)["items"] if i["type"] == "swap_decision"]
    assert len(decided) == 1 and decided[0]["params"]["status"] == "approved"
    assert "note" not in decided[0]["params"]
    assert all(i["type"] != "swap_decision" for i in _page(client, AGENT_PATIYA)["items"])


def test_opted_out_user_gets_nothing(client: TestClient, seeded: Path) -> None:
    h = bearer(client, AGENT_MIRPUR)
    res = client.patch("/api/v1/users/me/preferences", json={"notify_in_app": False}, headers=h)
    assert res.status_code == 200 and res.json()["notify_in_app"] is False
    build_market()
    assert _page(client, AGENT_MIRPUR)["total"] == 0
    assert _page(client, AGENT_PATIYA)["total"] == 1


def test_mark_read_read_all_and_filters(client: TestClient, market: Path) -> None:
    h = bearer(client, AGENT_MIRPUR)
    body = _page(client, AGENT_MIRPUR)
    assert (body["total"], body["unread_count"]) == (2, 2)
    first = body["items"][0]
    res = client.post(f"{API}/{first['id']}/read", headers=h)
    assert res.status_code == 200 and res.json()["read_at"] is not None
    again = client.post(f"{API}/{first['id']}/read", headers=h)
    assert again.json()["read_at"] == res.json()["read_at"]  # idempotent
    assert _page(client, AGENT_MIRPUR)["unread_count"] == 1
    assert [i["id"] for i in _page(client, AGENT_MIRPUR, unread=False)["items"]] == [first["id"]]
    assert _page(client, AGENT_MIRPUR, unread=True)["total"] == 1
    assert _page(client, AGENT_MIRPUR, page=2, page_size=1)["items"][0]["id"] != first["id"]

    res = client.post(f"{API}/read-all", headers=h)
    assert res.status_code == 200 and res.json() == {"updated": 1}
    assert _page(client, AGENT_MIRPUR)["unread_count"] == 0
    # Other users' notifications stay unread.
    assert _page(client, AGENT_PATIYA)["unread_count"] == 1


def test_cannot_touch_other_users_notifications(client: TestClient, market: Path) -> None:
    other = _page(client, AGENT_PATIYA)["items"][0]["id"]
    h = bearer(client, AGENT_MIRPUR)
    for nid in (other, 999_999):
        res = client.post(f"{API}/{nid}/read", headers=h)
        assert (res.status_code, res.json()["detail"]) == (404, "notification_not_found")
    assert _page(client, AGENT_PATIYA)["unread_count"] == 1
    assert client.get(API).status_code == 401
    assert client.post(f"{API}/read-all").status_code == 401
    for bad in ({"page": 0}, {"page_size": 101}, {"unread": "maybe"}):
        assert client.get(API, params=bad, headers=h).status_code == 422
