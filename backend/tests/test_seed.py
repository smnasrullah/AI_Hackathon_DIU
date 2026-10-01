from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_engine
from app.core.security import verify_password
from app.models import Agent, Distributor, User
from app.models.enums import UserRole
from app.services import seed


@pytest.fixture
def migrated(env: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("DEMO_ADMIN_PASSWORD", "test-admin-pw")
    monkeypatch.setenv("DEMO_DISTRIBUTOR_PASSWORD", "test-dist-pw")
    monkeypatch.setenv("DEMO_AGENT_PASSWORD", "test-agent-pw")
    get_settings.cache_clear()
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = get_settings().database_url
    command.upgrade(cfg, "head")
    return env


def _run_seed() -> dict[str, int]:
    with Session(get_engine()) as session, session.begin():
        return seed.run(session, get_settings())


def _snapshot() -> list[tuple[str, str, str, int | None, int | None]]:
    with Session(get_engine()) as session:
        rows = session.scalars(select(User).order_by(User.email)).all()
        return [(u.email, u.role.value, u.password_hash, u.agent_id, u.distributor_id)
                for u in rows]


def _count(model: type[Agent] | type[Distributor] | type[User]) -> int:
    with Session(get_engine()) as session:
        return session.scalar(select(func.count()).select_from(model)) or 0


def test_seed_creates_reference_rows(migrated: Path) -> None:
    counts = _run_seed()
    assert counts == {
        "distributors_created": 3, "agents_created": 3, "users_created": 7, "users_skipped": 0,
    }
    with Session(get_engine()) as session:
        roles = [u.role for u in session.scalars(select(User)).all()]
        admin = session.scalar(select(User).where(User.role == UserRole.admin))
        agent_email = "agent.mirpur@agentpulse.demo"
        agent_user = session.scalar(select(User).where(User.email == agent_email))
        assert admin is not None and agent_user is not None
        assert verify_password("test-admin-pw", admin.password_hash)
        assert "test-admin-pw" not in admin.password_hash
        assert agent_user.agent_id is not None and agent_user.distributor_id is not None
    assert roles.count(UserRole.admin) == 1
    assert roles.count(UserRole.distributor) == 3
    assert roles.count(UserRole.agent) == 3


def test_seed_is_idempotent(migrated: Path) -> None:
    _run_seed()
    before = _snapshot()
    again = _run_seed()
    assert again == {
        "distributors_created": 0, "agents_created": 0, "users_created": 0, "users_skipped": 0,
    }
    assert _snapshot() == before
    assert (_count(Distributor), _count(Agent), _count(User)) == (3, 3, 7)


def test_seed_skips_users_without_password(
    migrated: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_AGENT_PASSWORD", "")
    get_settings.cache_clear()
    counts = _run_seed()
    assert counts["users_created"] == 4
    assert counts["users_skipped"] == 3
