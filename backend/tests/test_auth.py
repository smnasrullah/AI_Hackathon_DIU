import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_engine
from app.core.security import create_access_token, hash_refresh_token
from app.models import RefreshToken, User
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


def test_refresh_rotates_token(client: TestClient, seeded: Path) -> None:
    first = login(client, AGENT_MIRPUR)
    res = client.post(f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert res.status_code == 200
    second = res.json()
    assert second["refresh_token"] != first["refresh_token"]
    me = client.get(
        f"{API}/auth/me", headers={"Authorization": f"Bearer {second['access_token']}"}
    )
    assert me.status_code == 200


def test_refresh_reuse_revokes_all_sessions(client: TestClient, seeded: Path) -> None:
    first = login(client, AGENT_MIRPUR)
    second = client.post(
        f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]}
    ).json()
    reuse = client.post(f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert reuse.status_code == 401
    after = client.post(f"{API}/auth/refresh", json={"refresh_token": second["refresh_token"]})
    assert after.status_code == 401


def test_expired_refresh_token_rejected(client: TestClient, seeded: Path) -> None:
    raw = str(login(client, ADMIN)["refresh_token"])
    with Session(get_engine()) as session, session.begin():
        session.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == hash_refresh_token(raw))
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
    res = client.post(f"{API}/auth/refresh", json={"refresh_token": raw})
    assert res.status_code == 401
    assert res.json()["detail"] == "invalid_refresh_token"


def test_unknown_refresh_token_rejected(client: TestClient, seeded: Path) -> None:
    res = client.post(f"{API}/auth/refresh", json={"refresh_token": "x" * 64})
    assert res.status_code == 401


def test_access_token_cannot_be_used_as_refresh(client: TestClient, seeded: Path) -> None:
    access = login(client, ADMIN)["access_token"]
    res = client.post(f"{API}/auth/refresh", json={"refresh_token": access})
    assert res.status_code in (401, 422)


def test_logout_revokes_refresh_token(client: TestClient, seeded: Path) -> None:
    body = login(client, ADMIN)
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    res = client.post(
        f"{API}/auth/logout", json={"refresh_token": body["refresh_token"]}, headers=headers
    )
    assert res.status_code == 204
    again = client.post(f"{API}/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert again.status_code == 401


def test_refresh_token_stored_hashed(client: TestClient, seeded: Path) -> None:
    raw = str(login(client, ADMIN)["refresh_token"])
    with Session(get_engine()) as session:
        hashes = session.scalars(select(RefreshToken.token_hash)).all()
    assert raw not in hashes
    assert hash_refresh_token(raw) in hashes
