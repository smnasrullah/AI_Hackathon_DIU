import os
import shutil
from collections.abc import Iterator
from pathlib import Path

# Must precede app imports: skips the JWT secret length guard for unit tests.
os.environ["APP_ENV"] = "test"


import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_engine
from app.main import create_app
from app.services import forecast, seed
from ml.data_gen import generate
from ml.features.build import MAX_HORIZON_H
from ml.training import train

N_TRAINED_AGENTS = 8
TRAIN_ROUNDS = 20


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Isolated settings: sqlite file DB, temp state file, empty artifacts dir."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{(tmp_path / 'test.db').as_posix()}")
    monkeypatch.setenv("BOOTSTRAP_STATE_FILE", str(tmp_path / "state"))
    monkeypatch.setenv("ARTIFACTS_DIR", str(tmp_path / "artifacts"))
    monkeypatch.setenv("LLM_PROVIDER", "auto")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("DEMO_MODE", "true")
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


@pytest.fixture(scope="session")
def trained(tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[Path, Path]]:
    """One small synthetic DB + tiny trained artifacts, shared by every test that asks."""
    root = tmp_path_factory.mktemp("forecast")
    db, artifacts = root / "trained.db", root / "artifacts"
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db.as_posix()}")
        get_settings.cache_clear()
        get_engine.cache_clear()
        cfg = Config(str(BACKEND_DIR / "alembic.ini"))
        cfg.attributes["database_url"] = get_settings().database_url
        command.upgrade(cfg, "head")
        generate.run(seed=42, n_agents=N_TRAINED_AGENTS)
        train.run(artifacts, seed=42, rounds=TRAIN_ROUNDS)
        get_engine().dispose()
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield db, artifacts


@pytest.fixture
def ready(env: Path, trained: tuple[Path, Path], request: pytest.FixtureRequest,
          monkeypatch: pytest.MonkeyPatch) -> Path:
    """Copy of the trained DB, reference seed, forecast + explanation cache at SIM_NOW."""
    db, artifacts = trained
    shutil.copy(db, env / "test.db")
    monkeypatch.setenv("ARTIFACTS_DIR", str(artifacts))
    get_settings.cache_clear()
    request.getfixturevalue("seeded")
    with Session(get_engine()) as session, session.begin():
        assert forecast.precompute(session, artifacts) == N_TRAINED_AGENTS * 2 * MAX_HORIZON_H
    return artifacts
