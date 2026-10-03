"""Migration up/down on SQLite always; also on Postgres when TEST_POSTGRES_URL is set."""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect, text

from app.core.config import BACKEND_DIR
from app.models import Base

CORE_TABLES = {
    "users", "refresh_tokens", "distributors", "agents", "float_snapshots", "transactions",
    "events", "weather_daily", "forecasts", "stockout_predictions", "risk_levels",
    "recommendations", "swap_suggestions", "anomalies", "impact_results", "audit_log",
    "model_versions", "llm_call_log", "llm_cache", "copilot_messages", "knowledge_docs",
    "login_failures", "notifications", "liquidity_requests", "liquidity_request_recipients",
}
AGENT_TS_TABLES = {
    "transactions": "ix_transactions_agent_ts",
    "forecasts": "ix_forecasts_agent_ts",
    "stockout_predictions": "ix_stockout_predictions_agent_ts",
    "risk_levels": "ix_risk_levels_agent_ts",
}


def _urls(tmp_path: Path) -> list[str]:
    urls = [f"sqlite+pysqlite:///{(tmp_path / 'mig.db').as_posix()}"]
    pg = os.environ.get("TEST_POSTGRES_URL")
    if pg:
        urls.append(pg)
    return urls


@pytest.fixture(params=["sqlite", "postgres"])
def db(request: pytest.FixtureRequest, tmp_path: Path) -> Iterator[tuple[Config, Engine]]:
    urls = _urls(tmp_path)
    if request.param == "postgres" and len(urls) < 2:
        pytest.skip("TEST_POSTGRES_URL not set")
    url = urls[0] if request.param == "sqlite" else urls[1]
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = url
    engine = create_engine(url)
    command.downgrade(cfg, "base")
    yield cfg, engine
    command.downgrade(cfg, "base")
    engine.dispose()


def _tables(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def test_upgrade_creates_all_tables_and_indexes(db: tuple[Config, Engine]) -> None:
    cfg, engine = db
    command.upgrade(cfg, "head")
    insp = inspect(engine)
    assert CORE_TABLES | {"system_meta", "alembic_version"} <= _tables(engine)
    for table, index in AGENT_TS_TABLES.items():
        cols = {i["name"]: i["column_names"] for i in insp.get_indexes(table)}
        assert cols[index] == ["agent_id", "ts"]
    uniques = [u["column_names"] for u in insp.get_unique_constraints("float_snapshots")]
    assert ["agent_id", "ts"] in uniques
    agent_fks = {fk["referred_table"] for fk in insp.get_foreign_keys("agents")}
    assert agent_fks == {"distributors"}
    swap_fks = {fk["constrained_columns"][0]: fk["referred_table"]
                for fk in insp.get_foreign_keys("swap_suggestions")}
    assert swap_fks["donor_agent_id"] == "agents"
    assert swap_fks["decided_by"] == "users"


def test_models_match_migration(db: tuple[Config, Engine]) -> None:
    cfg, engine = db
    command.upgrade(cfg, "head")
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": False})
        diffs = compare_metadata(ctx, Base.metadata)
    assert diffs == []


def test_downgrade_to_base_and_back(db: tuple[Config, Engine]) -> None:
    cfg, engine = db
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "0001")
    assert _tables(engine) & CORE_TABLES == set()
    assert "system_meta" in _tables(engine)
    command.downgrade(cfg, "base")
    assert _tables(engine) <= {"alembic_version"}
    if engine.dialect.name == "postgresql":
        with engine.connect() as conn:
            left = conn.execute(text("SELECT count(*) FROM pg_type WHERE typname = 'float_type'"))
            assert left.scalar_one() == 0
    command.upgrade(cfg, "head")
    assert _tables(engine) >= CORE_TABLES
