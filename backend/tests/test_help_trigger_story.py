"""End to end, with the trained forecast: shortage detected, request sent, first claim wins,
the others are told, the requester confirms, the request is fulfilled.
Slow: needs trained models."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.services import help_trigger_run
from app.services.liquidity_requests import now_utc
from tests.auth_helpers import ADMIN, agent_id, bearer
from tests.help_helpers import ADMIN_API, API, act, notes, responses

REQUESTER = "agent.mirpur@agentpulse.demo"  # AGT-0001


@pytest.mark.slow
def test_shortage_to_fulfilled(client: TestClient, ready: Path) -> None:
    sim = client.post(f"{ADMIN_API}/simulate-shortage",
                      json={"agent_id": agent_id("AGT-0001"), "float_type": "cash"},
                      headers=bearer(client, ADMIN))
    assert sim.status_code == 200, sim.text
    body = sim.json()
    assert body["simulated"] is True and body["plan"]["simulated"] is True
    assert body["plan"]["reason_summary"].startswith("[SIMULATED]")
    req_id = body["created_request_ids"][0]  # the trigger fired and sent a request

    helpers = sorted(responses(req_id))
    assert len(helpers) >= 2, "need at least two helpers to show who loses"
    first, rest = helpers[0], helpers[1:]

    mine = client.get(f"{API}/mine", headers=bearer(client, REQUESTER)).json()
    assert req_id in [i["id"] for i in mine["items"]]
    assert client.get(f"{API}/{req_id}",
                      headers=bearer(client, first)).json()["view"] == "recipient"

    won = act(client, req_id, "claim", first)
    assert won.status_code == 200 and won.json()["status"] == "claimed"
    for other in rest:
        lost = act(client, req_id, "claim", other)
        assert (lost.status_code, lost.json()["detail"]) == (409, "already_taken")

    assert "covered" in notes(req_id)[rest[0]]  # the others hear it is covered
    assert "claimed" in notes(req_id)[REQUESTER]  # the requester hears who will help

    done = act(client, req_id, "confirm", REQUESTER)
    assert done.status_code == 200 and done.json()["status"] == "fulfilled"
    assert "fulfilled" in notes(req_id)[first]  # the helper hears it was received
    assert "fulfilled" not in notes(req_id)[REQUESTER]  # never told of their own action

    again = help_trigger_run.run_trigger(now_utc())  # next tick: no duplicate for this agent
    assert again.created == []
