"""GET /search: agents only within the caller's scope, role pages only, max 8 results."""

from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Agent, Distributor
from app.models.enums import UrbanRural
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, agent_id, bearer

API = "/api/v1/search"


def _search(client: TestClient, email: str, q: str) -> list[dict[str, Any]]:
    res = client.get(API, params={"q": q}, headers=bearer(client, email))
    assert res.status_code == 200, res.text
    items: list[dict[str, Any]] = res.json()["items"]
    return items


def _agents(items: list[dict[str, Any]]) -> list[str]:
    return [i["key"] for i in items if i["kind"] == "agent"]


def _pages(items: list[dict[str, Any]]) -> list[str]:
    return [i["key"] for i in items if i["kind"] == "page"]


def test_agents_are_role_scoped(client: TestClient, seeded: Path) -> None:
    assert _agents(_search(client, AGENT_MIRPUR, "AGT")) == ["AGT-0001"]
    assert _agents(_search(client, AGENT_MIRPUR, "Patiya")) == []
    (hit,) = _search(client, DIST_DHAKA, "mirpur 10")
    assert hit["label"] == "Mirpur 10 Mobile Point" and hit["sublabel"] == "Dhaka / Dhaka"
    assert hit["path"] == f"/distributor/agents/{agent_id('AGT-0001')}"
    assert _agents(_search(client, DIST_DHAKA, "Patiya")) == []
    assert _agents(_search(client, DIST_DHAKA, "Chattogram")) == []
    admin = _search(client, ADMIN, "Chattogram")
    assert _agents(admin) == ["AGT-0002"] and admin[0]["path"] is None
    assert _agents(_search(client, AGENT_MIRPUR, "/agent")) == []


def test_pages_follow_role(client: TestClient, seeded: Path) -> None:
    agent = _search(client, AGENT_MIRPUR, "swap")
    assert _pages(agent) == ["agent_swap"]
    assert agent[0]["path"] == "/agent/swap" and agent[0]["title_key"] == "search.page.agent_swap"
    assert _pages(_search(client, DIST_DHAKA, "swap")) == ["distributor_swaps"]
    assert _pages(_search(client, DIST_DHAKA, "audit")) == []
    assert _pages(_search(client, ADMIN, "audit")) == ["admin_audit"]
    assert _pages(_search(client, AGENT_MIRPUR, "settings")) == ["settings"]
    assert _pages(_search(client, AGENT_MIRPUR, "সেটিংস")) == ["settings"]


def test_max_eight_and_wildcards_escaped(client: TestClient, seeded: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        dhk = session.scalar(select(Distributor.id).where(Distributor.code == "DST-DHK"))
        assert dhk is not None
        for n in range(12):
            session.add(Agent(code=f"AGT-95{n:02d}", name=f"Dhanmondi Point {n}",
                              distributor_id=dhk, region="Dhaka", district="Dhaka",
                              upazila="Dhanmondi", urban_rural=UrbanRural.urban, tier=2,
                              lat=23.74, lng=90.37, cash_capacity=Decimal("100000"),
                              emoney_capacity=Decimal("100000")))
    assert len(_search(client, DIST_DHAKA, "Dhanmondi")) == 8
    assert len(_search(client, ADMIN, "AGT")) == 8
    assert _search(client, ADMIN, "%") == [] and _search(client, ADMIN, "_") == []


def test_validation_and_auth(client: TestClient, seeded: Path) -> None:
    h = bearer(client, ADMIN)
    assert client.get(API, params={"q": ""}, headers=h).status_code == 422
    assert client.get(API, params={"q": "x" * 81}, headers=h).status_code == 422
    assert client.get(API, headers=h).status_code == 422
    assert client.get(API, params={"q": "AGT"}).status_code == 401
    assert client.get(API, params={"q": "   "}, headers=h).json()["items"] == []
