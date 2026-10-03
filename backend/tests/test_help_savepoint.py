"""create()'s duplicate race: the losing insert rolls back only a savepoint, so the caller's own
writes in the same transaction survive (commit) or vanish (rollback) as the caller decides; and
a winning create() inside a caller's transaction is undone when the caller rolls back (on
SQLite the savepoint must not commit the outer transaction). Same checks on Postgres in
tests/test_help_postgres.py."""

from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import AuditLog, LiquidityRequest, LiquidityRequestRecipient
from app.models.enums import FloatType, HelpOrigin, HelpStatus
from app.services import liquidity_requests
from app.services.liquidity_requests import Candidate, create, now_utc
from tests.auth_helpers import AGENT_PATIYA, agent_id
from tests.help_helpers import make_request, set_policy, user_id

ACTIVE = (HelpStatus.open, HelpStatus.claimed)


def _create(s: Session) -> tuple[LiquidityRequest, bool]:
    return create(s, requester_agent_id=agent_id("AGT-0001"), float_type=FloatType.cash,
                  amount_needed=Decimal("9000"), needed_by=now_utc() + timedelta(hours=2),
                  candidates=[Candidate(user_id(AGENT_PATIYA), 1.0)],
                  created_by=HelpOrigin.system)


def _count(model: Any, *where: Any) -> int:
    with Session(get_engine()) as s:
        return s.scalar(select(func.count()).select_from(model).where(*where)) or 0


def _end_all() -> None:
    with Session(get_engine()) as s, s.begin():
        s.execute(update(LiquidityRequest).values(status=HelpStatus.cancelled))


def _lose_the_race(monkeypatch: pytest.MonkeyPatch, outer_commits: bool) -> None:
    """Another writer already made the active request; this writer's dedupe check ran before
    that insert was visible (simulated), so its own insert hits the unique index."""
    first, _ = make_request([AGENT_PATIYA])
    real = liquidity_requests.active_for
    calls: list[str] = []

    def stale_then_real(session: Session, key: str) -> LiquidityRequest | None:
        calls.append(key)
        return None if len(calls) == 1 else real(session, key)

    marker = f"outer-write-{outer_commits}"
    monkeypatch.setattr(liquidity_requests, "active_for", stale_then_real)
    try:
        with Session(get_engine()) as s:
            s.begin()
            s.add(AuditLog(user_id=None, action="test.outer", entity_type="test",
                           entity_id=marker, note=None, payload={}))
            s.flush()  # the caller's own write, before create()
            req, created = _create(s)
            assert (req.id, created) == (first, False)  # the winner's request comes back
            s.flush()  # the session is still usable
            if outer_commits:
                s.commit()
            else:
                s.rollback()
    finally:
        monkeypatch.setattr(liquidity_requests, "active_for", real)
    assert _count(AuditLog, AuditLog.entity_id == marker) == (1 if outer_commits else 0)
    assert _count(LiquidityRequest, LiquidityRequest.status.in_(ACTIVE)) == 1
    asked = _count(LiquidityRequestRecipient, LiquidityRequestRecipient.request_id == first)
    assert asked == 1  # the loser wrote no recipients
    _end_all()


def _winner_follows_the_callers_rollback() -> None:
    """Only reads before create(): on SQLite the savepoint would otherwise open (and its
    RELEASE commit) the transaction, leaving the request behind after the caller's rollback."""
    before = _count(LiquidityRequest)
    with Session(get_engine()) as s:
        s.begin()
        _, created = _create(s)
        assert created
        s.rollback()
    assert _count(LiquidityRequest) == before


def check_duplicate_race(monkeypatch: pytest.MonkeyPatch) -> None:
    _lose_the_race(monkeypatch, outer_commits=True)
    _lose_the_race(monkeypatch, outer_commits=False)
    _winner_follows_the_callers_rollback()


def test_duplicate_race_rolls_back_only_a_savepoint(client: TestClient, seeded: Path,
                                                   monkeypatch: pytest.MonkeyPatch) -> None:
    set_policy(client, cooldown_min=0, daily_cap_per_agent=10)
    check_duplicate_race(monkeypatch)
