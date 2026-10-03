"""Late delivery after a timed-out claim, distributor cancel rights, wave counters (distributors
only) and the agent's own opt-out preference."""

from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Agent
from app.models.enums import FloatType, HelpResponse
from app.services import liquidity_requests
from app.services.liquidity_requests import now_utc
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.help_helpers import (
    ADMIN_API,
    AGENT_SUNAMGANJ,
    API,
    DIST_CTG,
    act,
    audits,
    make_request,
    notes,
    request_row,
    responses,
    set_policy,
    set_trigger,
    user_id,
)

HELPERS = [AGENT_PATIYA, AGENT_SUNAMGANJ, DIST_DHAKA]
WAVE_KEYS = {"wave_number", "max_waves", "is_last_wave"}
OPT_OUT = f"{API}/opt-out"


def _lapse_claim(client: TestClient, req_id: int, helper: str) -> None:
    """`helper` claims, then the claim times out (20 min) and the sweep reopens the request."""
    assert act(client, req_id, "claim", helper).status_code == 200
    with Session(get_engine()) as s, s.begin():
        assert liquidity_requests.sweep(s, now_utc() + timedelta(minutes=25)) == (1, 0)
    assert request_row(req_id).status.value == "open"


def test_late_delivery_records_the_lapsed_helper(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    _lapse_claim(client, req_id, AGENT_PATIYA)
    owner = client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_MIRPUR)).json()
    assert owner["can_confirm_late"] is True

    for outsider in (AGENT_SUNAMGANJ, AGENT_PATIYA, DIST_CTG):  # helpers, other distributor
        assert act(client, req_id, "confirm-late", outsider).status_code == 403, outsider
    assert act(client, req_id, "confirm-late", ADMIN).status_code == 403  # role gate

    done = act(client, req_id, "confirm-late", AGENT_MIRPUR, {"note": "arrived 10 min late"})
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "fulfilled" and body["claimed_by"]["display"] == "AGT-0002"
    assert body["can_confirm_late"] is False
    assert responses(req_id) == {AGENT_PATIYA: HelpResponse.accepted,
                                 AGENT_SUNAMGANJ: HelpResponse.superseded,
                                 DIST_DHAKA: HelpResponse.superseded}
    told = notes(req_id)
    assert told[AGENT_PATIYA][-1] == "fulfilled_late"  # the helper hears it counted
    assert "covered" in told[AGENT_SUNAMGANJ]  # the others hear it is covered
    assert "fulfilled_late" in told[DIST_DHAKA]  # the distributor is told too
    assert "fulfilled_late" not in told.get(AGENT_MIRPUR, [])  # never the actor
    last = audits(req_id)[-1]
    assert last.action == "liquidity_request.confirm_late"
    assert last.user_id == user_id(AGENT_MIRPUR) and last.note == "arrived 10 min late"
    assert last.payload["old_status"] == "open" and last.payload["new_status"] == "fulfilled"
    assert last.payload["late_helper"] == str(user_id(AGENT_PATIYA))
    again = act(client, req_id, "confirm-late", AGENT_MIRPUR)  # repeat: same result
    assert again.status_code == 200 and again.json()["status"] == "fulfilled"


def test_late_delivery_needs_a_previous_claim(client: TestClient, seeded: Path) -> None:
    set_policy(client, cooldown_min=0)
    fresh, _ = make_request(HELPERS)
    res = act(client, fresh, "confirm-late", AGENT_MIRPUR)
    assert (res.status_code, res.json()["detail"]) == (409, "no_lapsed_claim")
    assert client.get(f"{API}/{fresh}",
                      headers=bearer(client, AGENT_MIRPUR)).json()["can_confirm_late"] is False

    withdrawn, _ = make_request(HELPERS, float_type=FloatType.emoney)
    act(client, withdrawn, "claim", AGENT_PATIYA)
    act(client, withdrawn, "withdraw", AGENT_PATIYA)  # backing out is not a lapsed claim
    res = act(client, withdrawn, "confirm-late", AGENT_MIRPUR)
    assert (res.status_code, res.json()["detail"]) == (409, "no_lapsed_claim")


def test_distributor_may_confirm_late_but_not_while_someone_else_holds_it(
        client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    _lapse_claim(client, req_id, AGENT_PATIYA)
    assert act(client, req_id, "claim", AGENT_SUNAMGANJ).status_code == 200  # a new helper
    res = act(client, req_id, "confirm-late", DIST_DHAKA)
    assert (res.status_code, res.json()["detail"]) == (409, "invalid_transition")
    act(client, req_id, "withdraw", AGENT_SUNAMGANJ)  # open again; Patiya's lapse remains
    ok = act(client, req_id, "confirm-late", DIST_DHAKA)
    assert ok.status_code == 200 and ok.json()["claimed_by"]["display"] == "AGT-0002"


def test_distributor_cancel_rights(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    assert act(client, req_id, "cancel", DIST_CTG).status_code == 403  # another distributor
    assert act(client, req_id, "cancel", AGENT_PATIYA).status_code == 403  # not the requester
    assert request_row(req_id).status.value == "open"
    res = act(client, req_id, "cancel", DIST_DHAKA, {"note": "sent the van instead"})
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    last = audits(req_id)[-1]
    assert last.action == "liquidity_request.cancel"
    assert last.user_id == user_id(DIST_DHAKA) and last.note == "sent the van instead"
    assert (last.payload["old_status"], last.payload["new_status"]) == ("open", "cancelled")
    assert last.payload["actor_role"] == "distributor"
    assert "cancelled" in notes(req_id)[AGENT_MIRPUR]


def test_wave_counters_reach_distributors_and_admins_only(client: TestClient,
                                                          seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    for who, url in ((DIST_DHAKA, f"{API}/{req_id}"), (ADMIN, f"{API}/{req_id}")):
        body = client.get(url, headers=bearer(client, who)).json()
        assert (body["wave_number"], body["max_waves"], body["is_last_wave"]) == (1, 3, False)
    listed = client.get(f"{API}/mine", headers=bearer(client, DIST_DHAKA)).json()["items"][0]
    assert set(listed) >= WAVE_KEYS
    admin_list = client.get(ADMIN_API, headers=bearer(client, ADMIN)).json()["items"][0]
    assert set(admin_list) >= WAVE_KEYS

    hidden = [client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_MIRPUR)).json(),
              client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_PATIYA)).json(),
              client.get(f"{API}/mine", headers=bearer(client, AGENT_MIRPUR)).json()["items"][0],
              client.get(f"{API}/inbox", headers=bearer(client, AGENT_PATIYA)).json()["items"][0],
              act(client, req_id, "decline", AGENT_SUNAMGANJ).json()]
    for body in hidden:  # the requester agent and every helper: not even the keys
        assert WAVE_KEYS & set(body) == set(), body

    set_trigger(client, max_waves=1)
    body = client.get(f"{API}/{req_id}", headers=bearer(client, DIST_DHAKA)).json()
    assert (body["max_waves"], body["is_last_wave"]) == (1, True)


def test_agent_reads_and_changes_only_their_own_opt_out(client: TestClient,
                                                        seeded: Path) -> None:
    assert client.get(OPT_OUT, headers=bearer(client, AGENT_PATIYA)).json() == {
        "opted_out": False}
    res = client.put(OPT_OUT, json={"opted_out": True}, headers=bearer(client, AGENT_PATIYA))
    assert res.status_code == 200 and res.json() == {"opted_out": True}
    assert client.get(OPT_OUT, headers=bearer(client, AGENT_PATIYA)).json()["opted_out"] is True
    assert client.get(OPT_OUT, headers=bearer(client, AGENT_MIRPUR)).json()["opted_out"] is False
    with Session(get_engine()) as s:
        flags = dict(s.execute(select(Agent.code, Agent.help_opt_out)).tuples().all())
    assert flags == {"AGT-0001": False, "AGT-0002": True, "AGT-0003": False}

    for other in (DIST_DHAKA, ADMIN):  # no agent of their own: nothing to read or change
        assert client.get(OPT_OUT, headers=bearer(client, other)).status_code == 403
        assert client.put(OPT_OUT, json={"opted_out": True},
                          headers=bearer(client, other)).status_code == 403
    assert client.put(OPT_OUT, json={"opted_out": "maybe"},
                      headers=bearer(client, AGENT_PATIYA)).status_code == 422
    assert client.put(OPT_OUT, json={"opted_out": False}).status_code == 401
