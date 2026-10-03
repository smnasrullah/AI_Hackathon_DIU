# ruff: noqa: F811  (fixtures imported from test_llm_api are test parameters here)
"""N+1 guard: a list endpoint's SQL statement count must not grow with the page size."""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import AuditLog, Notification
from app.models.enums import NotificationSeverity, NotificationType
from tests.auth_helpers import ADMIN, DIST_DHAKA, bearer
from tests.test_llm_api import llm_env, scored  # noqa: F401

ROWS = 6


@contextmanager
def count_queries() -> Iterator[list[str]]:
    stmts: list[str] = []
    engine = get_engine()

    def on_execute(_c: object, _cur: object, statement: str, *_a: object) -> None:
        stmts.append(statement)

    event.listen(engine, "before_cursor_execute", on_execute)
    try:
        yield stmts
    finally:
        event.remove(engine, "before_cursor_execute", on_execute)


def _fill(client: TestClient) -> None:
    """Enough rows that a page of 1 and a page of many differ."""
    me = client.get("/api/v1/auth/me", headers=bearer(client, DIST_DHAKA)).json()
    with Session(get_engine()) as s, s.begin():
        for i in range(ROWS):
            s.add(AuditLog(user_id=None, action="test.row", entity_type="test", entity_id=str(i),
                           payload={}))
            s.add(Notification(user_id=uuid.UUID(me["id"]), type=NotificationType.system,
                               severity=NotificationSeverity.info,
                               title_key="notifications.fallback", params={}))


PAGED = [
    (ADMIN, "/api/v1/admin/users"),
    (ADMIN, "/api/v1/admin/audit-log"),
    (ADMIN, "/api/v1/agents/risk"),
    (ADMIN, "/api/v1/events"),
    (DIST_DHAKA, "/api/v1/notifications"),
]


@pytest.mark.parametrize(("email", "path"), PAGED)
def test_list_query_count_is_flat(client: TestClient, scored: Path, email: str, path: str) -> None:
    _fill(client)
    headers = bearer(client, email)
    counts, sizes = [], []
    for size in (1, 50):
        with count_queries() as stmts:
            res = client.get(path, params={"page_size": size}, headers=headers)
        assert res.status_code == 200, res.text
        counts.append(len(stmts))
        sizes.append(len(res.json()["items"]))
    assert sizes[1] > sizes[0], f"{path}: not enough rows to compare ({sizes})"
    assert counts[1] == counts[0], f"{path}: {counts} queries for {sizes} rows"


@pytest.mark.parametrize(("email", "path"), [
    (ADMIN, "/api/v1/agents"),
    (ADMIN, "/api/v1/map/agents"),
    (ADMIN, "/api/v1/admin/org"),
    (DIST_DHAKA, "/api/v1/map/agents"),
])
def test_unpaged_lists_use_few_queries(client: TestClient, scored: Path, email: str,
                                       path: str) -> None:
    headers = bearer(client, email)
    with count_queries() as stmts:
        res = client.get(path, headers=headers)
    assert res.status_code == 200, res.text
    assert len(stmts) <= 12, f"{path}: {len(stmts)} queries"
