"""Data freshness chip: when forecasts were last computed, by which model, over which data."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.llm.mode import resolve_mode
from app.models import Forecast
from app.schemas.system import DataPeriod, Freshness
from app.services import forecast
from app.services.model_registry import active_model
from ml.data_gen.timeline import END, HOLDOUT_START, START
from ml.registry import FORECAST_MODEL


def freshness(session: Session, settings: Settings) -> Freshness:
    mv = active_model(session, FORECAST_MODEL)
    last = None if mv is None else session.scalar(
        select(func.max(Forecast.generated_at)).where(Forecast.model_version_id == mv.id))
    return Freshness(
        last_forecast_at=forecast._utc(last) if last else None,
        model_version=mv.version if mv else None,
        data_period=DataPeriod(start=START, end=END, holdout_start=HOLDOUT_START,
                               sim_now=forecast.sim_now(session)),
        llm_mode=resolve_mode(settings),
        generated_at=datetime.now(UTC),
    )
