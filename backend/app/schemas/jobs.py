from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

JobKind = Literal["generate_data", "retrain_forecast", "retrain_anomaly", "help_trigger"]
JobStatus = Literal["queued", "running", "succeeded", "failed"]


class JobIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: JobKind


class JobResultItem(BaseModel):
    """One labelled outcome value (row counts, model version, metric deltas)."""

    key: str
    value: str


class JobOut(BaseModel):
    id: int
    kind: JobKind
    status: JobStatus
    progress: int  # 0..100
    step: str
    error: str | None
    result: list[JobResultItem]
    started_by_email: str | None
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None


class JobList(BaseModel):
    items: list[JobOut]
    running: JobOut | None
