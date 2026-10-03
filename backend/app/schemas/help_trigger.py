from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.params import MAX_ID
from app.models.enums import FloatType, UserRole


class TriggerSettingsOut(BaseModel):
    horizon_h: int
    buffer_pct: float
    min_shortfall_bdt: float
    max_request_bdt: float
    lead_margin_h: float
    radius_km: float
    wave_timeout_min: int
    max_waves: int
    recent_ask_h: float


class TriggerSettingsIn(BaseModel):
    """Partial update; omitted fields keep their value."""

    horizon_h: int | None = Field(default=None, ge=1, le=72)
    buffer_pct: float | None = Field(default=None, ge=0, le=100)
    min_shortfall_bdt: float | None = Field(default=None, ge=0, le=1_000_000)
    max_request_bdt: float | None = Field(default=None, ge=500, le=10_000_000)
    lead_margin_h: float | None = Field(default=None, ge=0, le=72)
    radius_km: float | None = Field(default=None, gt=0, le=50)
    wave_timeout_min: int | None = Field(default=None, ge=1, le=1440)
    max_waves: int | None = Field(default=None, ge=1, le=10)
    recent_ask_h: float | None = Field(default=None, ge=0, le=168)


class PlanAskOut(BaseModel):
    display: str  # agent or distributor code
    role: UserRole
    distance_km: float
    wave: int


class PlanItemOut(BaseModel):
    agent_id: int
    agent_code: str
    float_type: FloatType
    fires: bool  # the rule is met
    reason: str  # ok | risk_not_red | above_buffer | below_min_shortfall
    projected_low_bdt: float
    buffer_bdt: float
    amount_bdt: float
    needed_by: datetime | None
    skipped: str | None  # active_request | cooldown | daily_cap | no_candidates
    simulated: bool
    reason_summary: str | None
    asks: list[PlanAskOut]


class DryRunIn(BaseModel):
    agent_ids: list[int] | None = Field(default=None, max_length=500)


class DryRunOut(BaseModel):
    evaluated_at: datetime
    enabled: bool
    dry_run: bool
    items: list[PlanItemOut]
    would_create: int
    would_ask: int
    sent: Literal[False] = False  # a dry-run evaluation never sends anything


class SimulateIn(BaseModel):
    agent_id: int = Field(ge=1, le=MAX_ID)
    float_type: FloatType


class SimulateOut(BaseModel):
    agent_id: int
    agent_code: str
    float_type: FloatType
    simulated: Literal[True] = True
    until: datetime
    created_request_ids: list[int]
    plan: PlanItemOut


class OptOutIn(BaseModel):
    opted_out: bool


class OptOutOut(BaseModel):
    opted_out: bool
