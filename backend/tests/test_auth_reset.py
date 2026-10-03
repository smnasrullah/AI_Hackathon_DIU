"""Forgot / reset password: dev mailer, no enumeration, hashed single-use expiring tokens,
sessions revoked, rate limits, audit rows without secrets."""

import logging
import re
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.v1.auth import reset_limiter
from app.core.config import get_settings
from app.core.db import get_engine
from app.models import AuditLog, PasswordResetToken, RefreshToken
from tests.auth_helpers import AGENT_MIRPUR, login, password_for

API = "/api/v1"
NEW_PW = "brand-new-password-1"
LINK = re.compile(r"/reset-password#token=([A-Za-z0-9_\-]+)")


@pytest.fixture(autouse=True)
def fresh_limiter() -> Iterator[None]:
    reset_limiter.reset()
    yield
    reset_limiter.reset()


def _request(client: TestClient, caplog: pytest.LogCaptureFixture, email: str,
             headers: dict[str, str] | None = None) -> tuple[int, dict[str, object], str | None]:
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="app.mailer"):
        res = client.post(f"{API}/auth/forgot-password", json={"email": email}, headers=headers)
    found = [m for r in caplog.records if (m := LINK.search(r.getMessage()))]
    return res.status_code, res.json(), found[-1].group(1) if found else None


def _reset(client: TestClient, token: str, pw: str = NEW_PW) -> int:
    return client.post(f"{API}/auth/reset-password",
                       json={"token": token, "new_password": pw}).status_code


def _audit(action: str) -> list[AuditLog]:
    with Session(get_engine()) as session:
        return list(session.scalars(select(AuditLog).where(AuditLog.action == action)
                                    .order_by(AuditLog.id)))


def test_same_answer_whether_or_not_the_account_exists(
        client: TestClient, seeded: Path, caplog: pytest.LogCaptureFixture) -> None:
    known = _request(client, caplog, AGENT_MIRPUR)
    unknown = _request(client, caplog, "nobody@example.org")
    assert known[:2] == unknown[:2] == (202, {"status": "reset_requested"})
    assert known[2] is not None and unknown[2] is None
    rec = [r for r in caplog.records if r.name == "app.mailer"]
    assert rec == []  # the unknown e-mail logged nothing
    outcomes = [r.payload["outcome"] for r in _audit("auth.password_reset_request")]
    assert outcomes == ["issued", "no_active_account"]


def test_dev_mailer_is_marked_and_only_hash_is_stored(
        client: TestClient, seeded: Path, caplog: pytest.LogCaptureFixture) -> None:
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="app.mailer"):
        client.post(f"{API}/auth/forgot-password", json={"email": AGENT_MIRPUR})
    (msg,) = [r.getMessage() for r in caplog.records if r.name == "app.mailer"]
    assert "DEV ONLY" in msg
    m = LINK.search(msg)
    assert m is not None
    token = m.group(1)
    with Session(get_engine()) as session:
        (row,) = session.scalars(select(PasswordResetToken))
        assert row.token_hash != token and token not in row.token_hash
        expires = row.expires_at.replace(tzinfo=UTC) if row.expires_at.tzinfo is None \
            else row.expires_at
        assert timedelta(minutes=29) < expires - datetime.now(UTC) <= timedelta(minutes=30)
    for r in _audit("auth.password_reset_request"):
        assert token not in repr(r.payload)


def test_reset_is_single_use_and_revokes_sessions(
        client: TestClient, seeded: Path, caplog: pytest.LogCaptureFixture) -> None:
    login(client, AGENT_MIRPUR)  # an open session that the reset must end
    _, _, token = _request(client, caplog, AGENT_MIRPUR)
    assert token is not None
    assert _reset(client, token) == 200
    assert _reset(client, token, "another-password-2") == 400
    with Session(get_engine()) as session:
        still_open = session.scalar(select(func.count()).select_from(RefreshToken).where(
            RefreshToken.revoked_at.is_(None)))
        assert still_open == 0
    old = client.post(f"{API}/auth/login",
                      json={"email": AGENT_MIRPUR, "password": password_for(AGENT_MIRPUR)})
    assert old.status_code == 401
    new = client.post(f"{API}/auth/login", json={"email": AGENT_MIRPUR, "password": NEW_PW})
    assert new.status_code == 200
    (row,) = _audit("auth.password_reset")
    assert row.payload["sessions_revoked"] == "1"
    assert NEW_PW not in repr(row.payload) and token not in repr(row.payload)


def test_expired_and_unknown_tokens_are_refused_alike(
        client: TestClient, seeded: Path, caplog: pytest.LogCaptureFixture) -> None:
    _, _, token = _request(client, caplog, AGENT_MIRPUR)
    assert token is not None
    with Session(get_engine()) as session, session.begin():
        session.execute(update(PasswordResetToken).values(
            expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    for t in (token, "x" * 43):
        res = client.post(f"{API}/auth/reset-password", json={"token": t, "new_password": NEW_PW})
        assert res.status_code == 400 and res.json() == {"detail": "invalid_reset_token"}


def test_new_request_invalidates_older_link(
        client: TestClient, seeded: Path, caplog: pytest.LogCaptureFixture) -> None:
    _, _, first = _request(client, caplog, AGENT_MIRPUR)
    _, _, second = _request(client, caplog, AGENT_MIRPUR)
    assert first and second and first != second
    assert _reset(client, first) == 400
    assert _reset(client, second) == 200


def test_reset_rejects_short_password(
        client: TestClient, seeded: Path, caplog: pytest.LogCaptureFixture) -> None:
    _, _, token = _request(client, caplog, AGENT_MIRPUR)
    assert token is not None
    assert _reset(client, token, "short") == 422
    assert _reset(client, token) == 200  # the failed attempt did not spend the token


def test_requests_rate_limited_per_ip_and_per_account(
        client: TestClient, seeded: Path, caplog: pytest.LogCaptureFixture,
        monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESET_PER_ACCOUNT_PER_HOUR", "1")
    monkeypatch.setenv("RESET_REQUEST_PER_HOUR", "3")
    get_settings.cache_clear()
    assert _request(client, caplog, AGENT_MIRPUR)[2] is not None
    # Per account: same answer, but no second link.
    throttled = _request(client, caplog, AGENT_MIRPUR)
    assert throttled[:2] == (202, {"status": "reset_requested"}) and throttled[2] is None
    assert _request(client, caplog, "nobody@example.org")[0] == 202
    # Per IP: the fourth request from this address is refused, another address is not.
    assert _request(client, caplog, "nobody@example.org")[0] == 429
    other = _request(client, caplog, "nobody@example.org", headers={"X-Real-IP": "10.9.9.9"})
    assert other[0] == 202
    outcomes = [r.payload["outcome"] for r in _audit("auth.password_reset_request")]
    assert outcomes == ["issued", "throttled", "no_active_account", "no_active_account"]
