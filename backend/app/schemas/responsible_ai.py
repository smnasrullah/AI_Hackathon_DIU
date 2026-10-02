from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel

from app.models.enums import Lang


class GroupBy(StrEnum):
    urban_rural = "urban_rural"
    tier = "tier"
    region = "region"


class ForecastFairness(BaseModel):
    target: str  # cash_out | cash_in
    mean_demand_bdt: float
    mae_bdt: float
    mae_baseline_bdt: float
    nmae: float  # MAE / mean demand: comparable across busy and quiet groups
    skill: float  # 1 - MAE / baseline MAE


class StockoutFairness(BaseModel):
    events: int  # (agent, float, round) with a real stockout in the next 24 h
    flagged: int  # amber/red at 24 h at that round
    caught: int  # events that were flagged
    recall: float | None  # None when the group had no event
    precision: float | None


class FairnessGroup(BaseModel):
    group: str
    n_agents: int
    forecast: list[ForecastFairness]
    stockout: StockoutFairness


class FairnessGap(BaseModel):
    """Largest minus smallest value across the groups (smaller = more even)."""

    nmae: dict[str, float]  # target -> gap
    recall: float | None


class FairnessMethod(BaseModel):
    start: date
    end: date
    rounds_local_hours: list[int]
    horizon_h: int
    amber_cut_24h: float
    n_paths: int


class FairnessReport(BaseModel):
    group_by: GroupBy
    groups: list[FairnessGroup]
    overall: FairnessGroup
    gap: FairnessGap
    method: FairnessMethod
    model_version: str
    generated_at: datetime


class ModelInfo(BaseModel):
    name: str
    version: str
    kind: str
    purpose: str
    trained_at: datetime
    metrics: dict[str, float]


class DataInfo(BaseModel):
    source: str
    seed: int | None
    data_version: str | None
    start: datetime | None
    end: datetime | None
    holdout_start: datetime | None
    n_agents: int
    n_distributors: int


class ModelCard(BaseModel):
    lang: Lang
    advisory_only: bool  # always true: a human approves anything that moves money
    human_oversight: str
    models: list[ModelInfo]
    data: DataInfo
    intended_use: list[str]
    out_of_scope: list[str]
    limitations: list[str]
    fairness: dict[GroupBy, FairnessGap]
    model_version: str
    generated_at: datetime
