"""Holdout backtests on the tiny trained dataset -> GET /impact/*, /responsible-ai/*."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_engine
from app.models import ImpactResult
from app.models.enums import ImpactScenario
from app.services import backtest
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, bearer
from tests.conftest import N_TRAINED_AGENTS

API = "/api/v1"
DISTRIBUTORS = (DIST_DHAKA, "dist.chattogram@agentpulse.demo", "dist.sylhet@agentpulse.demo")
HOLDOUT_DAYS = 14


@pytest.fixture
def backtested(ready: Path) -> Path:
    with Session(get_engine()) as session, session.begin():
        assert backtest.precompute(session, get_settings()) > 0
    return ready


def _get(client: TestClient, path: str, email: str, **params: Any) -> dict[str, Any]:
    res = client.get(f"{API}{path}", params=params, headers=bearer(client, email))
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def test_rows_and_cache(client: TestClient, backtested: Path) -> None:
    with Session(get_engine()) as session:
        rows = session.scalars(select(ImpactResult)).all()
        n_dist = len({r.distributor_id for r in rows})
        assert len(rows) == 2 * n_dist * HOLDOUT_DAYS
        for r in rows:
            if r.scenario == ImpactScenario.baseline:
                assert float(r.value_saved_bdt) == 0
    with Session(get_engine()) as session, session.begin():
        assert backtest.precompute(session, get_settings()) == 0  # current -> skipped
        assert session.scalar(select(func.count()).select_from(ImpactResult)) == len(rows)


def test_summary_is_consistent(client: TestClient, backtested: Path) -> None:
    s = _get(client, "/impact/summary", ADMIN)
    assert s["scope"] == "all" and s["n_agents"] == N_TRAINED_AGENTS and s["days"] == HOLDOUT_DAYS
    assert (s["start"], s["end"]) == ("2026-04-21", "2026-05-04")
    assert s["model_version"] and s["generated_at"]
    m, b, d = s["model"], s["baseline"], s["delta"]
    assert d["value_saved_bdt"] == pytest.approx(b["value_lost_bdt"] - m["value_lost_bdt"])
    assert d["stockout_hours_reduced"] == b["stockout_hours"] - m["stockout_hours"]
    assert d["van_trips_avoided"] == b["van_trips"] - m["van_trips"]
    assert b["van_cost_bdt"] == b["van_trips"] * 1_500
    assert b["actions"]["swap"] == 0 and b["actions"]["van"] == 0
    assert s["assumptions"]["alert_share"] == 0.2
    assert s["assumptions"]["decision_hours"] == [8, 14, 20]
    shares = [p["alert_share"] for p in s["equal_service"]["sweep"]]
    assert shares == [0.1, 0.2, 0.3, 0.4, 0.5]
    at_default = s["equal_service"]["sweep"][1]
    assert (at_default["stockout_hours"], at_default["van_trips"]) == (b["stockout_hours"],
                                                                       b["van_trips"])
    cheap = _get(client, "/impact/summary", ADMIN, van_cost=100)
    assert cheap["baseline"]["van_cost_bdt"] == b["van_trips"] * 100
    assert cheap["assumptions"]["van_cost_per_trip_bdt"] == 100


def test_distributors_see_only_their_agents(client: TestClient, backtested: Path) -> None:
    total = _get(client, "/impact/summary", ADMIN)
    parts = [_get(client, "/impact/summary", email) for email in DISTRIBUTORS]
    assert parts[0]["scope"] == "DST-DHK"
    assert sum(p["n_agents"] for p in parts) == total["n_agents"]
    for side in ("model", "baseline"):
        for k in ("stockout_hours", "van_trips"):
            assert sum(p[side][k] for p in parts) == total[side][k]
        assert sum(p[side]["value_lost_bdt"] for p in parts) == pytest.approx(
            total[side]["value_lost_bdt"])


def test_comparison_by_day(client: TestClient, backtested: Path) -> None:
    c = _get(client, "/impact/comparison", ADMIN, **{"from": "2026-04-22", "to": "2026-04-24"})
    assert [d["date"] for d in c["days"]] == ["2026-04-22", "2026-04-23", "2026-04-24"]
    t = c["totals"]
    assert (t["start"], t["end"], t["days"]) == ("2026-04-22", "2026-04-24", 3)
    for side in ("model", "baseline"):
        assert sum(d[side]["stockout_hours"] for d in c["days"]) == t[side]["stockout_hours"]
        assert sum(d[side]["van_trips"] for d in c["days"]) == t[side]["van_trips"]
    full = _get(client, "/impact/comparison", ADMIN)
    assert len(full["days"]) == HOLDOUT_DAYS
    summary = _get(client, "/impact/summary", ADMIN)
    assert full["totals"]["delta"] == summary["delta"]
    outside = _get(client, "/impact/comparison", ADMIN, **{"from": "2026-01-01",
                                                           "to": "2026-01-31"})
    assert outside["days"] == [] and outside["totals"] is None


def test_impact_access_and_validation(client: TestClient, backtested: Path) -> None:
    assert client.get(f"{API}/impact/summary").status_code == 401
    agent = bearer(client, AGENT_MIRPUR)
    for path in ("/impact/summary", "/impact/comparison"):
        assert client.get(f"{API}{path}", headers=agent).status_code == 403
    h = bearer(client, ADMIN)
    bad = client.get(f"{API}/impact/comparison", params={"from": "2026-04-25", "to": "2026-04-22"},
                     headers=h)
    assert bad.status_code == 422 and bad.json()["detail"] == "from_after_to"
    for params in ({"from": "soon"}, {"van_cost": -1}):
        assert client.get(f"{API}/impact/comparison", params=params, headers=h).status_code == 422


def test_fairness_by_group(client: TestClient, backtested: Path) -> None:
    for group_by in ("urban_rural", "tier", "region"):
        r = _get(client, "/responsible-ai/fairness", AGENT_MIRPUR, groupBy=group_by)
        assert r["group_by"] == group_by and r["model_version"] and r["generated_at"]
        assert sum(g["n_agents"] for g in r["groups"]) == N_TRAINED_AGENTS
        o = r["overall"]
        assert o["n_agents"] == N_TRAINED_AGENTS
        assert sum(g["stockout"]["events"] for g in r["groups"]) == o["stockout"]["events"]
        for g in [*r["groups"], o]:
            assert [f["target"] for f in g["forecast"]] == ["cash_out", "cash_in"]
            assert all(f["mae_bdt"] >= 0 and f["mean_demand_bdt"] > 0 for f in g["forecast"])
            s = g["stockout"]
            assert s["caught"] <= min(s["events"], s["flagged"])
            assert s["recall"] is None or 0 <= s["recall"] <= 1
        assert set(r["gap"]["nmae"]) == {"cash_out", "cash_in"}
        assert r["method"]["horizon_h"] == 24 and r["method"]["amber_cut_24h"] == 0.2
    default = _get(client, "/responsible-ai/fairness", ADMIN)
    assert default["group_by"] == "urban_rural"
    h = bearer(client, ADMIN)
    res = client.get(f"{API}/responsible-ai/fairness", params={"groupBy": "district"}, headers=h)
    assert res.status_code == 422


def test_model_card(client: TestClient, backtested: Path) -> None:
    en = _get(client, "/responsible-ai/model-card", DIST_DHAKA, lang="en")
    assert en["advisory_only"] is True and en["lang"] == "en"
    assert en["models"][0]["name"] == "demand_forecast"
    assert "cash_out.mae_bdt" in en["models"][0]["metrics"]
    assert en["data"]["seed"] == 42 and en["data"]["n_agents"] >= N_TRAINED_AGENTS
    assert en["intended_use"] and en["out_of_scope"] and en["limitations"]
    assert set(en["fairness"]) == {"urban_rural", "tier", "region"}
    bn = _get(client, "/responsible-ai/model-card", AGENT_MIRPUR, lang="bn")
    assert bn["lang"] == "bn" and bn["limitations"] != en["limitations"]
    assert bn["model_version"] == en["model_version"]


def test_not_ready(client: TestClient, seeded: Path) -> None:
    h = bearer(client, ADMIN)
    for path, code in (("/impact/summary", "impact_not_ready"),
                       ("/impact/comparison", "impact_not_ready"),
                       ("/responsible-ai/fairness", "fairness_not_ready"),
                       ("/responsible-ai/model-card", "model_not_ready")):
        res = client.get(f"{API}{path}", headers=h)
        assert res.status_code == 503 and res.json()["detail"] == code
    assert client.get(f"{API}/responsible-ai/model-card").status_code == 401

