"""PATCH /users/me/preferences (all fields) and GET/PATCH /users/me/profile (no real PII)."""

from pathlib import Path

from fastapi.testclient import TestClient

from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, agent_id, bearer

API = "/api/v1/users/me"


def test_preferences_update_only_sent_fields(client: TestClient, seeded: Path) -> None:
    h = bearer(client, AGENT_MIRPUR)
    res = client.patch(f"{API}/preferences", json={
        "language": "en", "theme": "dark", "digits": "en", "notify_in_app": False,
        "tour_done": True}, headers=h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["lang"], body["theme"], body["digits"]) == ("en", "dark", "en")
    assert (body["notify_in_app"], body["tour_done"]) == (False, True)
    res = client.patch(f"{API}/preferences", json={"theme": "system"}, headers=h)
    assert (res.json()["theme"], res.json()["lang"], res.json()["tour_done"]) == (
        "system", "en", True)
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert (me["digits"], me["notify_in_app"]) == ("en", False)


def test_preferences_reject_bad_input(client: TestClient, seeded: Path) -> None:
    h = bearer(client, AGENT_MIRPUR)
    for bad in ({}, {"theme": None}, {"theme": "neon"}, {"digits": "ar"},
                {"notify_in_app": "sometimes"}, {"role": "admin"}):
        assert client.patch(f"{API}/preferences", json=bad, headers=h).status_code == 422, bad
    assert client.patch(f"{API}/preferences", json={"theme": "dark"}).status_code == 401


def test_profile_links_role_scope(client: TestClient, seeded: Path) -> None:
    agent = client.get(f"{API}/profile", headers=bearer(client, AGENT_MIRPUR)).json()
    assert (agent["role"], agent["display_name"], agent["avatar_color"]) == (
        "agent", "Mirpur Agent", None)
    assert agent["agent"] == {"id": agent_id("AGT-0001"), "code": "AGT-0001",
                              "name": "Mirpur 10 Mobile Point"}
    assert agent["distributor"]["code"] == "DST-DHK" and agent["last_login_at"]
    dist = client.get(f"{API}/profile", headers=bearer(client, DIST_DHAKA)).json()
    assert dist["agent"] is None and dist["distributor"]["code"] == "DST-DHK"
    admin = client.get(f"{API}/profile", headers=bearer(client, ADMIN)).json()
    assert admin["agent"] is None and admin["distributor"] is None
    assert client.get(f"{API}/profile").status_code == 401


def test_profile_update(client: TestClient, seeded: Path) -> None:
    h = bearer(client, DIST_DHAKA)
    res = client.patch(f"{API}/profile", json={"display_name": "  Rahim Bhai ",
                                               "avatar_color": "teal"}, headers=h)
    assert res.status_code == 200, res.text
    assert (res.json()["display_name"], res.json()["avatar_color"]) == ("Rahim Bhai", "teal")
    res = client.patch(f"{API}/profile", json={"avatar_color": "rose"}, headers=h)
    assert (res.json()["display_name"], res.json()["avatar_color"]) == ("Rahim Bhai", "rose")
    assert client.get(f"{API}/profile", headers=h).json()["display_name"] == "Rahim Bhai"
    assert client.get("/api/v1/auth/me", headers=h).json()["avatar_color"] == "rose"


def test_profile_refuses_pii_and_bad_values(client: TestClient, seeded: Path) -> None:
    h = bearer(client, AGENT_MIRPUR)
    for bad in ({}, {"display_name": "me@example.com"}, {"display_name": "Call 01712345678"},
                {"display_name": "০১৭১২৩৪৫৬৭৮"}, {"display_name": "017-1234-5678"},
                {"display_name": "   "}, {"display_name": "x" * 41},
                {"display_name": "line\nbreak"}, {"avatar_color": "#ff0000"},
                {"email": "new@example.com"}):
        assert client.patch(f"{API}/profile", json=bad, headers=h).status_code == 422, bad
    ok = client.patch(f"{API}/profile", json={"display_name": "Shop 10"}, headers=h)
    assert ok.status_code == 200  # short numbers are fine
