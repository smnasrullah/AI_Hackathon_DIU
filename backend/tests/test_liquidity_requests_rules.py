"""Help request state machine, timeouts, anti-abuse limits, switches and concurrent claims."""

import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_engine
from app.models import AuditLog, LiquidityRequestRecipient, Notification, User
from app.models.enums import FloatType, HelpResponse, HelpStatus, NotificationType
from app.rules import help_request_rules as rules
from app.rules.help_request_rules import HelpPolicy
from app.services import liquidity_requests
from app.services.liquidity_requests import HelpError, now_utc
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.help_helpers import (
    ADMIN_API,
    AGENT_SUNAMGANJ,
    act,
    audits,
    make_request,
    notes,
    request_row,
    responses,
    set_policy,
)

HELPERS = [AGENT_PATIYA, AGENT_SUNAMGANJ, DIST_DHAKA]
T0 = datetime(2026, 10, 3, 9, 0, tzinfo=UTC)


def _sweep(minutes: float) -> tuple[int, int]:
    with Session(get_engine()) as session, session.begin():
        return liquidity_requests.sweep(session, now_utc() + timedelta(minutes=minutes))


def test_transition_table() -> None:
    H = HelpStatus
    allowed = {(e, s) for e, (frm, _) in rules.TRANSITIONS.items() for s in frm}
    assert allowed == {("claim", H.open), ("withdraw", H.claimed), ("reopen", H.claimed),
                       ("confirm", H.claimed), ("expire", H.open), ("exhaust", H.open),
                       ("cancel", H.open),
                       ("cancel", H.claimed)}
    for terminal in (H.fulfilled, H.expired, H.cancelled):
        assert not any(rules.can(e, terminal) for e in rules.TRANSITIONS)
    assert rules.target("withdraw") == rules.target("reopen") == H.open


def test_abuse_limits() -> None:
    policy = HelpPolicy(cooldown_min=30, daily_cap_per_agent=2)
    assert rules.abuse_block([], T0, policy) is None
    assert rules.abuse_block([T0 - timedelta(minutes=10)], T0, policy) == "cooldown"
    assert rules.abuse_block([T0 - timedelta(minutes=40)], T0, policy) is None
    two = [T0 - timedelta(hours=1), T0 - timedelta(hours=5)]
    assert rules.abuse_block(two, T0, policy) == "daily_cap"
    old = [T0 - timedelta(hours=25), T0 - timedelta(hours=30)]  # rolling 24 h
    assert rules.abuse_block(old, T0, policy) is None


def test_claim_timeout_reopens_and_notifies(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    act(client, req_id, "claim", AGENT_PATIYA)
    assert _sweep(minutes=5) == (0, 0)  # default timeout is 20 minutes
    assert _sweep(minutes=25) == (1, 0)
    assert _sweep(minutes=25) == (0, 0)  # safe to repeat
    row = request_row(req_id)
    assert (row.status, row.claimed_by_user_id) == (HelpStatus.open, None)
    assert responses(req_id) == {AGENT_PATIYA: HelpResponse.expired,
                                 AGENT_SUNAMGANJ: HelpResponse.none,
                                 DIST_DHAKA: HelpResponse.none}
    sent = notes(req_id)
    assert sent[AGENT_PATIYA][-1] == "claim_expired"
    assert sent[AGENT_SUNAMGANJ][-1] == "reopened" and sent[AGENT_MIRPUR][-1] == "reopened"
    reopen = [a for a in audits(req_id) if a.action == "liquidity_request.reopen"]
    assert len(reopen) == 1 and reopen[0].user_id is None
    assert (reopen[0].payload["old_status"], reopen[0].payload["new_status"]) == ("claimed",
                                                                                  "open")
    res = act(client, req_id, "claim", AGENT_PATIYA)  # the lapsed helper cannot grab it again
    assert (res.status_code, res.json()["detail"]) == (409, "already_responded")


def test_claim_on_a_lapsed_claim_reopens_it_first(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    act(client, req_id, "claim", AGENT_PATIYA)
    with Session(get_engine()) as session, session.begin():
        user = session.scalar(select(User).where(User.email == AGENT_SUNAMGANJ))
        assert user is not None
        item = liquidity_requests.claim(session, user, req_id,
                                        now=now_utc() + timedelta(minutes=30))
    assert item.status == HelpStatus.claimed and item.claimed_by_me


def test_open_request_expires_at_deadline(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS, hours=1)
    act(client, req_id, "decline", DIST_DHAKA)
    assert _sweep(minutes=61) == (0, 1)
    assert _sweep(minutes=61) == (0, 0)
    assert request_row(req_id).status == HelpStatus.expired
    assert responses(req_id)[AGENT_PATIYA] == HelpResponse.expired
    assert responses(req_id)[DIST_DHAKA] == HelpResponse.declined
    sent = notes(req_id)
    assert sent[AGENT_MIRPUR][-1] == "expired" and sent[AGENT_PATIYA][-1] == "expired"
    assert sent[DIST_DHAKA] == ["new"]


def test_lapsed_claim_past_deadline_expires_without_reopen_notice(client: TestClient,
                                                                  seeded: Path) -> None:
    req_id, _ = make_request(HELPERS, hours=0.25)
    act(client, req_id, "claim", AGENT_PATIYA)
    assert _sweep(minutes=30) == (1, 1)
    assert request_row(req_id).status == HelpStatus.expired
    assert "reopened" not in notes(req_id)[AGENT_SUNAMGANJ]


def test_sweep_endpoint_is_admin_only(client: TestClient, seeded: Path) -> None:
    res = client.post(f"{ADMIN_API}/sweep", headers=bearer(client, ADMIN))
    assert res.status_code == 200 and res.json() == {"reopened": 0, "expired": 0}
    assert client.post(f"{ADMIN_API}/sweep",
                       headers=bearer(client, DIST_DHAKA)).status_code == 403


def test_one_active_request_per_float_and_cooldown(client: TestClient, seeded: Path) -> None:
    first, created = make_request(HELPERS)
    assert created
    assert make_request(HELPERS) == (first, False)  # dedupe, even inside the cooldown
    with pytest.raises(HelpError, match="cooldown"):
        make_request(HELPERS, float_type=FloatType.emoney)
    act(client, first, "cancel", AGENT_MIRPUR)
    with pytest.raises(HelpError, match="cooldown"):
        make_request(HELPERS)


def test_daily_cap(client: TestClient, seeded: Path) -> None:
    set_policy(client, cooldown_min=0, daily_cap_per_agent=2)
    for _ in range(2):
        req_id, created = make_request(HELPERS)
        assert created
        act(client, req_id, "cancel", AGENT_MIRPUR)
    with pytest.raises(HelpError, match="daily_cap"):
        make_request(HELPERS)


def test_max_recipients_per_wave(client: TestClient, seeded: Path) -> None:
    set_policy(client, max_recipients_per_wave=1)
    req_id, _ = make_request(HELPERS)
    # The distributor is always in wave 1; agents fill up to the cap in ranked order.
    assert set(responses(req_id)) == {AGENT_PATIYA, DIST_DHAKA}


def test_kill_switch(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    body = set_policy(client, enabled=False)
    assert body["enabled"] is False and body["claim_timeout_min"] == 20
    with pytest.raises(HelpError, match="feature_disabled"):
        make_request(HELPERS, float_type=FloatType.emoney)
    res = act(client, req_id, "claim", AGENT_PATIYA)
    assert (res.status_code, res.json()["detail"]) == (409, "feature_disabled")
    assert act(client, req_id, "cancel", AGENT_MIRPUR).status_code == 200  # wind-down allowed
    with Session(get_engine()) as session:
        change = session.scalar(select(AuditLog).where(
            AuditLog.action == "help_settings.update").order_by(AuditLog.id.desc()))
        assert change is not None
        assert (change.payload["before"]["enabled"], change.payload["after"]["enabled"]) == (
            True, False)
    got = client.get(f"{ADMIN_API}/settings", headers=bearer(client, ADMIN)).json()
    assert got["enabled"] is False


def test_settings_are_validated(client: TestClient, seeded: Path) -> None:
    h = bearer(client, ADMIN)
    res = client.put(f"{ADMIN_API}/settings", json={"claim_timeout_min": 0}, headers=h)
    assert res.status_code == 422
    res = client.put(f"{ADMIN_API}/settings", json={"enabled": False},
                     headers=bearer(client, AGENT_MIRPUR))
    assert res.status_code == 403


def test_dry_run_records_but_sends_nothing(client: TestClient, seeded: Path) -> None:
    set_policy(client, dry_run=True, claim_timeout_min=5)
    req_id, _ = make_request(HELPERS)
    assert act(client, req_id, "claim", AGENT_PATIYA).status_code == 200
    assert _sweep(minutes=6) == (1, 0)
    assert notes(req_id) == {}
    with Session(get_engine()) as session:
        sent = session.scalar(select(func.count()).select_from(Notification).where(
            Notification.type == NotificationType.help_request))
        assert sent == 0
        notified = session.scalars(select(LiquidityRequestRecipient.notified_at).where(
            LiquidityRequestRecipient.request_id == req_id)).all()
        assert notified == [None, None, None]
    trail = audits(req_id)
    assert [a.action.split(".")[1] for a in trail] == ["create", "claim", "reopen"]
    assert all(a.payload["dry_run"] is True for a in trail)


def test_concurrent_claims_have_exactly_one_winner(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    # Own engine with a long lock wait: SQLite serialises the writers, Postgres row-locks them.
    engine = create_engine(get_settings().database_url,
                           connect_args={"timeout": 30, "check_same_thread": False})
    barrier = threading.Barrier(len(HELPERS))
    outcomes: dict[str, str] = {}

    def attempt(email: str) -> None:
        with Session(engine) as session:
            user = session.scalar(select(User).where(User.email == email))
            assert user is not None
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
    engine.dispose()
    assert sorted(outcomes.values()) == ["already_taken", "already_taken", "won"], outcomes
    winner = next(e for e, o in outcomes.items() if o == "won")
    assert sorted(responses(req_id).values()) == sorted(
        [HelpResponse.accepted, HelpResponse.superseded, HelpResponse.superseded])
    assert responses(req_id)[winner] == HelpResponse.accepted
    assert sum(a.action == "liquidity_request.claim" for a in audits(req_id)) == 1


def test_conditional_update_rejects_a_stale_claim(client: TestClient, seeded: Path) -> None:
    """A reads 'open', B claims and commits, then A's UPDATE ... WHERE status='open' hits 0 rows."""
    req_id, _ = make_request(HELPERS)
    with Session(get_engine()) as stale:
        req = stale.get(liquidity_requests.LiquidityRequest, req_id)
        assert req is not None and req.status == HelpStatus.open
        assert act(client, req_id, "claim", AGENT_SUNAMGANJ).status_code == 200
        assert req.status == HelpStatus.open  # A still holds the stale copy
        now = now_utc()
        old = liquidity_requests._move(stale, req, "claim", now, claimed_at=now)
        assert old is None and req.status == HelpStatus.claimed
        stale.rollback()
