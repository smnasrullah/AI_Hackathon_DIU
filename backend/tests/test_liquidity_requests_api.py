"""Help request flows over the API: claim, decline, withdraw, confirm, cancel, views, scope."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.models.enums import FloatType, HelpResponse
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.help_helpers import (
    ADMIN_API,
    AGENT_SUNAMGANJ,
    API,
    DIST_CTG,
    DIST_SYL,
    REASON,
    act,
    audits,
    make_request,
    notes,
    request_row,
    responses,
    set_policy,
)

HELPERS = [AGENT_PATIYA, AGENT_SUNAMGANJ, DIST_DHAKA]


def test_create_notifies_recipients_and_requester(client: TestClient, seeded: Path) -> None:
    req_id, created = make_request(HELPERS + [AGENT_MIRPUR])  # own user is never a helper
    assert created
    assert set(responses(req_id)) == set(HELPERS)
    sent = notes(req_id)
    assert {e: sent[e] for e in HELPERS} == {e: ["new"] for e in HELPERS}
    assert sent[AGENT_MIRPUR] == ["created"]
    (row,) = audits(req_id)
    assert (row.action, row.user_id) == ("liquidity_request.create", None)
    assert (row.payload["old_status"], row.payload["new_status"]) == (None, "open")


def test_first_claim_wins_and_others_are_superseded(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    first = act(client, req_id, "claim", AGENT_PATIYA)
    assert first.status_code == 200, first.text
    body = first.json()
    assert (body["status"], body["claimed_by_me"], body["view"]) == ("claimed", True, "recipient")
    late = act(client, req_id, "claim", AGENT_SUNAMGANJ)
    assert (late.status_code, late.json()["detail"]) == (409, "already_taken")
    again = act(client, req_id, "claim", AGENT_PATIYA)  # idempotent for the winner
    assert again.status_code == 200 and again.json()["claimed_at"] == body["claimed_at"]
    assert responses(req_id) == {AGENT_PATIYA: HelpResponse.accepted,
                                 AGENT_SUNAMGANJ: HelpResponse.superseded,
                                 DIST_DHAKA: HelpResponse.superseded}
    sent = notes(req_id)
    assert sent[AGENT_SUNAMGANJ] == ["new", "covered"] and sent[DIST_DHAKA] == ["new", "covered"]
    assert sent[AGENT_PATIYA] == ["new"]
    assert sent[AGENT_MIRPUR] == ["created", "claimed"]
    claims = [a for a in audits(req_id) if a.action == "liquidity_request.claim"]
    assert len(claims) == 1
    assert (claims[0].payload["old_status"], claims[0].payload["new_status"]) == ("open",
                                                                                  "claimed")


def test_recipients_never_see_the_helper_or_the_reason(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    act(client, req_id, "claim", AGENT_PATIYA)
    other = client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_SUNAMGANJ)).json()
    assert other["view"] == "recipient" and other["claimed_by_me"] is False
    assert other["claimed_by"] is None and other["recipients"] is None
    assert other["reason_summary"] is None and other["my_response"] == "superseded"
    assert (other["requester"]["code"], other["requester"]["upazila"]) == ("AGT-0001", "Mirpur")
    inbox = client.get(f"{API}/inbox", headers=bearer(client, AGENT_SUNAMGANJ))
    assert inbox.status_code == 200 and inbox.json()["total"] == 1
    assert "AGT-0002" not in inbox.text and REASON not in inbox.text
    owner = client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_MIRPUR)).json()
    assert owner["view"] == "owner" and owner["reason_summary"] == REASON
    assert owner["claimed_by"]["display"] == "AGT-0002"
    assert {r["display"] for r in owner["recipients"]} == {"AGT-0002", "AGT-0003", "DST-DHK"}
    assert "@" not in str(owner["recipients"])


def test_scope_and_role_rules(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    assert act(client, req_id, "claim", DIST_CTG).status_code == 403  # not a listed recipient
    assert client.get(f"{API}/{req_id}", headers=bearer(client, DIST_SYL)).status_code == 403
    assert client.get(f"{API}/999999", headers=bearer(client, AGENT_MIRPUR)).status_code == 403
    assert act(client, req_id, "cancel", AGENT_PATIYA).status_code == 403  # not the requester
    # Distributors may cancel only their own agents' requests (test_distributor_cancel_rights).
    assert act(client, req_id, "cancel", DIST_CTG).status_code == 403
    assert act(client, req_id, "decline", ADMIN).status_code == 403  # role gate
    act(client, req_id, "claim", AGENT_PATIYA)
    assert act(client, req_id, "confirm", AGENT_PATIYA).status_code == 403  # helper cannot
    assert act(client, req_id, "confirm", DIST_CTG).status_code == 403
    mine = client.get(f"{API}/mine", headers=bearer(client, DIST_DHAKA)).json()
    assert [i["id"] for i in mine["items"]] == [req_id]  # requests from own agents
    assert client.get(f"{API}/mine", headers=bearer(client, AGENT_PATIYA)).json()["total"] == 0
    everyone = client.get(ADMIN_API, headers=bearer(client, ADMIN))
    assert everyone.status_code == 200 and everyone.json()["items"][0]["view"] == "owner"


def test_invalid_transitions_are_409(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    res = act(client, req_id, "confirm", AGENT_MIRPUR)  # nothing claimed yet
    assert (res.status_code, res.json()["detail"]) == (409, "invalid_transition")
    res = act(client, req_id, "withdraw", AGENT_PATIYA)
    assert (res.status_code, res.json()["detail"]) == (409, "not_claimant")
    act(client, req_id, "claim", AGENT_PATIYA)
    assert act(client, req_id, "confirm", AGENT_MIRPUR).status_code == 200
    res = act(client, req_id, "cancel", AGENT_MIRPUR)
    assert (res.status_code, res.json()["detail"]) == (409, "invalid_transition")
    res = act(client, req_id, "claim", AGENT_SUNAMGANJ)
    assert (res.status_code, res.json()["detail"]) == (409, "invalid_transition")


def test_decline_affects_only_the_caller(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    res = act(client, req_id, "decline", AGENT_SUNAMGANJ, {"note": "No cash spare today"})
    assert res.status_code == 200 and res.json()["my_response"] == "declined"
    assert act(client, req_id, "decline", AGENT_SUNAMGANJ).status_code == 200  # idempotent
    assert request_row(req_id).status == "open"
    assert responses(req_id)[AGENT_PATIYA] == HelpResponse.none
    res = act(client, req_id, "claim", AGENT_SUNAMGANJ)
    assert (res.status_code, res.json()["detail"]) == (409, "already_responded")
    assert notes(req_id)[AGENT_PATIYA] == ["new"]
    assert sum(a.action == "liquidity_request.decline" for a in audits(req_id)) == 1


def test_withdraw_reopens_for_the_others(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    act(client, req_id, "decline", DIST_DHAKA)
    act(client, req_id, "claim", AGENT_PATIYA)
    res = act(client, req_id, "withdraw", AGENT_PATIYA)
    assert res.status_code == 200 and res.json()["status"] == "open"
    assert act(client, req_id, "withdraw", AGENT_PATIYA).status_code == 200  # idempotent
    assert responses(req_id) == {AGENT_PATIYA: HelpResponse.declined,
                                 AGENT_SUNAMGANJ: HelpResponse.none,
                                 DIST_DHAKA: HelpResponse.declined}
    sent = notes(req_id)
    assert sent[AGENT_SUNAMGANJ] == ["new", "covered", "reopened"]
    assert sent[DIST_DHAKA] == ["new"]  # declined before the claim: not asked again
    assert sent[AGENT_MIRPUR][-1] == "reopened"
    row = request_row(req_id)
    assert row.claimed_by_user_id is None and row.claim_expires_at is None
    res = act(client, req_id, "claim", AGENT_PATIYA)
    assert (res.status_code, res.json()["detail"]) == (409, "already_responded")
    assert act(client, req_id, "claim", AGENT_SUNAMGANJ).status_code == 200


def test_confirm_by_requester_or_distributor(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    act(client, req_id, "claim", AGENT_PATIYA)
    res = act(client, req_id, "confirm", DIST_DHAKA, {"note": "Agent called to confirm"})
    assert res.status_code == 200 and res.json()["status"] == "fulfilled"
    assert res.json()["fulfilled_at"] is not None
    assert act(client, req_id, "confirm", AGENT_MIRPUR).status_code == 200  # idempotent
    sent = notes(req_id)
    assert sent[AGENT_PATIYA][-1] == "fulfilled" and sent[AGENT_MIRPUR][-1] == "fulfilled"
    assert "fulfilled" not in sent[AGENT_SUNAMGANJ]
    confirms = [a for a in audits(req_id) if a.action == "liquidity_request.confirm"]
    assert len(confirms) == 1 and confirms[0].note == "Agent called to confirm"


def test_cancel_by_requester_and_admin(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request(HELPERS)
    act(client, req_id, "decline", AGENT_SUNAMGANJ)
    res = act(client, req_id, "cancel", AGENT_MIRPUR)
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert act(client, req_id, "cancel", AGENT_MIRPUR).status_code == 200  # idempotent
    sent = notes(req_id)
    assert sent[AGENT_PATIYA][-1] == "cancelled" and sent[AGENT_SUNAMGANJ] == ["new"]
    set_policy(client, cooldown_min=0)
    other_id, created = make_request(HELPERS, float_type=FloatType.emoney)
    assert created
    act(client, other_id, "claim", AGENT_PATIYA)
    res = act(client, other_id, "cancel", ADMIN)
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    actions = [(a.action, a.payload["old_status"]) for a in audits(other_id)]
    assert actions[-1] == ("liquidity_request.cancel", "claimed")
