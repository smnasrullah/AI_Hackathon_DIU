from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_engine
from app.models import User

API = "/api/v1"


@pytest.mark.parametrize(
    ("role", "email"),
    [
        ("agent", "agent.mirpur@agentpulse.demo"),
        ("distributor", "dist.dhaka@agentpulse.demo"),
        ("admin", "admin@agentpulse.demo"),
    ],
)
def test_demo_login_signs_in_as_role(
    client: TestClient, seeded: Path, role: str, email: str
) -> None:
    res = client.post(f"{API}/auth/demo-login", json={"role": role})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == role
    assert body["user"]["email"] == email
    assert "refresh_token" not in body
    assert "ap_refresh" in res.cookies
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200


def test_demo_login_off_returns_404(
    client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_MODE", "false")
    get_settings.cache_clear()
    res = client.post(f"{API}/auth/demo-login", json={"role": "admin"})
    assert res.status_code == 404
    assert res.json()["detail"] == "demo_mode_off"
    assert client.get(f"{API}/system/status").json()["demo_mode"] is False


def test_demo_login_rejects_unknown_role(client: TestClient, seeded: Path) -> None:
    res = client.post(f"{API}/auth/demo-login", json={"role": "root"})
    assert res.status_code == 422


def test_demo_login_inactive_account(client: TestClient, seeded: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        session.execute(
            update(User).where(User.email == "admin@agentpulse.demo").values(is_active=False)
        )
    res = client.post(f"{API}/auth/demo-login", json={"role": "admin"})
    assert res.status_code == 409
    assert res.json()["detail"] == "demo_account_missing"
