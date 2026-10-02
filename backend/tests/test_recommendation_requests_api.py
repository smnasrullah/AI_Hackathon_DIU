from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import AuditLog, Recommendation, User
from app.models.enums import RecommendationStatus
from app.services import rebalance
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, agent_id, bearer
from tests.rebalance_helpers import RCFG, SCFG, build_market

API = "/api/v1"
DIST_CTG = "dist.chattogram@agentpulse.demo"


@pytest.fixture
def market(seeded: Path) -> Path:
    build_market()
    return seeded


def _item(client: TestClient, code: str) -> dict[str, Any]:
    res = client.get(f"{API}/agents/{agent_id(code)}/recommendation",
                     headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    (item,) = res.json()["items"]
    return dict(item)


def _request(client: TestClient, rec_id: int, email: str = AGENT_MIRPUR) -> Any:
    return client.post(f"{API}/recommendations/{rec_id}/request", headers=bearer(client, email))


def _post(client: TestClient, req_id: int, action: str, email: str,
          body: dict[str, str] | None = None) -> Any:
    return client.post(f"{API}/recommendation-requests/{req_id}/{action}", json=body,
                       headers=bearer(client, email))


def _rec_status(rec_id: int) -> RecommendationStatus:
    with Session(get_engine()) as session:
        rec = session.get(Recommendation, rec_id)
        assert rec is not None
        return rec.status


def _audit(req_id: int) -> list[AuditLog]:
    with Session(get_engine()) as session:
        return list(session.scalars(select(AuditLog).where(
            AuditLog.entity_type == "recommendation_request",
            AuditLog.entity_id == str(req_id)).order_by(AuditLog.id)))


def test_recommendation_channels_are_explained(client: TestClient, market: Path) -> None:
    swap = _item(client, "AGT-0001")
    assert (swap["channel"], swap["kind"], swap["van_route_id"]) == ("swap", "swap", None)
    assert swap["rationale"]["alternatives"][0]["channel"] == "swap"
    # AGT-0002: no donor, 2.5 h to deadline (too soon for a van), CTG hub ~21 km away.
    manual = _item(client, "AGT-0002")
    assert (manual["channel"], manual["kind"]) == ("urgent_manual", "add_cash")
    trace = [(s["rule"], s["passed"]) for s in manual["rationale"]["rule_trace"]]
    assert trace == [("emoney_top_up", False), ("swap_covers", False), ("van_batch", False),
                     ("self_fetch", False), ("urgent_manual", True)]
    assert {a["channel"] for a in manual["rationale"]["alternatives"]} == {
        "swap", "top_up", "van", "self_fetch", "urgent_manual"}


def test_request_is_idempotent_and_scoped(client: TestClient, market: Path) -> None:
    rec_id = _item(client, "AGT-0001")["id"]
    assert _request(client, rec_id, AGENT_PATIYA).status_code == 403  # agent B for agent A
    assert _request(client, rec_id, DIST_DHAKA).status_code == 403  # agents only
    assert _request(client, 999_999).status_code == 403
    first = _request(client, rec_id)
    assert first.status_code == 201, first.text
    body = first.json()
    assert (body["status"], body["channel"], body["amount_bdt"]) == ("requested", "swap", 58_500)
    again = _request(client, rec_id)
    assert again.status_code == 200 and again.json()["id"] == body["id"]
    assert _rec_status(rec_id) == RecommendationStatus.requested

    def total(email: str) -> int:
        res = client.get(f"{API}/recommendation-requests", headers=bearer(client, email))
        assert res.status_code == 200, res.text
        return int(res.json()["total"])

    assert (total(AGENT_MIRPUR), total(AGENT_PATIYA), total(DIST_DHAKA), total(DIST_CTG),
            total(ADMIN)) == (1, 0, 1, 0, 1)
    assert client.get(f"{API}/recommendation-requests").status_code == 401


def test_decision_and_fulfil_are_audited(client: TestClient, market: Path) -> None:
    rec_id = _item(client, "AGT-0001")["id"]
    req_id = _request(client, rec_id).json()["id"]
    assert _post(client, req_id, "fulfil", DIST_DHAKA).status_code == 409  # not approved yet
    assert _post(client, req_id, "decision", DIST_DHAKA,
                 {"decision": "approve", "note": " "}).status_code == 422
    assert _post(client, req_id, "decision", DIST_CTG,
                 {"decision": "approve", "note": "ok"}).status_code == 403
    assert _post(client, req_id, "decision", AGENT_MIRPUR,
                 {"decision": "approve", "note": "ok"}).status_code == 403
    res = _post(client, req_id, "decision", DIST_DHAKA,
                {"decision": "approve", "note": "Swap partner confirmed by phone"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved" and res.json()["decided_at"]
    assert _post(client, req_id, "decision", DIST_DHAKA,
                 {"decision": "decline", "note": "again"}).status_code == 409
    assert _post(client, req_id, "cancel", AGENT_MIRPUR).status_code == 409
    res = _post(client, req_id, "fulfil", DIST_DHAKA, {"note": "Handed over"})
    assert res.status_code == 200 and res.json()["status"] == "fulfilled"
    assert _rec_status(rec_id) == RecommendationStatus.done
    assert _post(client, req_id, "fulfil", DIST_DHAKA).status_code == 409
    assert _request(client, rec_id).json()["id"] == req_id  # still idempotent when done
    with Session(get_engine()) as session:
        dist_id = session.scalar(select(User.id).where(User.email == DIST_DHAKA))
    log = _audit(req_id)
    assert [a.action for a in log] == ["recommendation_request.create",
                                       "recommendation_request.approve",
                                       "recommendation_request.fulfil"]
    assert log[1].user_id == dist_id and log[1].note == "Swap partner confirmed by phone"
    assert log[1].payload["amount_bdt"] == 58_500


def test_cancel_decline_and_rerequest(client: TestClient, market: Path) -> None:
    rec_id = _item(client, "AGT-0002")["id"]
    req_id = _request(client, rec_id, AGENT_PATIYA).json()["id"]
    assert _post(client, req_id, "cancel", AGENT_MIRPUR).status_code == 403
    res = _post(client, req_id, "cancel", AGENT_PATIYA)
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert _rec_status(rec_id) == RecommendationStatus.open
    assert _post(client, req_id, "decision", DIST_CTG,
                 {"decision": "approve", "note": "late"}).status_code == 409
    second = _request(client, rec_id, AGENT_PATIYA)
    assert second.status_code == 201 and second.json()["id"] != req_id
    res = _post(client, second.json()["id"], "decision", DIST_CTG,
                {"decision": "decline", "note": "No cash at hub today"})
    assert res.status_code == 200 and res.json()["status"] == "declined"
    assert _rec_status(rec_id) == RecommendationStatus.open
    assert [a.action for a in _audit(req_id)] == ["recommendation_request.create",
                                                  "recommendation_request.cancel"]
    listed = client.get(f"{API}/recommendation-requests", params={"status": "declined"},
                        headers=bearer(client, DIST_CTG)).json()
    assert listed["total"] == 1 and listed["items"][0]["note"] == "No cash at hub today"
    # A rebuild keeps the request history: the old recommendation expires, a new one opens.
    with Session(get_engine()) as session, session.begin():
        assert rebalance.precompute(session, RCFG, SCFG, force=True) == 2
    assert _rec_status(rec_id) == RecommendationStatus.expired
    assert _item(client, "AGT-0002")["id"] != rec_id
    assert _request(client, rec_id, AGENT_PATIYA).status_code == 409
