"""ML gate: the COMMITTED forecast must beat the same-hour-last-week baseline on the held-out
14 days, and the committed anomaly detector must find the injected anomalies there. Metrics are
read back from the model_versions rows registered from the artifacts."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_engine
from app.services.model_registry import (
    active_model,
    register_anomaly_model,
    register_forecast_model,
)
from ml.inference.anomaly import load_detector
from ml.registry import FORECAST_MODEL

pytestmark = pytest.mark.slow

COMMITTED_ARTIFACTS = BACKEND_DIR / "ml" / "artifacts"


@pytest.fixture
def metrics(env: Path) -> dict[str, dict[str, float]]:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = get_settings().database_url
    command.upgrade(cfg, "head")
    with Session(get_engine()) as session, session.begin():
        register_forecast_model(session, COMMITTED_ARTIFACTS)
    with Session(get_engine()) as session:
        row = active_model(session, FORECAST_MODEL)
        assert row is not None
        return row.metrics


@pytest.mark.parametrize("target", ["cash_out", "cash_in"])
def test_forecast_beats_last_week_baseline(metrics: dict[str, dict[str, float]],
                                           target: str) -> None:
    m = metrics[target]
    assert m["rows"] > 0
    assert m["mae_bdt"] < m["mae_baseline_bdt"], (
        f"{target}: model MAE {m['mae_bdt']} does not beat baseline {m['mae_baseline_bdt']}")


def test_committed_anomaly_detector_finds_injected_anomalies(env: Path) -> None:
    """Holdout precision/recall of the COMMITTED Isolation Forests vs the injected labels."""
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = get_settings().database_url
    command.upgrade(cfg, "head")
    with Session(get_engine()) as session, session.begin():
        row = register_anomaly_model(session, COMMITTED_ARTIFACTS)
        version, holdout = row.version, row.metrics["holdout"]
    assert load_detector(COMMITTED_ARTIFACTS).version == version
    assert holdout["positives"] > 0
    assert holdout["precision"] >= 0.5 and holdout["recall"] >= 0.5, holdout
