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
ADMIN_EMAIL = "admin@agentpulse.demo"


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
    assert res.status_code == 404 and res.json()["detail"] == "not_found"
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


def _set_admin(**values: object) -> None:
    with Session(get_engine()) as session, session.begin():
        session.execute(update(User).where(User.email == ADMIN_EMAIL).values(**values))


def _demo_rows() -> list[AuditLog]:
    with Session(get_engine()) as session:
        return list(session.scalars(select(AuditLog).where(AuditLog.action == "auth.demo_login")
                                    .order_by(AuditLog.id)))


@pytest.mark.parametrize("change", ["inactive", "not_demo", "missing"])
def test_demo_login_denials_are_generic(client: TestClient, seeded: Path, change: str) -> None:
    """Non-demo, inactive and unknown accounts get the same answer, so the case is not revealed."""
    if change == "inactive":
        _set_admin(is_active=False)
    elif change == "not_demo":
        _set_admin(is_demo=False)
    else:
        _set_admin(email="renamed@agentpulse.demo")
    res = client.post(f"{API}/auth/demo-login", json={"role": "admin"})
    assert res.status_code == 403 and res.json() == {"detail": "demo_login_denied"}
    assert "ap_refresh" not in res.cookies
    (row,) = _demo_rows()
    assert row.payload == {"account": ADMIN_EMAIL, "role": "admin", "ip": row.payload["ip"],
                           "outcome": "denied"}
    assert (row.user_id is None) == (change == "missing")


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
    outcomes = [(r.payload["outcome"], r.payload["ip"]) for r in _demo_rows()]
    assert [o for o, _ in outcomes] == ["success", "success", "rate_limited", "success"]
    assert outcomes[-1][1] == "10.9.9.9"


def test_every_demo_login_is_audited_without_secrets(client: TestClient, seeded: Path) -> None:
    for role in ("agent", "admin"):
        res = client.post(f"{API}/auth/demo-login", json={"role": role})
        assert res.status_code == 200
    token = res.json()["access_token"]
    rows = _demo_rows()
    assert [(r.entity_id, r.payload["outcome"]) for r in rows] == [
        ("agent.mirpur@agentpulse.demo", "success"), (ADMIN_EMAIL, "success")]
    assert all(r.user_id is not None and r.created_at is not None and r.payload["ip"]
               for r in rows)
    dumped = repr([(r.payload, r.note) for r in rows])
    assert token not in dumped and "password" not in dumped and "token" not in dumped
