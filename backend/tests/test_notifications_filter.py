"""GET /notifications?entity_type=...: the cheap help-badge poll counts only that kind."""

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Notification
from app.models.enums import NotificationSeverity, NotificationType
from tests.auth_helpers import AGENT_PATIYA, bearer
from tests.help_helpers import make_request, user_id

API = "/api/v1/notifications"


def test_entity_type_filter_scopes_items_and_unread_count(client: TestClient,
                                                          seeded: Path) -> None:
    make_request([AGENT_PATIYA])  # Patiya is asked: one help notification
    with Session(get_engine()) as s, s.begin():
        s.add(Notification(user_id=user_id(AGENT_PATIYA), type=NotificationType.system,
                           severity=NotificationSeverity.info, title_key="notifications.fallback",
                           params={}, entity_type="agent", entity_id=None))
    h = bearer(client, AGENT_PATIYA)
    every = client.get(API, headers=h).json()
    helps = client.get(API, params={"entity_type": "liquidity_request", "unread": True,
                                    "page_size": 1}, headers=h).json()
    assert every["unread_count"] > helps["unread_count"] >= 1
    assert all(i["entity_type"] == "liquidity_request" for i in helps["items"])
    assert client.get(API, params={"entity_type": "Bad Type"}, headers=h).status_code == 422
