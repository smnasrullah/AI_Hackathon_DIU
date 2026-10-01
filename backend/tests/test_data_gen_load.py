"""Loading the synthetic dataset into the database (SQLite here; COPY path runs on Postgres)."""

import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, DATA_VERSION, get_settings
from app.core.db import get_engine
from app.models import Agent
from app.models.system_meta import SystemMeta
from app.models.timeseries import Event, FloatSnapshot, Transaction, WeatherDaily
from ml.data_gen import demo_scenario, demo_spec
from ml.data_gen import run as run_cli
from ml.data_gen.timeline import N_HOURS, SIM_NOW

N = 8


@pytest.fixture
def migrated(env: Path) -> Path:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = get_settings().database_url
    command.upgrade(cfg, "head")
    return env


def _count(model: type, *where: object) -> int:
    with Session(get_engine()) as s:
        return s.scalar(select(func.count()).select_from(model).where(*where)) or 0


def _meta(key: str) -> object:
    with Session(get_engine()) as s:
        row = s.get(SystemMeta, key)
        return row.value if row else None


def _run_cli(monkeypatch: pytest.MonkeyPatch, module: object, *args: str) -> None:
    monkeypatch.setattr(sys, "argv", ["prog", *args])
    assert module.main() == 0  # type: ignore[attr-defined]


def test_run_cli_loads_and_is_idempotent(migrated: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _run_cli(monkeypatch, run_cli, "--agents", str(N))
    first = (_count(Agent), _count(FloatSnapshot), _count(Transaction), _count(Event),
             _count(WeatherDaily))
    assert first[0] == N and first[1] == N * N_HOURS
    assert first[2] > N * N_HOURS and first[3] > 50 and first[4] == 5 * 120
    assert _count(FloatSnapshot, FloatSnapshot.is_holdout.is_(True)) == N * 14 * 24
    assert _count(Transaction, Transaction.is_holdout.is_(True)) > 0
    assert _meta("sim_now") == SIM_NOW.isoformat()
    assert _meta("data_version") == DATA_VERSION
    labels = _meta("synthetic_labels")
    assert isinstance(labels, dict) and labels["demo"]["stockout"]["agent_code"] == "AGT-0001"
    assert any(a["agent_code"] == demo_spec.ANOMALY_AGENT for a in labels["anomalies"])

    _run_cli(monkeypatch, run_cli, "--agents", str(N))
    again = (_count(Agent), _count(FloatSnapshot), _count(Transaction), _count(Event),
             _count(WeatherDaily))
    assert again == first


def test_demo_scenario_cli_restores_demo_agents(
    migrated: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _run_cli(monkeypatch, run_cli, "--agents", str(N))
    with Session(get_engine()) as s, s.begin():
        aid = s.scalar(select(Agent.id).where(Agent.code == demo_spec.STOCKOUT_AGENT))
        s.query(FloatSnapshot).filter(FloatSnapshot.agent_id == aid).delete()
    assert _count(FloatSnapshot, FloatSnapshot.agent_id == aid) == 0

    _run_cli(monkeypatch, demo_scenario)
    assert _count(FloatSnapshot, FloatSnapshot.agent_id == aid) == N_HOURS
    with Session(get_engine()) as s:
        tonight = s.scalar(select(FloatSnapshot.cash_balance).where(
            FloatSnapshot.agent_id == aid, FloatSnapshot.ts == SIM_NOW))
    assert tonight is not None and tonight > 0
    assert _count(Agent) == N  # demo agents already existed; nothing duplicated
