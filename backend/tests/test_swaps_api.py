from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import AuditLog, SwapSuggestion, User
from app.models.enums import SwapStatus
from app.rules.swap_rules import haversine_km
from app.services import rebalance
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, agent_id, bearer
from tests.rebalance_helpers import EXTRA, RCFG, SCFG, build_market

API = "/api/v1"
DIST_CTG = "dist.chattogram@agentpulse.demo"


@pytest.fixture
def market(seeded: Path) -> Path:
    build_market()
    return seeded


def _page(client: TestClient, email: str, **params: Any) -> dict[str, Any]:
    res = client.get(f"{API}/swaps", params=params, headers=bearer(client, email))
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def _swap_id(client: TestClient) -> int:
    swap_id: int = _page(client, ADMIN)["items"][0]["id"]
    return swap_id


def _audit(swap_id: int) -> list[AuditLog]:
    with Session(get_engine()) as session:
        return list(session.scalars(select(AuditLog).where(
            AuditLog.entity_type == "swap", AuditLog.entity_id == str(swap_id))
            .order_by(AuditLog.id)))


def _user_id(email: str) -> object:
    with Session(get_engine()) as session:
        return session.scalar(select(User.id).where(User.email == email))


def test_match_respects_surplus_radius_and_minimum(client: TestClient, market: Path) -> None:
    body = _page(client, ADMIN)
    assert body["total"] == 1 and body["van_trips_avoided"] == 1 and body["advisory"] is True
    (swap,) = body["items"]
    assert (swap["donor"]["code"], swap["receiver"]["code"]) == ("AGT-9001", "AGT-0001")
    assert (swap["float_type"], swap["status"], swap["van_trip_saved"]) == ("cash", "pending", True)
    # Donor surplus: 90,000 balance - 0 need - 10,000 buffer = 80,000 >= 58,500.
    assert swap["amount_bdt"] == 58_500 and swap["amount_bdt"] <= 80_000
    _, _, lat, lng = EXTRA["AGT-9001"]
    assert swap["distance_km"] == round(haversine_km(lat, lng, 23.8069, 90.3687), 2)
    assert swap["distance_km"] <= SCFG.radius_km
    assert swap["model_version"] == "test-flat" and swap["generated_at"]
    # AGT-9002 has the same surplus but sits outside the radius; AGT-0002 has no donor.
    with Session(get_engine()) as session:
        donors = set(session.scalars(select(SwapSuggestion.donor_agent_id)))
    assert donors == {agent_id("AGT-9001")}


def test_list_is_scoped_filtered_and_paged(client: TestClient, market: Path) -> None:
    assert _page(client, DIST_DHAKA)["total"] == 1
    assert _page(client, AGENT_MIRPUR)["total"] == 1
    assert _page(client, DIST_CTG)["total"] == 0
    assert _page(client, AGENT_PATIYA)["total"] == 0
    assert _page(client, ADMIN, status="approved")["total"] == 0
    assert _page(client, ADMIN, status="pending")["total"] == 1
    assert _page(client, ADMIN, page=2)["items"] == []
    assert client.get(f"{API}/swaps").status_code == 401
    h = bearer(client, ADMIN)
    for bad in ({"status": "done"}, {"page": 0}, {"page_size": 101}):
        assert client.get(f"{API}/swaps", params=bad, headers=h).status_code == 422


def test_decision_requires_note_and_is_audited(client: TestClient, market: Path) -> None:
    swap_id = _swap_id(client)
    url = f"{API}/swaps/{swap_id}/decision"
    h = bearer(client, DIST_DHAKA)
    for body in ({"decision": "approve"}, {"decision": "approve", "note": "   "},
                 {"decision": "maybe", "note": "x"}):
        assert client.post(url, json=body, headers=h).status_code == 422
    res = client.post(url, json={"decision": "approve", "note": " Both nearby, call first "},
                      headers=h)
    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["status"], out["note"]) == ("approved", "Both nearby, call first")
    assert out["decided_at"]
    (row,) = _audit(swap_id)
    assert (row.action, row.note, row.user_id) == ("swap.approve", "Both nearby, call first",
                                                   _user_id(DIST_DHAKA))
    assert row.payload["amount_bdt"] == 58_500 and row.payload["status"] == "approved"
    again = client.post(url, json={"decision": "reject", "note": "late"}, headers=h)
    assert again.status_code == 409 and again.json()["detail"] == "already_decided"
    assert len(_audit(swap_id)) == 1


def test_decision_is_distributor_only_and_scoped(client: TestClient, market: Path) -> None:
    swap_id = _swap_id(client)
    body = {"decision": "reject", "note": "no"}
    url = f"{API}/swaps/{swap_id}/decision"
    assert client.post(url, json=body).status_code == 401
    for email in (ADMIN, AGENT_MIRPUR, DIST_CTG):
        assert client.post(url, json=body, headers=bearer(client, email)).status_code == 403
    unknown = client.post(f"{API}/swaps/999999/decision", json=body,
                          headers=bearer(client, DIST_DHAKA))
    assert unknown.status_code == 403
    assert _audit(swap_id) == []


def test_agent_response_is_audited_and_decline_blocks_approval(client: TestClient,
                                                               market: Path) -> None:
    swap_id = _swap_id(client)
    url = f"{API}/swaps/{swap_id}/respond"
    for email in (AGENT_PATIYA, DIST_DHAKA, ADMIN):
        res = client.post(url, json={"response": "accept"}, headers=bearer(client, email))
        assert res.status_code == 403
    mirpur = bearer(client, AGENT_MIRPUR)
    assert client.post(url, json={"response": "maybe"}, headers=mirpur).status_code == 422
    res = client.post(url, json={"response": "accept"}, headers=mirpur)
    assert res.status_code == 200 and res.json()["receiver"]["response"] == "accepted"
    res = client.post(url, json={"response": "decline", "note": "Shop closed today"},
                      headers=mirpur)
    assert res.json()["receiver"]["response"] == "declined"
    assert res.json()["donor"]["response"] is None and res.json()["status"] == "pending"
    rows = _audit(swap_id)
    assert [r.action for r in rows] == ["swap.accept", "swap.decline"]
    assert rows[1].note == "Shop closed today" and rows[1].payload["side"] == "receiver"
    assert {r.user_id for r in rows} == {_user_id(AGENT_MIRPUR)}
    decide = f"{API}/swaps/{swap_id}/decision"
    dist = bearer(client, DIST_DHAKA)
    blocked = client.post(decide, json={"decision": "approve", "note": "ok"}, headers=dist)
    assert blocked.status_code == 409 and blocked.json()["detail"] == "swap_declined"
    rejected = client.post(decide, json={"decision": "reject", "note": "Agent declined"},
                           headers=dist)
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    late = client.post(url, json={"response": "accept"}, headers=mirpur)
    assert late.status_code == 409
    assert _page(client, ADMIN)["van_trips_avoided"] == 0


def test_rebuild_keeps_decided_swaps(client: TestClient, market: Path) -> None:
    swap_id = _swap_id(client)
    res = client.post(f"{API}/swaps/{swap_id}/decision", json={"decision": "approve", "note": "go"},
                      headers=bearer(client, DIST_DHAKA))
    assert res.status_code == 200
    with Session(get_engine()) as session, session.begin():
        rebalance.precompute(session, RCFG, SCFG, force=True)
    with Session(get_engine()) as session:
        rows = session.scalars(select(SwapSuggestion)).all()
    assert [(r.id, r.status) for r in rows] == [(swap_id, SwapStatus.approved)]
    rec = client.get(f"{API}/agents/{agent_id('AGT-0001')}/recommendation",
                     headers=bearer(client, AGENT_MIRPUR)).json()
    assert rec["items"][0]["rationale"]["swap_id"] == swap_id


def test_not_ready_without_cache(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/swaps", headers=bearer(client, ADMIN))
    assert res.status_code == 503 and res.json()["detail"] == "swaps_not_ready"
