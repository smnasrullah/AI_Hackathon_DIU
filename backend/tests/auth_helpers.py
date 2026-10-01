from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Agent
from tests.conftest import DEMO_PASSWORDS

ADMIN = "admin@agentpulse.demo"
DIST_DHAKA = "dist.dhaka@agentpulse.demo"
AGENT_MIRPUR = "agent.mirpur@agentpulse.demo"  # AGT-0001, DST-DHK
AGENT_PATIYA = "agent.patiya@agentpulse.demo"  # AGT-0002, DST-CTG


def password_for(email: str) -> str:
    role = "admin" if email.startswith("admin") else email.split(".")[0]
    return DEMO_PASSWORDS["distributor" if role == "dist" else role]


def login(client: TestClient, email: str) -> dict[str, object]:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password_for(email)})
    assert res.status_code == 200, res.text
    body: dict[str, object] = res.json()
    return body


def bearer(client: TestClient, email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(client, email)['access_token']}"}


def agent_id(code: str) -> int:
    with Session(get_engine()) as session:
        found = session.scalar(select(Agent.id).where(Agent.code == code))
        assert found is not None
        return found
