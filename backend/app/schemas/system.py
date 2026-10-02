from datetime import datetime
from typing import Literal

from pydantic import BaseModel

BootstrapState = Literal[
    "starting",
    "waiting_for_db",
    "migrating",
    "seeding",
    "training",
    "precomputing",
    "finalizing",
    "ready",
    "failed",
]
LlmMode = Literal["anthropic", "openai_compatible", "replay", "template"]


class HealthResponse(BaseModel):
    status: Literal["ok"]


class SystemStatus(BaseModel):
    ready: bool
    bootstrap_state: BootstrapState
    db: bool
    migration_current: str | None
    migration_head: str | None
    seed: int | None
    data_version: str | None
    artifacts_ok: bool
    model_version: str | None
    llm_mode: LlmMode
    demo_mode: bool
    generated_at: datetime


class DataPeriod(BaseModel):
    """Synthetic data window; the last 14 days are held out from training."""

    start: datetime
    end: datetime  # exclusive
    holdout_start: datetime
    sim_now: datetime  # simulated "now" every prediction starts at


class Freshness(BaseModel):
    last_forecast_at: datetime | None
    model_version: str | None
    data_period: DataPeriod
    llm_mode: LlmMode
    generated_at: datetime
