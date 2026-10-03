"""The help scheduler: waits for bootstrap, only the leader acts, the claim-timeout sweep runs on
schedule without anyone calling the admin endpoint, and its status shows on the admin overview.
Postgres leader election: tests/test_help_postgres.py."""

import time
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core import clock
from app.core.config import get_settings
from app.core.db import get_engine
from app.core.leader import Leader
from app.services import help_scheduler, help_trigger_run
from tests.auth_helpers import ADMIN, AGENT_PATIYA, bearer
from tests.help_helpers import act, make_request, request_row
from tests.test_help_clock import T0, FakeClock

OVERVIEW = "/api/v1/admin/overview"


@pytest.fixture(autouse=True)
def fresh_process(monkeypatch: pytest.MonkeyPatch) -> None:
    """Each test is a newly started process; no DEMO_MODE start delay unless a test sets one."""
    monkeypatch.setattr(help_scheduler, "_start", {"ticked": False})
    monkeypatch.setenv("HELP_SCHEDULER_DEMO_START_DELAY_S", "0")
    get_settings.cache_clear()


def _ready() -> None:
    get_settings().bootstrap_state_file.write_text("ready", encoding="utf-8")


def _leader() -> Leader:
    return Leader(get_engine(), "help-scheduler", help_scheduler.LOCK_ID)


def test_file_lock_leader_is_exclusive_and_handed_over(client: TestClient, seeded: Path) -> None:
    first, second = _leader(), _leader()
    try:
        assert first.acquire() is True and first.acquire() is True  # keeps it
        assert second.acquire() is False
        first.release()
        assert second.acquire() is True and second.is_leader
        assert first.acquire() is False
    finally:
        first.release()
        second.release()


def test_waits_for_bootstrap_then_only_the_leader_ticks(client: TestClient, seeded: Path) -> None:
    get_settings().bootstrap_state_file.write_text("precomputing", encoding="utf-8")
    mine, other = _leader(), _leader()
    try:
        assert help_scheduler.run_once(mine, 60) == "waiting"
        _ready()
        assert other.acquire()  # another worker leads
        assert help_scheduler.run_once(mine, 60) == "standby"
        assert client.get(OVERVIEW, headers=bearer(client, ADMIN)).json()["help_scheduler"] \
            is None  # nobody has ticked yet
        other.release()
        assert help_scheduler.run_once(mine, 60) == "ran"
    finally:
        mine.release()
        other.release()


def test_sweep_releases_a_timed_out_claim_on_schedule(client: TestClient, seeded: Path,
                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    _ready()
    fake = FakeClock(T0)
    monkeypatch.setattr(clock, "_source", fake)
    req_id, _ = make_request([AGENT_PATIYA])
    assert act(client, req_id, "claim", AGENT_PATIYA).status_code == 200
    leader = _leader()
    try:
        fake.now = T0 + timedelta(minutes=21)  # past the 20 min claim timeout
        assert help_scheduler.run_once(leader, 60) == "ran"
    finally:
        leader.release()
    assert request_row(req_id).status.value == "open"
    status = client.get(OVERVIEW, headers=bearer(client, ADMIN)).json()["help_scheduler"]
    assert status["last_result"]["reopened"] == 1 and status["last_error"] is None
    assert status["last_run_at"] == "2026-10-03T09:21:00Z"
    assert status["next_run_at"] == "2026-10-03T09:22:00Z" and status["interval_s"] == 60
    assert status["leader"] and status["stale"] is False


def test_a_failed_tick_is_recorded_and_the_loop_goes_on(client: TestClient, seeded: Path,
                                                       monkeypatch: pytest.MonkeyPatch) -> None:
    _ready()

    def boom(now: object = None) -> dict[str, int]:
        raise RuntimeError("database went away")

    monkeypatch.setattr(help_trigger_run, "tick", boom)
    leader = _leader()
    try:
        assert help_scheduler.run_once(leader, 60) == "failed"
    finally:
        leader.release()
    status = client.get(OVERVIEW, headers=bearer(client, ADMIN)).json()["help_scheduler"]
    assert status["last_error"] == "RuntimeError: database went away"
    assert status["last_result"] is None


def test_the_background_thread_ticks_by_itself(client: TestClient, seeded: Path) -> None:
    _ready()
    help_scheduler.start(1)
    try:
        deadline = time.monotonic() + 20
        status = None
        while status is None and time.monotonic() < deadline:
            time.sleep(0.2)
            status = client.get(OVERVIEW, headers=bearer(client, ADMIN)).json()["help_scheduler"]
    finally:
        help_scheduler.stop()
    assert status is not None and status["last_result"] is not None
    assert set(status["last_result"]) == {"reopened", "expired", "waves_advanced",
                                          "waves_exhausted", "requests_created"}
