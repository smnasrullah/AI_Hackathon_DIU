"""Rejecting a pending self-signup: kept (never deleted), cannot sign in, no status leak, audit."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import signup_limiter
from app.core.db import get_engine
from app.models import AuditLog, User
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, agent_id, bearer

API = "/api/v1"
PW = "signup-password-1"
NEW = {"full_name": "New Person", "email": "new.person@example.org", "password": PW}


@pytest.fixture(autouse=True)
def fresh_limiter() -> Iterator[None]:
    signup_limiter.reset()
    yield
    signup_limiter.reset()


def _user(email: str) -> User | None:
    with Session(get_engine()) as session:
        return session.scalar(select(User).where(User.email == email))


def _rejected_signup(client: TestClient) -> User:
    assert client.post(f"{API}/auth/signup", json=NEW).status_code == 202
    u = _user(NEW["email"])
    assert u is not None
    res = client.post(f"{API}/admin/users/{u.id}/reject", json={"note": "unknown shop"},
                      headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_rejected"] is True and body["is_pending"] is False
    assert body["is_active"] is False
    return u


def test_reject_keeps_account_and_writes_audit(client: TestClient, seeded: Path) -> None:
    u = _rejected_signup(client)
    kept = _user(NEW["email"])
    assert kept is not None and kept.is_rejected and not kept.is_active  # no hard delete
    with Session(get_engine()) as session:
        (row,) = session.scalars(select(AuditLog).where(AuditLog.action == "user.reject"))
        admin_id = session.scalar(select(User.id).where(User.email == ADMIN))
    assert row.user_id == admin_id and row.entity_id == str(u.id)
    assert row.payload["outcome"] == "rejected" and row.note == "unknown shop"
    assert row.created_at is not None
    h = bearer(client, ADMIN)
    listed = client.get(f"{API}/admin/users", params={"status": "rejected"}, headers=h).json()
    assert [i["email"] for i in listed["items"]] == [NEW["email"]]
    for other in ("pending", "disabled"):
        page = client.get(f"{API}/admin/users", params={"status": other}, headers=h).json()
        assert NEW["email"] not in {i["email"] for i in page["items"]}


def test_rejected_cannot_log_in_and_error_is_generic(client: TestClient, seeded: Path) -> None:
    _rejected_signup(client)
    rejected = client.post(f"{API}/auth/login", json={"email": NEW["email"], "password": PW})
    wrong = client.post(f"{API}/auth/login",
                        json={"email": AGENT_MIRPUR, "password": "wrong-password-1"})
    assert rejected.status_code == wrong.status_code == 401
    assert rejected.json() == wrong.json() == {"detail": "invalid_credentials"}


def test_signup_again_with_rejected_email_looks_like_duplicate(client: TestClient,
                                                               seeded: Path) -> None:
    _rejected_signup(client)
    again = client.post(f"{API}/auth/signup", json=NEW)
    duplicate = client.post(f"{API}/auth/signup", json={**NEW, "email": AGENT_MIRPUR})
    assert again.status_code == duplicate.status_code == 400
    assert again.json() == duplicate.json() == {"detail": "signup_rejected"}


def test_rejected_cannot_be_activated_or_rejected_twice(client: TestClient,
                                                        seeded: Path) -> None:
    u = _rejected_signup(client)
    h = bearer(client, ADMIN)
    res = client.patch(f"{API}/admin/users/{u.id}", headers=h,
                       json={"is_active": True, "agent_id": agent_id("AGT-0001")})
    assert res.status_code == 409 and res.json()["detail"] == "user_rejected"
    res = client.post(f"{API}/admin/users/{u.id}/reject", json={}, headers=h)
    assert res.status_code == 409 and res.json()["detail"] == "not_pending"


def test_only_pending_accounts_can_be_rejected(client: TestClient, seeded: Path) -> None:
    h = bearer(client, ADMIN)
    active = _user(AGENT_MIRPUR)
    assert active is not None
    res = client.post(f"{API}/admin/users/{active.id}/reject", json={}, headers=h)
    assert res.status_code == 409 and res.json()["detail"] == "not_pending"


@pytest.mark.parametrize("who", [AGENT_MIRPUR, DIST_DHAKA])
def test_non_admin_cannot_reject(client: TestClient, seeded: Path, who: str) -> None:
    assert client.post(f"{API}/auth/signup", json=NEW).status_code == 202
    u = _user(NEW["email"])
    assert u is not None
    res = client.post(f"{API}/admin/users/{u.id}/reject", json={}, headers=bearer(client, who))
    assert res.status_code == 403
    still = _user(NEW["email"])
    assert still is not None and still.is_pending and not still.is_rejected
