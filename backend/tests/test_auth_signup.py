"""Self-signup: pending least-privilege account, no role injection, approval, rate limit, audit."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import signup_limiter
from app.core.config import get_settings
from app.core.db import get_engine
from app.models import AuditLog, User
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, agent_id, bearer

API = "/api/v1"
PW = "signup-password-1"
NEW = {"full_name": "New Person", "email": "New.Person@Example.org", "password": PW}


@pytest.fixture(autouse=True)
def fresh_limiter() -> Iterator[None]:
    signup_limiter.reset()
    yield
    signup_limiter.reset()


def _user(email: str) -> User | None:
    with Session(get_engine()) as session:
        return session.scalar(select(User).where(User.email == email))


def _audit(action: str) -> list[AuditLog]:
    with Session(get_engine()) as session:
        return list(session.scalars(select(AuditLog).where(AuditLog.action == action)
                                    .order_by(AuditLog.id)))


def test_no_endpoint_signs_in_without_credentials(client: TestClient, seeded: Path) -> None:
    """Opening the app never creates a session: status is public but issues no cookie, and
    refresh without a cookie is refused."""
    status = client.get(f"{API}/system/status")
    assert status.status_code == 200 and "ap_refresh" not in status.cookies
    assert client.post(f"{API}/auth/refresh").status_code == 401
    assert client.get(f"{API}/auth/me").status_code == 401


def test_signup_creates_pending_least_privilege_account(client: TestClient, seeded: Path) -> None:
    res = client.post(f"{API}/auth/signup", json=NEW)
    assert res.status_code == 202 and res.json() == {"status": "pending_approval"}
    assert "ap_refresh" not in res.cookies and "access_token" not in res.text
    u = _user("new.person@example.org")
    assert u is not None
    assert u.role.value == "agent" and u.agent_id is None and u.distributor_id is None
    assert u.is_pending and not u.is_active and not u.is_demo
    assert u.password_hash != PW
    # Pending accounts cannot sign in, and get the same answer as a wrong password.
    login = client.post(f"{API}/auth/login", json={"email": u.email, "password": PW})
    assert login.status_code == 401 and login.json()["detail"] == "invalid_credentials"
    (row,) = _audit("auth.signup")
    assert row.user_id == u.id and row.payload["outcome"] == "pending"
    assert PW not in repr(row.payload)


@pytest.mark.parametrize("extra", [{"role": "admin"}, {"role": "distributor"},
                                   {"is_active": True}, {"agent_id": 1}, {"is_demo": True}])
def test_role_and_flags_cannot_be_injected(client: TestClient, seeded: Path,
                                           extra: dict[str, object]) -> None:
    res = client.post(f"{API}/auth/signup", json={**NEW, **extra})
    assert res.status_code == 422
    assert _user("new.person@example.org") is None


@pytest.mark.parametrize("body", [
    {**NEW, "password": "short7!"},
    {**NEW, "email": "not-an-email"},
    {**NEW, "full_name": "   "},
    {"email": "a@b.org", "password": PW},
])
def test_signup_validates_input(client: TestClient, seeded: Path, body: dict[str, str]) -> None:
    assert client.post(f"{API}/auth/signup", json=body).status_code == 422


def test_duplicate_email_rejected_without_detail(client: TestClient, seeded: Path) -> None:
    res = client.post(f"{API}/auth/signup", json={**NEW, "email": AGENT_MIRPUR.upper()})
    assert res.status_code == 400 and res.json() == {"detail": "signup_rejected"}
    assert client.post(f"{API}/auth/signup", json=NEW).status_code == 202
    again = client.post(f"{API}/auth/signup", json=NEW)
    assert again.json() == {"detail": "signup_rejected"}
    assert [r.payload["outcome"] for r in _audit("auth.signup")] == \
        ["rejected", "pending", "rejected"]


def test_signup_rate_limited_per_ip(client: TestClient, seeded: Path,
                                    monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIGNUP_PER_HOUR", "2")
    get_settings.cache_clear()
    for i in range(2):
        body = {**NEW, "email": f"user{i}@example.org"}
        assert client.post(f"{API}/auth/signup", json=body).status_code == 202
    res = client.post(f"{API}/auth/signup", json={**NEW, "email": "user9@example.org"})
    assert res.status_code == 429 and res.json()["detail"] == "too_many_attempts"
    other = client.post(f"{API}/auth/signup", json={**NEW, "email": "user9@example.org"},
                        headers={"X-Real-IP": "10.9.9.9"})
    assert other.status_code == 202


def test_admin_approval_flow(client: TestClient, seeded: Path) -> None:
    assert client.post(f"{API}/auth/signup", json=NEW).status_code == 202
    u = _user("new.person@example.org")
    assert u is not None
    h = bearer(client, ADMIN)
    pending = client.get(f"{API}/admin/users", params={"status": "pending"}, headers=h).json()
    assert [i["email"] for i in pending["items"]] == [u.email]
    assert pending["items"][0]["is_pending"] is True
    disabled = client.get(f"{API}/admin/users", params={"status": "disabled"}, headers=h).json()
    assert u.email not in {i["email"] for i in disabled["items"]}

    # An agent account needs its agent link before it can be switched on.
    res = client.patch(f"{API}/admin/users/{u.id}", json={"is_active": True}, headers=h)
    assert res.status_code == 422 and res.json()["detail"] == "agent_required"
    res = client.patch(f"{API}/admin/users/{u.id}", headers=h,
                       json={"is_active": True, "agent_id": agent_id("AGT-0001"),
                             "note": "verified"})
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is True and res.json()["is_pending"] is False
    (row,) = _audit("user.approve")
    assert row.entity_id == str(u.id) and row.note == "verified"
    assert row.payload["before"]["is_pending"] is True

    login = client.post(f"{API}/auth/login", json={"email": u.email, "password": PW})
    assert login.status_code == 200 and login.json()["user"]["role"] == "agent"


def test_non_admin_cannot_approve(client: TestClient, seeded: Path) -> None:
    assert client.post(f"{API}/auth/signup", json=NEW).status_code == 202
    u = _user("new.person@example.org")
    assert u is not None
    res = client.patch(f"{API}/admin/users/{u.id}", json={"is_active": True},
                       headers=bearer(client, AGENT_MIRPUR))
    assert res.status_code == 403
