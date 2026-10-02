"""CSV exports: role scoping and spreadsheet formula injection."""

import csv
import io
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.core.csv_export import safe_cell
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.rebalance_helpers import build_market

API = "/api/v1"
DIST_CTG = "dist.chattogram@agentpulse.demo"
EVIL = "=HYPERLINK(\"http://x\",\"y\")"


@pytest.fixture
def market(seeded: Path) -> Path:
    build_market()
    return seeded


def _csv(res: Response) -> list[dict[str, str]]:
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/csv")
    assert res.headers["content-disposition"].startswith("attachment; filename=")
    text = res.content.decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def _get(client: TestClient, path: str, email: str, **params: str) -> list[dict[str, str]]:
    return _csv(client.get(f"{API}{path}", params=params, headers=bearer(client, email)))


@pytest.mark.parametrize("raw", ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1"])
def test_formula_prefixes_are_escaped(raw: str) -> None:
    assert safe_cell(raw) == "'" + raw


def test_safe_values_unchanged() -> None:
    assert safe_cell("Mirpur 10") == "Mirpur 10" and safe_cell("a=b") == "a=b"
    assert safe_cell(-5.5) == -5.5 and safe_cell(3) == 3  # numbers we format stay numbers
    assert safe_cell(None) == "" and safe_cell(True) == "true"
    assert safe_cell(datetime(2026, 4, 30, tzinfo=UTC)) == "2026-04-30T00:00:00+00:00"


def test_risk_export_is_scoped(client: TestClient, market: Path) -> None:
    assert [r["agent_code"] for r in _get(client, "/agents/risk/export.csv", AGENT_MIRPUR)] == [
        "AGT-0001"]
    dhaka = _get(client, "/agents/risk/export.csv", DIST_DHAKA)
    assert {r["agent_code"] for r in dhaka} == {"AGT-0001", "AGT-9001", "AGT-9002"}
    assert dhaka[0]["agent_code"] == "AGT-0001" and dhaka[0]["level"] == "red"
    assert dhaka[0]["model_version"] == "test-flat" and dhaka[0]["horizon_h"] == "24"
    assert len(_get(client, "/agents/risk/export.csv", ADMIN)) == 5
    red = _get(client, "/agents/risk/export.csv", ADMIN, level="red", horizon="6")
    assert {r["agent_code"] for r in red} == {"AGT-0001", "AGT-0002"}
    h = bearer(client, ADMIN)
    assert client.get(f"{API}/agents/risk/export.csv", params={"horizon": "12"},
                      headers=h).status_code == 422
    assert client.get(f"{API}/agents/risk/export.csv").status_code == 401


def test_risk_export_not_ready(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/agents/risk/export.csv", headers=bearer(client, ADMIN))
    assert res.status_code == 503


def test_swap_export_scoped_and_note_escaped(client: TestClient, market: Path) -> None:
    (row,) = _get(client, "/swaps/export.csv", ADMIN)
    res = client.post(f"{API}/swaps/{row['swap_id']}/decision",
                      json={"decision": "reject", "note": EVIL}, headers=bearer(client, DIST_DHAKA))
    assert res.status_code == 200, res.text
    (row,) = _get(client, "/swaps/export.csv", DIST_DHAKA)
    assert row["note"] == "'" + EVIL and row["status"] == "rejected"
    assert (row["donor_code"], row["receiver_code"]) == ("AGT-9001", "AGT-0001")
    assert len(_get(client, "/swaps/export.csv", AGENT_MIRPUR)) == 1
    assert _get(client, "/swaps/export.csv", AGENT_PATIYA) == []
    assert _get(client, "/swaps/export.csv", DIST_CTG) == []
    assert _get(client, "/swaps/export.csv", ADMIN, status="pending") == []
    assert client.get(f"{API}/swaps/export.csv").status_code == 401


def test_audit_export_admin_only_and_escaped(client: TestClient, market: Path) -> None:
    (swap,) = _get(client, "/swaps/export.csv", ADMIN)
    client.post(f"{API}/swaps/{swap['swap_id']}/respond", json={"response": "accept",
                "note": "@cmd|' /C calc'!A0"}, headers=bearer(client, AGENT_MIRPUR))
    client.post(f"{API}/swaps/{swap['swap_id']}/decision",
                json={"decision": "approve", "note": "-2+3"}, headers=bearer(client, DIST_DHAKA))
    rows = _get(client, "/admin/audit-log/export.csv", ADMIN)
    assert [r["action"] for r in rows] == ["swap.approve", "swap.accept"]
    assert rows[0]["note"] == "'-2+3" and rows[1]["note"] == "'@cmd|' /C calc'!A0"
    assert (rows[0]["user_email"], rows[0]["user_role"]) == (DIST_DHAKA, "distributor")
    assert rows[0]["entity_id"] == swap["swap_id"] and '"amount_bdt"' in rows[0]["payload"]
    for email in (DIST_DHAKA, AGENT_MIRPUR):
        res = client.get(f"{API}/admin/audit-log/export.csv", headers=bearer(client, email))
        assert res.status_code == 403
    assert client.get(f"{API}/admin/audit-log/export.csv").status_code == 401
