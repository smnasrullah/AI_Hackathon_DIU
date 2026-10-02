from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.enums import (
    FloatType,
    RecommendationChannel,
    RecommendationKind,
    RecommendationStatus,
    RiskLevelCode,
)


class ChannelAlternative(BaseModel):
    channel: RecommendationChannel
    feasible: bool
    est_cost_bdt: float | None  # from config costs; None = not estimable
    eta_h: float | None
    reason: str


class RuleStep(BaseModel):
    rule: str  # emoney_top_up | swap_covers | van_batch | self_fetch | urgent_manual
    passed: bool
    detail: str


class Rationale(BaseModel):
    """Numbers behind the amount and deadline (all BDT unless named otherwise)."""

    horizon_h: int
    lead_time_h: float
    balance_bdt: float
    capacity_bdt: float
    need_bdt: float  # peak net drain over horizon_h at q90 demand / q10 inflow
    shortfall_bdt: float  # need - balance
    buffer_bdt: float
    stockout_at: datetime  # earlier of the median and the pessimistic-path stockout
    urgent: bool  # lead time already exceeds the time left; deadline = as_of
    capped: bool  # amount limited by free capacity
    risk_level: RiskLevelCode  # at the headline horizon (24 h)
    risk_probability: float
    swap_id: int | None = None
    swap_amount_bdt: float | None = None
    van_route_id: str | None = None
    alternatives: list[ChannelAlternative] = []  # chosen channel first
    rule_trace: list[RuleStep] = []  # channel rules in the order they were checked


class RecommendationItem(BaseModel):
    id: int
    kind: RecommendationKind
    channel: RecommendationChannel | None  # None only on rows from before the channel rule
    van_route_id: str | None
    float_type: FloatType
    amount_bdt: float  # shortfall + buffer, rounded up to 500, capped at free capacity
    deadline_at: datetime  # stockout - lead time
    status: RecommendationStatus
    rationale: Rationale


class AgentRecommendation(BaseModel):
    agent_id: int
    as_of: datetime
    model_version: str
    generated_at: datetime
    unit: Literal["BDT"] = "BDT"
    advisory: Literal[True] = True  # no money moves; a human acts on it
    items: list[RecommendationItem]  # empty = both floats cover the horizon
