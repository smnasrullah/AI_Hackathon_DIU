from pathlib import Path

from fastapi.testclient import TestClient

from tests.auth_helpers import AGENT_MIRPUR, login, password_for, post_refresh, refresh_cookie

API = "/api/v1"
NEW = "brand-new-pw-123"


def _change(client: TestClient, access: str, cookie: str, old: str, new: str) -> int:
    res = client.post(
        f"{API}/auth/change-password",
        json={"old_password": old, "new_password": new},
        headers={"Authorization": f"Bearer {access}", "Cookie": f"ap_refresh={cookie}"},
    )
    return res.status_code


def test_change_password_revokes_other_sessions(client: TestClient, seeded: Path) -> None:
    login(client, AGENT_MIRPUR)
    other = refresh_cookie(client)
    current = login(client, AGENT_MIRPUR)
    mine = refresh_cookie(client)

    res = client.post(
        f"{API}/auth/change-password",
        json={"old_password": password_for(AGENT_MIRPUR), "new_password": NEW},
        headers={
            "Authorization": f"Bearer {current['access_token']}",
            "Cookie": f"ap_refresh={mine}",
        },
    )
    assert res.status_code == 200
    assert res.json()["other_sessions_revoked"] == 1
    assert post_refresh(client, other).status_code == 401
    assert post_refresh(client, mine).status_code == 200

    old_login = {"email": AGENT_MIRPUR, "password": password_for(AGENT_MIRPUR)}
    assert client.post(f"{API}/auth/login", json=old_login).status_code == 401
    new_login = {"email": AGENT_MIRPUR, "password": NEW}
    assert client.post(f"{API}/auth/login", json=new_login).status_code == 200


def test_wrong_old_password_rejected(client: TestClient, seeded: Path) -> None:
    access = str(login(client, AGENT_MIRPUR)["access_token"])
    res = client.post(
        f"{API}/auth/change-password",
        json={"old_password": "not-it-at-all", "new_password": NEW},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "wrong_password"


def test_new_password_min_length(client: TestClient, seeded: Path) -> None:
    access = str(login(client, AGENT_MIRPUR)["access_token"])
    cookie = refresh_cookie(client)
    assert _change(client, access, cookie, password_for(AGENT_MIRPUR), "short7!") == 422


def test_same_password_rejected(client: TestClient, seeded: Path) -> None:
    access = str(login(client, AGENT_MIRPUR)["access_token"])
    cookie = refresh_cookie(client)
    old = password_for(AGENT_MIRPUR)
    assert _change(client, access, cookie, old, old) == 400


def test_change_password_requires_auth(client: TestClient, seeded: Path) -> None:
    res = client.post(
        f"{API}/auth/change-password", json={"old_password": "a", "new_password": NEW}
    )
    assert res.status_code == 401
