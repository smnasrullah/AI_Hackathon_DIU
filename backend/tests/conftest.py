import os
import shutil
from collections.abc import Callable, Iterator
from pathlib import Path

# Must precede app imports: skips the JWT secret length guard for unit tests.
os.environ["APP_ENV"] = "test"


import bcrypt
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
# Tests using these fixtures load the full synthetic set; they run only in check -Slow / -Full.
SLOW_FIXTURES = {"ds"}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        if SLOW_FIXTURES & set(getattr(item, "fixturenames", ())):
            item.add_marker(pytest.mark.slow)


@pytest.fixture(scope="session", autouse=True)
def fast_bcrypt() -> Iterator[None]:
    """Minimum bcrypt cost in tests (hashes stay valid bcrypt); the app keeps the default."""
    gensalt = bcrypt.gensalt
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(bcrypt, "gensalt", lambda rounds=4, prefix=b"2b": gensalt(4, prefix))
        yield


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


def _seed_env(mp: pytest.MonkeyPatch) -> None:
    for role, password in DEMO_PASSWORDS.items():
        mp.setenv(f"DEMO_{role.upper()}_PASSWORD", password)
    mp.setenv("JWT_SECRET", "test-secret-with-at-least-32-bytes!!")
    mp.setenv("LLM_PROVIDER", "auto")
    mp.setenv("LLM_API_KEY", "")
    mp.setenv("DEMO_MODE", "true")


def migrate_and_seed() -> None:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = get_settings().database_url
    command.upgrade(cfg, "head")
    with Session(get_engine()) as session, session.begin():
        seed.run(session, get_settings())


def build_template(db: Path, build: Callable[[], None], base: Path | None = None,
                   artifacts: Path | None = None) -> Path:
    """Build a session-wide template DB once (optionally on a copy of `base`); tests copy it."""
    if base is not None:
        shutil.copy(base, db)
    with pytest.MonkeyPatch.context() as mp:
        _seed_env(mp)
        mp.setenv("ARTIFACTS_DIR", str(artifacts or db.parent / "artifacts"))
        mp.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db.as_posix()}")
        get_settings.cache_clear()
        get_engine.cache_clear()
        build()
        get_engine().dispose()
    get_settings.cache_clear()
    get_engine.cache_clear()
    return db


def use_template(env: Path, template: Path) -> None:
    get_engine().dispose()
    shutil.copy(template, env / "test.db")


@pytest.fixture(scope="session")
def seeded_template(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return build_template(tmp_path_factory.mktemp("seeded") / "seeded.db", migrate_and_seed)


@pytest.fixture
def seeded(env: Path, seeded_template: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Migrated DB with the reference seed (3 distributors, 3 agents, 7 demo users)."""
    _seed_env(monkeypatch)
    get_settings.cache_clear()
    use_template(env, seeded_template)
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


@pytest.fixture(scope="session")
def ready_template(trained: tuple[Path, Path], tmp_path_factory: pytest.TempPathFactory) -> Path:
    db, artifacts = trained

    def build() -> None:
        migrate_and_seed()
        with Session(get_engine()) as session, session.begin():
            n = forecast.precompute(session, artifacts)
            assert n == N_TRAINED_AGENTS * 2 * MAX_HORIZON_H

    return build_template(tmp_path_factory.mktemp("ready") / "ready.db", build, base=db,
                          artifacts=artifacts)


@pytest.fixture
def ready(seeded: Path, trained: tuple[Path, Path], ready_template: Path,
          monkeypatch: pytest.MonkeyPatch) -> Path:
    """Copy of the trained DB, reference seed, forecast + explanation cache at SIM_NOW."""
    artifacts = trained[1]
    monkeypatch.setenv("ARTIFACTS_DIR", str(artifacts))
    get_settings.cache_clear()
    use_template(seeded, ready_template)
    return artifacts
