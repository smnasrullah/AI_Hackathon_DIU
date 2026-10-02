"""GET /system/freshness: last forecast time, model version, data period, LLM mode."""

from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

from ml.data_gen.timeline import END, HOLDOUT_START, SIM_NOW, START
from tests.auth_helpers import AGENT_MIRPUR, DIST_DHAKA, bearer
from tests.rebalance_helpers import build_market

API = "/api/v1/system/freshness"


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value)


def test_freshness_after_forecast(client: TestClient, seeded: Path) -> None:
    build_market()
    res = client.get(API, headers=bearer(client, DIST_DHAKA))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["model_version"] == "test-flat"
    assert _ts(body["last_forecast_at"]) == SIM_NOW
    period = body["data_period"]
    assert (_ts(period["start"]), _ts(period["end"])) == (START, END)
    assert (_ts(period["holdout_start"]), _ts(period["sim_now"])) == (HOLDOUT_START, SIM_NOW)
    assert body["llm_mode"] in ("replay", "template") and body["generated_at"]


def test_freshness_before_forecast_and_auth(client: TestClient, seeded: Path) -> None:
    body = client.get(API, headers=bearer(client, AGENT_MIRPUR)).json()
    assert body["model_version"] is None and body["last_forecast_at"] is None
    assert client.get(API).status_code == 401
