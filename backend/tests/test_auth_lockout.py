import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import update
from sqlalchemy.orm import Session

import bootstrap
from app.core.db import get_engine
from app.models import LoginFailure
from tests.auth_helpers import ADMIN

API = "/api/v1"
GOOD = "test-admin-pw"


def _attempt(client: TestClient, email: str, password: str, ip: str = "10.0.0.1") -> Response:
    return client.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        headers={"X-Real-IP": ip},
    )


def _fail(client: TestClient, email: str, times: int, ip: str = "10.0.0.1") -> None:
    for _ in range(times):
        assert _attempt(client, email, "wrong", ip).status_code == 401


def test_five_failures_lock_email_and_ip(client: TestClient, seeded: Path) -> None:
    _fail(client, ADMIN, 5)
    res = _attempt(client, ADMIN, GOOD)
    assert res.status_code == 429
    assert res.json()["detail"] == "too_many_attempts"
    assert res.headers["retry-after"] == str(15 * 60)


def test_four_failures_then_success_resets_counter(client: TestClient, seeded: Path) -> None:
    _fail(client, ADMIN, 4)
    assert _attempt(client, ADMIN, GOOD).status_code == 200
    _fail(client, ADMIN, 4)
    assert _attempt(client, ADMIN, GOOD).status_code == 200


def test_lockout_is_per_ip(client: TestClient, seeded: Path) -> None:
    _fail(client, ADMIN, 5)
    assert _attempt(client, ADMIN, GOOD, ip="10.0.0.2").status_code == 200


def test_unknown_email_locks_the_same_way(client: TestClient, seeded: Path) -> None:
    _fail(client, "nobody@agentpulse.demo", 5)
    res = _attempt(client, "nobody@agentpulse.demo", "wrong")
    assert res.status_code == 429


def test_lock_expires_after_window(client: TestClient, seeded: Path) -> None:
    _fail(client, ADMIN, 5)
    with Session(get_engine()) as session, session.begin():
        session.execute(
            update(LoginFailure).values(created_at=datetime.now(UTC) - timedelta(minutes=16))
        )
    assert _attempt(client, ADMIN, GOOD).status_code == 200


def test_e2e_fixtures_cli_clears_the_wrong_password_lockout(
    client: TestClient, seeded: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    email = bootstrap.E2E_WRONG_PASSWORD_USER
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"})
    blocked = client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"})
    assert blocked.json()["detail"] == "too_many_attempts"
    monkeypatch.setattr(sys, "argv", ["bootstrap.py", "e2e-fixtures"])
    assert bootstrap.main() == 0
    again = client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"})
    assert again.json()["detail"] == "invalid_credentials"
