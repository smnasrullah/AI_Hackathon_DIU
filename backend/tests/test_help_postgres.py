"""Help requests on a real Postgres (skipped unless TEST_POSTGRES_URL points at a disposable
database; every test drops the schema to base first and after):
- migrations 0016..0018 up and down with rows present (enum value, enum type rebuild),
- concurrent claims over several real connections: exactly one winner,
- the scheduler's advisory-lock leader guard,
- create()'s duplicate race with a savepoint.
"""

import os
import threading
import time
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_engine
from app.core.leader import Leader
from app.main import create_app
from app.models import User
from app.models.enums import HelpResponse
from app.services import help_scheduler, liquidity_requests, seed
from app.services.liquidity_requests import HelpError
from tests.auth_helpers import AGENT_PATIYA, DIST_DHAKA
from tests.conftest import _seed_env
from tests.help_helpers import AGENT_SUNAMGANJ, audits, make_request, responses, set_policy
from tests.test_help_savepoint import check_duplicate_race

PG = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not PG, reason="TEST_POSTGRES_URL not set")
HELPERS = [AGENT_PATIYA, AGENT_SUNAMGANJ, DIST_DHAKA]


def _cfg() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = PG
    return cfg


@pytest.fixture
def pg(env: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Engine]:
    """Migrated and seeded Postgres as the app database."""
    assert PG
    _seed_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", PG)
    get_settings.cache_clear()
    get_engine.cache_clear()
    command.downgrade(_cfg(), "base")
    command.upgrade(_cfg(), "head")
    with Session(get_engine()) as session, session.begin():
        seed.run(session, get_settings())
    yield get_engine()
    get_engine().dispose()
    command.downgrade(_cfg(), "base")


@pytest.fixture
def pg_client(pg: Engine) -> TestClient:
    return TestClient(create_app())


def _scalar(engine: Engine, sql: str) -> object:
    with engine.connect() as conn:
        return conn.execute(text(sql)).scalar()


def test_help_migrations_up_and_down_with_rows(env: Path) -> None:
    assert PG
    engine = create_engine(PG)
    cfg = _cfg()
    try:
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        uid = uuid.uuid4()
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO users (id, email, password_hash, full_name, role) "
                              "VALUES (:id, 'pg@test', 'x', 'PG', 'admin')"), {"id": uid})
            conn.execute(text("INSERT INTO notifications (user_id, type, severity, title_key, "
                              "params, entity_type) VALUES (:id, 'help_request', 'info', "
                              "'notifications.help.new', '{}', 'liquidity_request')"),
                         {"id": uid})
        assert _scalar(engine, "SELECT count(*) FROM pg_type "
                               "WHERE typname = 'help_reason_category'") == 1
        command.downgrade(cfg, "0017")  # 0018 down: columns and the category type go
        assert _scalar(engine, "SELECT count(*) FROM pg_type "
                               "WHERE typname = 'help_reason_category'") == 0
        command.downgrade(cfg, "0015")  # 0016 down: help rows deleted, enum value rebuilt away
        values = _scalar(engine, "SELECT string_agg(enumlabel, ',') FROM pg_enum e JOIN "
                                 "pg_type t ON t.oid = e.enumtypid "
                                 "WHERE t.typname = 'notification_type'")
        assert values is not None and "help_request" not in str(values)
        assert _scalar(engine, "SELECT count(*) FROM notifications") == 0
        assert _scalar(engine, "SELECT count(*) FROM pg_type WHERE typname IN "
                               "('help_status', 'help_response', 'help_origin', "
                               "'notification_type_old')") == 0
        command.upgrade(cfg, "head")  # and up again on the same database
        assert _scalar(engine, "SELECT count(*) FROM liquidity_requests") == 0
    finally:
        command.downgrade(cfg, "base")
        engine.dispose()


def test_concurrent_claims_have_exactly_one_winner_on_postgres(pg_client: TestClient) -> None:
    req_id, _ = make_request(HELPERS)
    barrier = threading.Barrier(len(HELPERS))
    outcomes: dict[str, str] = {}

    def attempt(email: str) -> None:
        with Session(get_engine()) as session:  # its own pooled connection
            user = session.query(User).filter(User.email == email).one()
            barrier.wait()
            try:
                liquidity_requests.claim(session, user, req_id)
                session.commit()
                outcomes[email] = "won"
            except HelpError as exc:
                session.rollback()
                outcomes[email] = exc.code

    threads = [threading.Thread(target=attempt, args=(e,)) for e in HELPERS]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert sorted(outcomes.values()) == ["already_taken", "already_taken", "won"], outcomes
    assert sorted(responses(req_id).values()) == sorted(
        [HelpResponse.accepted, HelpResponse.superseded, HelpResponse.superseded])
    assert sum(a.action == "liquidity_request.claim" for a in audits(req_id)) == 1


def test_advisory_lock_leader_is_exclusive_and_survives_a_lost_connection(pg: Engine) -> None:
    other_engine = create_engine(str(PG))  # a second process, in effect
    first = Leader(pg, "help-scheduler", help_scheduler.LOCK_ID)
    second = Leader(other_engine, "help-scheduler", help_scheduler.LOCK_ID)
    try:
        assert first.acquire() and first.acquire()
        assert not second.acquire()
        assert first._conn is not None
        first._conn.invalidate()  # the leader's connection dies: Postgres frees the lock
        first._conn = None
        deadline = time.monotonic() + 5  # the server notices the closed socket at once
        while not second.acquire() and time.monotonic() < deadline:
            time.sleep(0.1)
        assert second.is_leader
        assert not first.acquire()
        second.release()
        assert first.acquire()
    finally:
        first.release()
        second.release()
        other_engine.dispose()


def test_duplicate_race_uses_a_savepoint_on_postgres(pg_client: TestClient,
                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    set_policy(pg_client, cooldown_min=0, daily_cap_per_agent=10)
    check_duplicate_race(monkeypatch)
