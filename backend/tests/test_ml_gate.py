"""ML gate: the COMMITTED forecast must beat the same-hour-last-week baseline on the held-out
14 days. Metrics are read back from the model_versions row registered from the artifacts."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_engine
from app.services.model_registry import active_model, register_forecast_model
from ml.registry import FORECAST_MODEL

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
