from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.v1.auth import demo_limiter
from app.core.config import get_settings
from app.core.db import get_engine
from app.main import create_app
from app.models import AuditLog, User

API = "/api/v1"


@pytest.fixture(autouse=True)
def fresh_limiter() -> Iterator[None]:
    demo_limiter.reset()
    yield
    demo_limiter.reset()


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


def test_demo_login_not_registered_when_off(
    seeded: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_MODE", "false")
    get_settings.cache_clear()
    off = TestClient(create_app())
    res = off.post(f"{API}/auth/demo-login", json={"role": "admin"})
    assert res.status_code == 404 and res.json()["detail"] == "Not Found"
    assert not any(getattr(r, "path", "") == f"{API}/auth/demo-login" for r in off.app.routes)
    assert off.get(f"{API}/system/status").json()["demo_mode"] is False


def test_demo_login_switched_off_at_runtime_returns_404(
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


def test_demo_login_refuses_account_not_flagged_demo(client: TestClient, seeded: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        session.execute(
            update(User).where(User.email == "admin@agentpulse.demo").values(is_demo=False)
        )
    res = client.post(f"{API}/auth/demo-login", json={"role": "admin"})
    assert res.status_code == 403 and res.json()["detail"] == "not_demo_account"
    assert "ap_refresh" not in res.cookies


def test_only_the_three_demo_targets_are_flagged(seeded: Path) -> None:
    with Session(get_engine()) as session:
        flagged = set(session.scalars(select(User.email).where(User.is_demo)))
    assert flagged == {"admin@agentpulse.demo", "dist.dhaka@agentpulse.demo",
                       "agent.mirpur@agentpulse.demo"}


def test_demo_login_is_rate_limited_per_ip(
    client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_LOGIN_PER_MIN", "2")
    get_settings.cache_clear()
    for _ in range(2):
        assert client.post(f"{API}/auth/demo-login", json={"role": "agent"}).status_code == 200
    res = client.post(f"{API}/auth/demo-login", json={"role": "agent"})
    assert res.status_code == 429 and res.json()["detail"] == "too_many_attempts"
    assert res.headers["Retry-After"] == "60"
    other = client.post(f"{API}/auth/demo-login", json={"role": "agent"},
                        headers={"X-Real-IP": "10.9.9.9"})
    assert other.status_code == 200


def test_every_demo_login_is_audited(client: TestClient, seeded: Path) -> None:
    for role in ("agent", "admin"):
        assert client.post(f"{API}/auth/demo-login", json={"role": role}).status_code == 200
    with Session(get_engine()) as session:
        rows = session.scalars(select(AuditLog).where(AuditLog.action == "auth.demo_login")
                               .order_by(AuditLog.id)).all()
        emails = [session.get(User, r.user_id).email for r in rows]  # type: ignore[union-attr]
    assert [r.payload["role"] for r in rows] == ["agent", "admin"]
    assert emails == ["agent.mirpur@agentpulse.demo", "admin@agentpulse.demo"]
    assert all(r.payload["ip"] for r in rows)
