"""TreeSHAP explanations: additivity, cached drivers, GET /agents/{id}/explanations, evidence."""

import json
import re
import shutil
from decimal import Decimal
from pathlib import Path
from typing import Any

import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Event, ForecastExplanation
from app.rules.risk_rules import build_config
from app.services import forecast, risk
from ml import registry
from ml.data_gen.timeline import SIM_NOW, hour_index
from ml.explain.factors import FACTORS, MEDIAN, window_shap
from ml.features.build import MAX_HORIZON_H, build, grid
from ml.features.panel import load_panel
from ml.inference.forecaster import Forecaster
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, DIST_DHAKA, agent_id, bearer
from tests.conftest import N_TRAINED_AGENTS as N_AGENTS

API = "/api/v1"
NUMBER = re.compile(r"\d+(?:\.\d+)?")


def _url(code: str = "AGT-0001") -> str:
    return f"{API}/agents/{agent_id(code)}/explanations"


def _numbers(text: str) -> set[float]:
    return {float(n) for n in NUMBER.findall(text.replace(",", ""))}


def test_shap_adds_up_to_the_median_forecast(env: Path, trained: tuple[Path, Path]) -> None:
    shutil.copy(trained[0], env / "test.db")
    t0 = hour_index(SIM_NOW)
    with Session(get_engine()) as session:
        panel = load_panel(session, end=t0)
    fc = Forecaster.load(trained[1])
    for target in ("cash_out", "cash_in"):
        ws = window_shap(fc, panel, target, t0, 24)
        rows, origins, hs = grid(N_AGENTS, t0, 24)
        x, scale = build(panel, target, rows, origins, hs)
        raw = fc.boosters[target][MEDIAN].predict(x, num_threads=1) * scale
        np.testing.assert_allclose(ws.usual + ws.impacts.sum(axis=1),
                                   raw.reshape(N_AGENTS, 24).sum(axis=1), rtol=1e-6)


def test_cached_drivers_tell_the_salary_story(ready: Path) -> None:
    with Session(get_engine()) as session:
        rows = session.scalars(select(ForecastExplanation)).all()
    assert len(rows) == N_AGENTS * 2
    for r in rows:
        assert r.window_h == 24 and float(r.usual_bdt) > 0
        assert [d["factor"] for d in r.drivers] != [] and {
            d["factor"] for d in r.drivers} == set(FACTORS)
        impacts = [abs(d["impact_bdt"]) for d in r.drivers]
        assert impacts == sorted(impacts, reverse=True)
        salary = next(d for d in r.drivers if d["factor"] == "salary")
        assert salary["facts"]["when"] == "tomorrow" and salary["facts"]["days"] == 1
        assert salary["facts"]["event_en"] and salary["facts"]["event_bn"]


def _check_reasons(body: dict[str, Any], lang: str) -> None:
    reasons = body["reasons"]
    assert 1 <= len(reasons) <= 3
    evidence_numbers = _numbers(json.dumps(body["evidence"], ensure_ascii=False))
    for r in reasons:
        assert r["factor"] in FACTORS and r["share"] >= 0.05
        assert r["direction"] == ("up" if r["impact"] > 0 else "down")
        if lang == "en":
            assert r["sentence"].endswith(".")
            # Numbers guard contract: every number quoted is in the evidence pack.
            assert _numbers(r["sentence"]) <= evidence_numbers, r["sentence"]
        else:
            assert r["sentence"].endswith("।") and not re.search(r"[0-9]", r["sentence"])


def test_explanations_en_bn(client: TestClient, ready: Path) -> None:
    h = bearer(client, AGENT_MIRPUR)
    res = client.get(_url(), params={"target": "cash", "lang": "en"}, headers=h)
    assert res.status_code == 200, res.text
    en = res.json()
    assert (en["target"], en["demand_type"], en["lang"]) == ("cash", "cash_out", "en")
    assert en["window_hours"] == 24 and en["generated_by"] == "template" and en["generated_at"]
    assert en["model_version"] == registry.read_manifest(ready)["model_version"]  # type: ignore[index]
    _check_reasons(en, "en")
    bn = client.get(_url(), params={"target": "cash", "lang": "bn"}, headers=h).json()
    _check_reasons(bn, "bn")
    assert [r["factor"] for r in bn["reasons"]] == [r["factor"] for r in en["reasons"]]
    em = client.get(_url(), params={"target": "emoney", "lang": "en"}, headers=h).json()
    assert em["demand_type"] == "cash_in" and em["evidence"]["float_type"] == "emoney"
    me = client.get(f"{API}/auth/me", headers=h).json()
    assert client.get(_url(), headers=h).json()["lang"] == me["lang"]
    for bad in ({"target": "gold"}, {"lang": "fr"}):
        assert client.get(_url(), params=bad, headers=h).status_code == 422


def test_evidence_pack(client: TestClient, ready: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        assert risk.precompute(session, build_config(), seed=42) == N_AGENTS
    body = client.get(_url(), params={"lang": "en"}, headers=bearer(client, ADMIN)).json()
    ev = body["evidence"]
    assert ev["agent"]["id"] == agent_id("AGT-0001") and ev["unit"] == "BDT"
    assert ev["model_version"] == body["model_version"] and ev["window_h"] == 24
    assert ev["forecast"]["expected_bdt"] > 0 and ev["balance_bdt"] is not None
    assert ev["stockout"] is not None and [r["horizon_h"] for r in ev["risk"]] == [6, 24, 72]
    assert [(d["factor"], d["impact_bdt"]) for d in ev["drivers"]] == [
        (r["factor"], r["impact"]) for r in body["reasons"]]
    assert "generated_at" not in json.dumps(ev)
    again = client.get(_url(), params={"lang": "bn"}, headers=bearer(client, ADMIN)).json()
    assert again["evidence"] == ev  # language-independent, stable


def test_explanations_scoping(client: TestClient, ready: Path) -> None:
    own, other = _url("AGT-0001"), _url("AGT-0002")
    assert client.get(own).status_code == 401
    agent = bearer(client, AGENT_MIRPUR)
    assert client.get(other, headers=agent).status_code == 403
    dist = bearer(client, DIST_DHAKA)
    assert client.get(own, headers=dist).status_code == 200
    assert client.get(other, headers=dist).status_code == 403


def test_not_ready_without_cache(client: TestClient, seeded: Path) -> None:
    res = client.get(_url(), headers=bearer(client, ADMIN))
    assert res.status_code == 503 and res.json()["detail"] == "explanations_not_ready"


def test_event_change_refreshes_cache(ready: Path) -> None:
    with Session(get_engine()) as session, session.begin():
        assert forecast.precompute(session, ready) == 0
        event = session.scalars(select(Event).order_by(Event.id)).first()
        assert event is not None
        event.intensity = Decimal("9.5")
    with Session(get_engine()) as session, session.begin():
        assert forecast.precompute(session, ready) == N_AGENTS * 2 * MAX_HORIZON_H
