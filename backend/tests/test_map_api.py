"""GET /map/agents on the hand-made market (flat forecasts -> exact answers).

AGT-0001 (DST-DHK) and AGT-0002 (DST-CTG) run out of cash at 5.5 h; the rest never do.
One swap: AGT-9001 -> AGT-0001, cash.
"""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import SwapSuggestion
from app.models.enums import SwapStatus
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, bearer
from tests.rebalance_helpers import EXTRA, build_market

API = "/api/v1"
DIST_CTG = "dist.chattogram@agentpulse.demo"


@pytest.fixture
def market(seeded: Path) -> Path:
    build_market()
    return seeded


def _map(client: TestClient, email: str, at_hour: int | None = None) -> dict[str, Any]:
    params = {} if at_hour is None else {"at_hour": at_hour}
    res = client.get(f"{API}/map/agents", params=params, headers=bearer(client, email))
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def _levels(body: dict[str, Any]) -> dict[str, str]:
    return {a["code"]: a["level"] for a in body["agents"]}


def test_levels_move_with_the_scrubber(client: TestClient, market: Path) -> None:
    now = _map(client, ADMIN)
    assert now["at_hour"] == 0 and now["model_version"] == "test-flat" and now["generated_at"]
    assert set(_levels(now).values()) == {"green"}
    assert _levels(_map(client, ADMIN, 5))["AGT-0001"] == "green"
    later = _map(client, ADMIN, 6)
    assert _levels(later) == {"AGT-0001": "red", "AGT-0002": "red", "AGT-0003": "green",
                              "AGT-9001": "green", "AGT-9002": "green"}
    row = next(a for a in later["agents"] if a["code"] == "AGT-0001")
    assert (row["probability"], row["worst_float"]) == (1.0, "cash")
    assert later["ts"] > later["as_of"]


def test_matches_the_risk_cache_at_its_horizons(client: TestClient, market: Path) -> None:
    h = bearer(client, ADMIN)
    for horizon in (6, 24, 72):
        cached = client.get(f"{API}/agents/risk", params={"horizon": horizon, "page_size": 100},
                            headers=h).json()["items"]
        assert _levels(_map(client, ADMIN, horizon)) == {r["code"]: r["level"] for r in cached}


def test_swaps_with_coordinates_and_relevance(client: TestClient, market: Path) -> None:
    (swap,) = _map(client, DIST_DHAKA)["swaps"]
    assert (swap["float_type"], swap["status"], swap["relevant"]) == ("cash", "pending", False)
    _, _, lat, lng = EXTRA["AGT-9001"]
    assert (swap["from_lat"], swap["from_lng"]) == (lat, lng)
    assert (swap["to_lat"], swap["to_lng"]) == (23.8069, 90.3687)
    assert swap["amount_bdt"] == 58_500
    assert _map(client, DIST_DHAKA, 24)["swaps"][0]["relevant"] is True
    with Session(get_engine()) as session, session.begin():
        session.execute(update(SwapSuggestion).values(status=SwapStatus.rejected))
    assert _map(client, DIST_DHAKA, 24)["swaps"] == []


def test_role_scoped(client: TestClient, market: Path) -> None:
    dhk = _map(client, DIST_DHAKA, 24)
    assert [a["code"] for a in dhk["agents"]] == ["AGT-0001", "AGT-9001", "AGT-9002"]
    assert all({"lat", "lng"} <= a.keys() for a in dhk["agents"])
    ctg = _map(client, DIST_CTG, 24)
    assert [a["code"] for a in ctg["agents"]] == ["AGT-0002"] and ctg["swaps"] == []
    assert len(_map(client, ADMIN)["agents"]) == 5
    assert client.get(f"{API}/map/agents").status_code == 401
    res = client.get(f"{API}/map/agents", headers=bearer(client, AGENT_MIRPUR))
    assert res.status_code == 403


def test_hour_bounds_and_not_ready(client: TestClient, seeded: Path) -> None:
    h = bearer(client, ADMIN)
    for bad in (-1, 73, "soon"):
        assert client.get(f"{API}/map/agents", params={"at_hour": bad},
                          headers=h).status_code == 422
    res = client.get(f"{API}/map/agents", params={"at_hour": 72}, headers=h)
    assert res.status_code == 503 and res.json()["detail"] == "risk_not_ready"
