"""Forecast pipeline: train (tiny) -> register -> precompute cache -> GET /agents/{id}/forecast."""

import shutil
from datetime import datetime
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Forecast, ModelVersion, RiskLevel, StockoutPrediction
from app.rules.risk_rules import build_config
from app.services import forecast, risk
from ml import registry
from ml.data_gen.timeline import HOLDOUT_START, SIM_NOW, hour_index
from ml.features.build import FEATURES, MAX_HORIZON_H, build, grid
from ml.features.panel import load_panel
from ml.training import train
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, agent_id, bearer
from tests.conftest import N_TRAINED_AGENTS as N_AGENTS

API = "/api/v1"


def test_manifest_and_holdout_metrics(trained: tuple[Path, Path]) -> None:
    _, artifacts = trained
    assert registry.verify(artifacts) == (True, "ok")
    m = registry.read_manifest(artifacts)
    assert m is not None and m["forecast"]["features"] == list(FEATURES)
    for target in ("cash_out", "cash_in"):
        metrics = m["forecast"]["holdout_metrics"][target]
        assert metrics["rows"] > 0
        assert set(metrics["pinball"]) == {"0.1", "0.5", "0.9", "mean"}
        assert metrics["mae_bdt"] >= 0 and metrics["mae_baseline_bdt"] > 0


def test_training_rows_never_touch_holdout() -> None:
    holdout = hour_index(HOLDOUT_START)
    rows, origins, hs = train.sample_rows(5, holdout, seed=1)
    assert len(rows) > 0
    assert int((origins + hs - 1).max()) < holdout
    assert hs.min() >= 1 and hs.max() <= MAX_HORIZON_H


def test_inference_features_ignore_future(env: Path, trained: tuple[Path, Path]) -> None:
    shutil.copy(trained[0], env / "test.db")
    t0 = hour_index(SIM_NOW)
    with Session(get_engine()) as session:
        full, cut = load_panel(session), load_panel(session, end=t0)
    assert cut.demand["cash_out"][:, t0:].sum() == 0
    rows, origins, hs = grid(N_AGENTS, t0, MAX_HORIZON_H)
    np.testing.assert_array_equal(build(full, "cash_out", rows, origins, hs)[0],
                                  build(cut, "cash_out", rows, origins, hs)[0])


def test_precompute_is_idempotent_and_registers_model(ready: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        assert forecast.precompute(session, ready) == 0
    with Session(get_engine()) as session:
        active = session.scalars(select(ModelVersion).where(ModelVersion.is_active)).all()
        assert len(active) == 1 and active[0].metrics["cash_out"]["rows"] > 0
        assert session.scalar(select(func.count()).select_from(Forecast)) == (
            N_AGENTS * 2 * MAX_HORIZON_H)


def test_risk_precompute_on_real_forecasts(ready: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        assert risk.precompute(session, build_config(), seed=42) == N_AGENTS
    with Session(get_engine()) as session:
        rows = session.scalars(select(RiskLevel).order_by(
            RiskLevel.agent_id, RiskLevel.float_type, RiskLevel.horizon_h)).all()
        assert len(rows) == N_AGENTS * 2 * 3
        assert session.scalar(select(func.count()).select_from(StockoutPrediction)) == N_AGENTS * 2
    for i in range(0, len(rows), 3):
        probs = [float(r.probability) for r in rows[i:i + 3]]
        assert [r.horizon_h for r in rows[i:i + 3]] == [6, 24, 72]
        assert 0 <= probs[0] <= probs[1] <= probs[2] <= 1


def test_forecast_shapes_and_quantile_order(client: TestClient, ready: Path) -> None:
    res = client.get(f"{API}/agents/{agent_id('AGT-0001')}/forecast",
                     params={"horizon_hours": 24}, headers=bearer(client, AGENT_MIRPUR))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["model_version"] == registry.read_manifest(ready)["model_version"]  # type: ignore[index]
    assert body["generated_at"] and body["horizon_hours"] == 24 and body["unit"] == "BDT"
    assert [(f["float_type"], f["demand_type"]) for f in body["floats"]] == [
        ("cash", "cash_out"), ("emoney", "cash_in")]
    for f in body["floats"]:
        assert [p["horizon_h"] for p in f["points"]] == list(range(1, 25))
        for p in f["points"]:
            assert 0 <= p["low"] <= p["expected"] <= p["high"]
    first = datetime.fromisoformat(body["floats"][0]["points"][0]["ts"].replace("Z", "+00:00"))
    assert first == SIM_NOW == datetime.fromisoformat(body["as_of"].replace("Z", "+00:00"))


def test_forecast_horizon_bounds(client: TestClient, ready: Path) -> None:
    url = f"{API}/agents/{agent_id('AGT-0001')}/forecast"
    headers = bearer(client, ADMIN)
    full = client.get(url, params={"horizon_hours": 72}, headers=headers).json()
    assert all(len(f["points"]) == 72 for f in full["floats"])
    assert len(client.get(url, headers=headers).json()["floats"][0]["points"]) == 24
    for bad in (0, 73):
        assert client.get(url, params={"horizon_hours": bad}, headers=headers).status_code == 422


def test_forecast_auth(client: TestClient, ready: Path) -> None:
    own, other = agent_id("AGT-0001"), agent_id("AGT-0002")
    assert client.get(f"{API}/agents/{own}/forecast").status_code == 401
    agent = bearer(client, AGENT_MIRPUR)
    assert client.get(f"{API}/agents/{other}/forecast", headers=agent).status_code == 403
    dist = bearer(client, DIST_DHAKA)
    assert client.get(f"{API}/agents/{own}/forecast", headers=dist).status_code == 200
    assert client.get(f"{API}/agents/{other}/forecast", headers=dist).status_code == 403


def test_forecast_not_ready_without_cache(client: TestClient, seeded: Path) -> None:
    res = client.get(f"{API}/agents/{agent_id('AGT-0001')}/forecast",
                     headers=bearer(client, ADMIN))
    assert res.status_code == 503
    assert res.json()["detail"] == "forecast_not_ready"
