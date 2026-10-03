from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.params import MAX_ID
from app.models.enums import FloatType, HelpReasonCategory, UserRole


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
    deadline_floor_min: int
    urgent_wave_multiplier: float
    max_new_per_tick: int


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
    deadline_floor_min: int | None = Field(default=None, ge=1, le=240)
    urgent_wave_multiplier: float | None = Field(default=None, ge=1, le=5)
    max_new_per_tick: int | None = Field(default=None, ge=1, le=100)


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
    needed_by: datetime | None  # wall clock
    stockout_at: datetime | None  # the agent page's stock-out, placed on the wall clock
    urgent: bool
    deadline_asap: bool  # floor put needed_by after the stock-out: say "as soon as possible"
    # active_request | cooldown | daily_cap | no_candidates | tick_cap (waits for a later tick)
    skipped: str | None
    simulated: bool
    reason_summary: str | None  # in the caller's language
    reason_category: HelpReasonCategory | None
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
    dry_run: bool
    enabled: bool
    sent: bool  # false under dry run or the kill switch: nothing was created or sent
    would_create: list[PlanItemOut]  # then: what WOULD have been sent, and to whom


class TriggerRunOut(BaseModel):
    """One manual run of the trigger (sweep and wave advance included)."""

    evaluated_at: datetime
    dry_run: bool
    enabled: bool
    sent: bool  # false under dry run or the kill switch: nothing was created or sent
    created_request_ids: list[int]
    would_create: list[PlanItemOut]  # dry run / kill switch: what WOULD have been sent
    reopened: int
    expired: int
    waves_advanced: int
    waves_exhausted: int


class OptOutIn(BaseModel):
    opted_out: bool


class OptOutOut(BaseModel):
    opted_out: bool
