"""Events: list for every role; admin create / update / delete with audit_log."""

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import AuditLog
from app.services.forecast import events_fingerprint
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, bearer

URL = "/api/v1/events"
SALARY: dict[str, Any] = {
    "type": "salary", "name_en": "Salary days (1st-3rd)", "name_bn": "বেতন দিবস (১-৩ তারিখ)",
    "starts_at": "2026-05-01T00:00:00+06:00", "ends_at": "2026-05-04T00:00:00+06:00",
    "district": None, "intensity": 1.8,
}
HAT: dict[str, Any] = {
    "type": "hat_bazar", "name_en": "Dhaka weekly hat", "name_bn": "ঢাকা সাপ্তাহিক হাট",
    "starts_at": "2026-04-28T10:00:00+06:00", "ends_at": "2026-04-28T18:00:00+06:00",
    "district": "Dhaka", "intensity": 1.4,
}


def _audit(entity_id: int) -> list[AuditLog]:
    with Session(get_engine()) as session:
        return list(session.scalars(select(AuditLog).where(
            AuditLog.entity_type == "event", AuditLog.entity_id == str(entity_id))
            .order_by(AuditLog.id)))


def _fingerprint() -> str:
    with Session(get_engine()) as session:
        return events_fingerprint(session)


def test_admin_crud_with_audit(client: TestClient, seeded: Path) -> None:
    h = bearer(client, ADMIN)
    empty = _fingerprint()
    res = client.post(URL, json=SALARY, headers=h)
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["starts_at"].startswith("2026-04-30T18:00:00")  # stored in UTC
    assert created["district"] is None and created["intensity"] == 1.8
    assert _fingerprint() != empty
    eid = created["id"]
    res = client.put(f"{URL}/{eid}", json={**SALARY, "intensity": 2.3, "name_en": "Pay days"},
                     headers=h)
    assert res.status_code == 200, res.text
    assert (res.json()["intensity"], res.json()["name_en"]) == (2.3, "Pay days")
    assert client.delete(f"{URL}/{eid}", headers=h).status_code == 204
    assert client.delete(f"{URL}/{eid}", headers=h).status_code == 404
    assert client.put(f"{URL}/{eid}", json=SALARY, headers=h).status_code == 404
    log = _audit(eid)
    assert [a.action for a in log] == ["event.create", "event.update", "event.delete"]
    assert log[1].payload["before"]["intensity"] == 1.8
    assert log[1].payload["after"]["intensity"] == 2.3
    assert log[2].payload["before"]["name_en"] == "Pay days"
    assert all(a.user_id for a in log)
    assert _fingerprint() == empty


def test_list_filters_and_pagination(client: TestClient, seeded: Path) -> None:
    admin = bearer(client, ADMIN)
    for body in (SALARY, HAT):
        assert client.post(URL, json=body, headers=admin).status_code == 201
    h = bearer(client, AGENT_MIRPUR)

    def names(**params: Any) -> list[str]:
        res = client.get(URL, params=params, headers=h)
        assert res.status_code == 200, res.text
        return [e["name_en"] for e in res.json()["items"]]

    assert names() == ["Dhaka weekly hat", "Salary days (1st-3rd)"]
    assert names(type="salary") == ["Salary days (1st-3rd)"]
    assert names(**{"from": "2026-04-30T00:00:00+06:00"}) == ["Salary days (1st-3rd)"]
    assert names(to="2026-04-29T00:00:00+06:00") == ["Dhaka weekly hat"]
    assert names(district="Dhaka") == ["Dhaka weekly hat", "Salary days (1st-3rd)"]
    assert names(district="Sylhet") == ["Salary days (1st-3rd)"]  # nationwide stays
    page = client.get(URL, params={"page": 2, "page_size": 1}, headers=h).json()
    assert (page["total"], len(page["items"]), page["page"]) == (2, 1, 2)
    for bad in ({"type": "comet"}, {"page": 0}, {"page_size": 201}):
        assert client.get(URL, params=bad, headers=h).status_code == 422


def test_validation(client: TestClient, seeded: Path) -> None:
    h = bearer(client, ADMIN)
    bad_bodies = [
        {**SALARY, "ends_at": SALARY["starts_at"]},
        {**SALARY, "starts_at": "2026-05-01T00:00:00"},  # naive time
        {**SALARY, "ends_at": "2026-08-01T00:00:00+06:00"},  # longer than 60 days
        {**SALARY, "intensity": 0},
        {**SALARY, "name_en": "  "},
        {**SALARY, "type": "comet"},
    ]
    for body in bad_bodies:
        assert client.post(URL, json=body, headers=h).status_code == 422, body
    res = client.post(URL, json={**HAT, "district": "Atlantis"}, headers=h)
    assert res.status_code == 422 and res.json()["detail"] == "unknown_district"


def test_roles(client: TestClient, seeded: Path) -> None:
    assert client.get(URL).status_code == 401
    eid = client.post(URL, json=HAT, headers=bearer(client, ADMIN)).json()["id"]
    for email in (DIST_DHAKA, AGENT_MIRPUR):
        h = bearer(client, email)
        assert client.get(URL, headers=h).status_code == 200
        assert client.post(URL, json=HAT, headers=h).status_code == 403
        assert client.put(f"{URL}/{eid}", json=HAT, headers=h).status_code == 403
        assert client.delete(f"{URL}/{eid}", headers=h).status_code == 403
    assert len(_audit(eid)) == 1
