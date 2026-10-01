import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_engine
from app.core.security import create_access_token
from app.models import User
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, bearer, login

API = "/api/v1"


def _user(email: str) -> User:
    with Session(get_engine()) as session:
        user = session.scalar(select(User).where(User.email == email))
        assert user is not None
        return user


def test_login_returns_tokens_and_user(client: TestClient, seeded: Path) -> None:
    body = login(client, AGENT_MIRPUR)
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    user = body["user"]
    assert isinstance(user, dict)
    assert user["role"] == "agent" and user["agent_id"] is not None
    assert "password_hash" not in user
    assert "refresh_token" not in body


def test_login_email_is_case_insensitive(client: TestClient, seeded: Path) -> None:
    res = client.post(
        f"{API}/auth/login", json={"email": "  Admin@AgentPulse.demo ", "password": "test-admin-pw"}
    )
    assert res.status_code == 200


def test_wrong_password_rejected(client: TestClient, seeded: Path) -> None:
    res = client.post(f"{API}/auth/login", json={"email": ADMIN, "password": "nope"})
    assert res.status_code == 401
    assert res.json()["detail"] == "invalid_credentials"
    assert "access_token" not in res.json()


def test_unknown_email_same_error(client: TestClient, seeded: Path) -> None:
    res = client.post(f"{API}/auth/login", json={"email": "x@y.z", "password": "test-admin-pw"})
    assert res.status_code == 401
    assert res.json()["detail"] == "invalid_credentials"


def test_inactive_user_cannot_login(client: TestClient, seeded: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        session.execute(update(User).where(User.email == ADMIN).values(is_active=False))
    res = client.post(f"{API}/auth/login", json={"email": ADMIN, "password": "test-admin-pw"})
    assert res.status_code == 401


def test_me_returns_current_user(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/auth/me", headers=bearer(client, DIST_DHAKA))
    assert res.status_code == 200
    assert res.json()["email"] == DIST_DHAKA
    assert res.json()["role"] == "distributor"
    assert res.json()["theme"] == "system"
    assert res.json()["lang"] in ("bn", "en")
    assert res.json()["last_login_at"] is not None


def test_me_requires_token(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/auth/me")
    assert res.status_code == 401
    assert res.json()["detail"] == "not_authenticated"


def test_expired_access_token_rejected(client: TestClient, seeded: Path) -> None:
    user = _user(ADMIN)
    past = datetime.now(UTC) - timedelta(hours=1)
    token, _ = create_access_token(user.id, user.role.value, get_settings(), now=past)
    res = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert res.json()["detail"] == "token_expired"


def test_tampered_or_foreign_token_rejected(client: TestClient, seeded: Path) -> None:
    user = _user(ADMIN)
    now = datetime.now(UTC)
    forged = jwt.encode(
        {"sub": str(user.id), "role": "admin", "type": "access", "iat": now,
         "exp": now + timedelta(minutes=5)},
        "some-other-secret-that-is-long-enough",
        algorithm="HS256",
    )
    for token in (forged, "not-a-jwt"):
        res = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 401
        assert res.json()["detail"] == "invalid_token"


def test_unknown_user_in_token_rejected(client: TestClient, seeded: Path) -> None:
    token, _ = create_access_token(uuid.uuid4(), "admin", get_settings())
    res = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
