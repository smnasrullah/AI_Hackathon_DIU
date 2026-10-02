from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.services import rebalance
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, agent_id, bearer
from tests.rebalance_helpers import NOW, RCFG, SCFG, build_market

API = "/api/v1"


@pytest.fixture
def market(seeded: Path) -> Path:
    assert build_market() == 2
    return seeded


def _iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _rec(client: TestClient, code: str, email: str) -> dict[str, Any]:
    res = client.get(f"{API}/agents/{agent_id(code)}/recommendation",
                     headers=bearer(client, email))
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def test_recommendation_known_answer(client: TestClient, market: Path) -> None:
    body = _rec(client, "AGT-0001", AGENT_MIRPUR)
    assert body["model_version"] == "test-flat" and body["generated_at"]
    assert _iso(body["as_of"]) == NOW and body["advisory"] is True
    (item,) = body["items"]
    # Need 24 x 1,000 at q90 - 5,500 balance = 18,500 + buffer 10% x 400,000 = 58,500.
    assert (item["kind"], item["float_type"], item["amount_bdt"]) == ("swap", "cash", 58_500)
    assert _iso(item["deadline_at"]) == NOW + timedelta(hours=2.5)  # 5.5 h - 3 h lead
    why = item["rationale"]
    assert (why["shortfall_bdt"], why["buffer_bdt"], why["risk_level"]) == (18_500, 40_000, "red")
    assert why["swap_id"] and why["swap_amount_bdt"] == 58_500 and not why["urgent"]


def test_recommendation_without_donor_and_without_need(client: TestClient, market: Path) -> None:
    (item,) = _rec(client, "AGT-0002", ADMIN)["items"]
    # 18,500 shortfall + 10% x 200,000 buffer; no DST-CTG donor, so a plain top-up.
    assert (item["kind"], item["amount_bdt"]) == ("add_cash", 38_500)
    assert item["rationale"]["swap_id"] is None
    assert _rec(client, "AGT-9001", DIST_DHAKA)["items"] == []


def test_recommendation_scoping(client: TestClient, market: Path) -> None:
    path = f"{API}/agents/{agent_id('AGT-0001')}/recommendation"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=bearer(client, AGENT_PATIYA)).status_code == 403
    other = f"{API}/agents/{agent_id('AGT-0002')}/recommendation"
    assert client.get(other, headers=bearer(client, DIST_DHAKA)).status_code == 403


def test_precompute_is_idempotent(market: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        assert rebalance.precompute(session, RCFG, SCFG) == 0
        assert rebalance.precompute(session, RCFG, SCFG, force=True) == 2


def test_not_ready_without_cache(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/agents/{agent_id('AGT-0001')}/recommendation",
                     headers=bearer(client, ADMIN))
    assert res.status_code == 503 and res.json()["detail"] == "recommendation_not_ready"
