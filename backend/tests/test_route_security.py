"""Route sweep over the live app: every endpoint needs a token unless listed public, every role
gate refuses the other roles, and every {agent_id} route refuses out-of-scope agents."""

import re
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.core.deps import get_scoped_agent
from app.main import create_app
from app.models.enums import UserRole
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, agent_id, bearer

PUBLIC = {
    ("GET", "/api/v1/health"),
    ("GET", "/api/v1/system/health"),
    ("GET", "/api/v1/system/status"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/logout"),
    ("POST", "/api/v1/auth/demo-login"),
    ("POST", "/api/v1/auth/signup"),
    ("POST", "/api/v1/auth/forgot-password"),
    ("POST", "/api/v1/auth/reset-password"),
}
ACCOUNTS = {UserRole.agent: AGENT_MIRPUR, UserRole.distributor: DIST_DHAKA, UserRole.admin: ADMIN}
OTHER_AGENT = "AGT-0002"  # Patiya, DST-CTG: outside both the Mirpur agent and the Dhaka distributor


def _routes() -> list[tuple[str, str, APIRoute]]:
    out = []
    for r in create_app().routes:
        if isinstance(r, APIRoute) and r.path.startswith("/api/"):
            out.extend((m, r.path, r) for m in sorted(r.methods - {"HEAD", "OPTIONS"}))
    return out


def _roles(route: APIRoute) -> frozenset[UserRole] | None:
    """Roles allowed by the route's require_roles gate, or None when any signed-in user may call."""
    stack = [route.dependant]
    while stack:
        dep = stack.pop()
        call = dep.call
        name = getattr(call, "__qualname__", "")
        if call is not None and name.startswith("require_roles.") and call.__closure__:
            cells = dict(zip(call.__code__.co_freevars, call.__closure__, strict=True))
            allowed: frozenset[UserRole] = cells["allowed"].cell_contents
            return allowed
        stack.extend(dep.dependencies)
    return None


def _scoped(route: APIRoute) -> bool:
    stack = [route.dependant]
    while stack:
        dep = stack.pop()
        if dep.call is get_scoped_agent:
            return True
        stack.extend(dep.dependencies)
    return False


def _url(path: str, agent: int = 1) -> str:
    return re.sub(r"\{[^}]+\}", "1", path.replace("{agent_id}", str(agent)))


ROUTES = _routes()


def test_sweep_sees_the_api() -> None:
    assert len(ROUTES) > 50
    assert any(_roles(r) for _, _, r in ROUTES) and any(_scoped(r) for _, _, r in ROUTES)


@pytest.mark.parametrize(("method", "path"), [(m, p) for m, p, _ in ROUTES
                                              if (m, p) not in PUBLIC])
def test_every_private_route_needs_a_token(client: TestClient, seeded: Path, method: str,
                                           path: str) -> None:
    res = client.request(method, _url(path), json={})
    assert res.status_code == 401, f"{method} {path} -> {res.status_code}"
    assert res.json()["detail"] == "not_authenticated"


def test_forged_and_malformed_tokens_rejected(client: TestClient, seeded: Path) -> None:
    good = bearer(client, ADMIN)["Authorization"]
    header, payload, _sig = good.removeprefix("Bearer ").split(".")
    for token in (f"{header}.{payload}.AAAA", "not-a-jwt", f"{header}.{payload}.", ""):
        res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 401, token


def test_role_gates_refuse_other_roles(client: TestClient, seeded: Path) -> None:
    headers = {role: bearer(client, email) for role, email in ACCOUNTS.items()}
    checked = 0
    for method, path, route in ROUTES:
        allowed = _roles(route)
        if allowed is None:
            continue
        for role in set(UserRole) - allowed:
            res = client.request(method, _url(path), json={}, headers=headers[role])
            assert res.status_code == 403, f"{role.value} {method} {path} -> {res.status_code}"
            checked += 1
    assert checked > 20


def test_agent_scoped_routes_refuse_other_agents(client: TestClient, seeded: Path) -> None:
    other = agent_id(OTHER_AGENT)
    checked = 0
    for email in (AGENT_MIRPUR, DIST_DHAKA):
        h = bearer(client, email)
        for method, path, route in ROUTES:
            if not _scoped(route):
                continue
            res = client.request(method, _url(path, other), json={}, headers=h)
            # 403 for an out-of-scope id and for an unknown one alike, so ids cannot be probed.
            assert res.status_code == 403, f"{email} {method} {path} -> {res.status_code}"
            unknown = client.request(method, _url(path, 999_999), json={}, headers=h)
            assert unknown.status_code == 403, f"{email} {method} {path} (unknown id)"
            checked += 1
    assert checked >= 10


def test_body_agent_ids_are_scoped_too(client: TestClient, seeded: Path) -> None:
    other = agent_id(OTHER_AGENT)
    h = bearer(client, AGENT_MIRPUR)
    res = client.post("/api/v1/copilot/chat", headers=h,
                      json={"message": "When will my cash run out?", "agent_id": other})
    assert res.status_code == 403
    dist = bearer(client, DIST_DHAKA)
    res = client.post("/api/v1/explanations/narrate", headers=dist,
                      json={"agent_id": other, "target": "cash", "lang": "en"})
    assert res.status_code == 403


def test_list_endpoints_do_not_leak_other_agents(client: TestClient, seeded: Path) -> None:
    h = bearer(client, AGENT_MIRPUR)
    res = client.get("/api/v1/search", params={"q": "AGT"}, headers=h)
    assert res.status_code == 200
    assert OTHER_AGENT not in res.text
    dist = bearer(client, DIST_DHAKA)
    agents = client.get("/api/v1/agents", headers=dist)
    assert agents.status_code == 200 and OTHER_AGENT not in agents.text
