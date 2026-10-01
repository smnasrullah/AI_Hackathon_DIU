"""Role gate and agent scoping: cross-role and cross-agent access is denied."""

from pathlib import Path
from typing import Annotated

from fastapi import Depends
from fastapi.testclient import TestClient

from app.core.deps import require_roles
from app.main import create_app
from app.models import User
from app.models.enums import UserRole
from tests.auth_helpers import (
    ADMIN,
    AGENT_MIRPUR,
    AGENT_PATIYA,
    DIST_DHAKA,
    agent_id,
    bearer,
)

API = "/api/v1"


def test_agent_sees_own_agent(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/agents/{agent_id('AGT-0001')}", headers=bearer(client, AGENT_MIRPUR))
    assert res.status_code == 200
    assert res.json()["code"] == "AGT-0001"


def test_agent_cannot_see_other_agent(client: TestClient, seeded: Path) -> None:
    headers = bearer(client, AGENT_MIRPUR)
    for code in ("AGT-0002", "AGT-0003"):
        res = client.get(f"{API}/agents/{agent_id(code)}", headers=headers)
        assert res.status_code == 403
        assert res.json()["detail"] == "forbidden"


def test_agent_cannot_probe_unknown_ids(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/agents/999999", headers=bearer(client, AGENT_PATIYA))
    assert res.status_code == 403


def test_agent_cannot_list_agents(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/agents", headers=bearer(client, AGENT_MIRPUR))
    assert res.status_code == 403


def test_distributor_sees_only_own_agents(client: TestClient, seeded: Path) -> None:
    headers = bearer(client, DIST_DHAKA)
    listed = client.get(f"{API}/agents", headers=headers)
    assert listed.status_code == 200
    assert [a["code"] for a in listed.json()] == ["AGT-0001"]
    own = client.get(f"{API}/agents/{agent_id('AGT-0001')}", headers=headers)
    assert own.status_code == 200
    other = client.get(f"{API}/agents/{agent_id('AGT-0002')}", headers=headers)
    assert other.status_code == 403


def test_admin_sees_all_agents(client: TestClient, seeded: Path) -> None:
    headers = bearer(client, ADMIN)
    listed = client.get(f"{API}/agents", headers=headers)
    assert [a["code"] for a in listed.json()] == ["AGT-0001", "AGT-0002", "AGT-0003"]
    assert client.get(f"{API}/agents/{agent_id('AGT-0003')}", headers=headers).status_code == 200
    assert client.get(f"{API}/agents/999999", headers=headers).status_code == 404


def test_scoped_endpoints_require_token(client: TestClient, seeded: Path) -> None:
    assert client.get(f"{API}/agents").status_code == 401
    assert client.get(f"{API}/agents/{agent_id('AGT-0001')}").status_code == 401


def test_require_roles_blocks_other_roles(seeded: Path) -> None:
    app = create_app()

    @app.get("/admin-only")
    def admin_only(user: Annotated[User, Depends(require_roles(UserRole.admin))]) -> str:
        return user.email

    client = TestClient(app)
    for email in (AGENT_MIRPUR, DIST_DHAKA):
        assert client.get("/admin-only", headers=bearer(client, email)).status_code == 403
    assert client.get("/admin-only", headers=bearer(client, ADMIN)).json() == ADMIN


def test_update_language_preference(client: TestClient, seeded: Path) -> None:
    headers = bearer(client, AGENT_MIRPUR)
    res = client.patch(f"{API}/users/me/preferences", json={"lang": "en"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["lang"] == "en"
    assert client.get(f"{API}/auth/me", headers=headers).json()["lang"] == "en"


def test_preferences_validation_and_auth(client: TestClient, seeded: Path) -> None:
    headers = bearer(client, AGENT_MIRPUR)
    bad = client.patch(f"{API}/users/me/preferences", json={"lang": "fr"}, headers=headers)
    assert bad.status_code == 422
    extra = client.patch(
        f"{API}/users/me/preferences", json={"lang": "bn", "role": "admin"}, headers=headers
    )
    assert extra.status_code == 422
    anon = client.patch(f"{API}/users/me/preferences", json={"lang": "en"})
    assert anon.status_code == 401
