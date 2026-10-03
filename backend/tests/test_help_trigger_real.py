"""The trigger on the real trained forecast and synthetic data (no fake signals): each float
fires on its own, and an unanswered wave hands over to the next helpers. Slow: trained models.
The admin "simulate shortage" helper is the demo path (DEMO_MODE): it zeroes one agent's float.
"""

from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.models.enums import HelpResponse
from app.services import help_waves
from app.services.liquidity_requests import now_utc
from tests.auth_helpers import ADMIN, DIST_DHAKA, agent_id, bearer
from tests.help_helpers import (
    ADMIN_API,
    API,
    notes,
    request_row,
    responses,
    set_policy,
    set_trigger,
)

SIMULATE = f"{ADMIN_API}/simulate-shortage"
REQUESTER = "agent.mirpur@agentpulse.demo"  # AGT-0001


def _simulate(client: TestClient, float_type: str) -> dict[str, object]:
    res = client.post(SIMULATE, json={"agent_id": agent_id("AGT-0001"), "float_type": float_type},
                      headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    body: dict[str, object] = res.json()
    return body


@pytest.mark.slow
def test_each_float_fires_on_its_own(client: TestClient, ready: Path) -> None:
    set_policy(client, cooldown_min=0)
    cash = _simulate(client, "cash")
    emoney = _simulate(client, "emoney")
    [cash_id], [emoney_id] = cash["created_request_ids"], emoney["created_request_ids"]
    assert cash_id != emoney_id
    assert (request_row(cash_id).float_type.value, request_row(emoney_id).float_type.value) == (
        "cash", "emoney")
    mine = client.get(f"{API}/mine", headers=bearer(client, REQUESTER)).json()["items"]
    assert {(i["float_type"], i["status"]) for i in mine} == {("cash", "open"),
                                                             ("emoney", "open")}
    again = _simulate(client, "emoney")  # the same float again: deduplicated, nothing new
    assert again["created_request_ids"] == []
    assert again["plan"]["skipped"] == "active_request"  # type: ignore[index]


@pytest.mark.slow
def test_dry_run_simulation_says_nothing_was_sent(client: TestClient, ready: Path) -> None:
    set_policy(client, dry_run=True)
    body = _simulate(client, "cash")
    assert body["dry_run"] is True and body["sent"] is False
    assert body["created_request_ids"] == []
    would = body["would_create"]
    assert isinstance(would, list) and len(would) == 1 and would[0]["asks"]


DONOR = "agent.mirpur11@agentpulse.demo"  # AGT-0004, seed.HELPER_USERS


def _opt_out(client: TestClient, value: bool) -> None:
    res = client.put(f"{API}/opt-out", json={"opted_out": value}, headers=bearer(client, DONOR))
    assert res.status_code == 200, res.text


@pytest.mark.slow
def test_unanswered_wave_hands_over_to_the_next_helpers(client: TestClient, ready: Path) -> None:
    """In the small trained set the donor AGT-0004 is the only DST-DHK agent with surplus. It has
    help switched off when wave 1 goes out (only the distributor is asked), switches it back on,
    and wave 2 picks it up from the real forecast (its surplus covers the amount)."""
    set_trigger(client, wave_timeout_min=5, max_waves=2)
    _opt_out(client, True)
    rid = _simulate(client, "cash")["created_request_ids"][0]  # type: ignore[index]
    assert set(responses(rid)) == {DIST_DHAKA}
    _opt_out(client, False)

    later = now_utc() + timedelta(minutes=6)
    assert help_waves.advance_due(now_utc() + timedelta(minutes=1)) == (0, 0)  # not due yet
    assert help_waves.advance_due(later) == (1, 0)
    assert set(responses(rid)) == {DIST_DHAKA, DONOR} and request_row(rid).wave_number == 2
    assert notes(rid)[DONOR] == ["new"]
    assert "still_open" in notes(rid)[DIST_DHAKA] and "still_open" in notes(rid)[REQUESTER]
    assert all(r == HelpResponse.none for r in responses(rid).values())

    assert help_waves.advance_due(later + timedelta(minutes=6)) == (0, 1)  # no wave left
    assert request_row(rid).status.value == "expired"
    assert "escalated" in notes(rid)[ADMIN]
