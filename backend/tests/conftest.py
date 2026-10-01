from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_engine
from app.main import create_app
from app.services import seed


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Isolated settings: sqlite file DB, temp state file, empty artifacts dir."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{(tmp_path / 'test.db').as_posix()}")
    monkeypatch.setenv("BOOTSTRAP_STATE_FILE", str(tmp_path / "state"))
    monkeypatch.setenv("ARTIFACTS_DIR", str(tmp_path / "artifacts"))
    monkeypatch.setenv("LLM_PROVIDER", "auto")
    monkeypatch.setenv("LLM_API_KEY", "")
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield tmp_path
    get_engine().dispose()
    get_settings.cache_clear()
    get_engine.cache_clear()


@pytest.fixture
def client(env: Path) -> TestClient:
    return TestClient(create_app())


DEMO_PASSWORDS = {"admin": "test-admin-pw", "distributor": "test-dist-pw", "agent": "test-agent-pw"}


@pytest.fixture
def seeded(env: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Migrated DB with the reference seed (3 distributors, 3 agents, 7 demo users)."""
    for role, password in DEMO_PASSWORDS.items():
        monkeypatch.setenv(f"DEMO_{role.upper()}_PASSWORD", password)
    monkeypatch.setenv("JWT_SECRET", "test-secret-with-at-least-32-bytes!!")
    get_settings.cache_clear()
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = get_settings().database_url
    command.upgrade(cfg, "head")
    with Session(get_engine()) as session, session.begin():
        seed.run(session, get_settings())
    return env
