from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import RecommendationChannel


class ScenarioTotals(BaseModel):
    stockout_hours: float  # agent-hours with customers turned away
    value_lost_bdt: float  # turned-away transaction value
    fee_lost_bdt: float  # cash-out fee on the turned-away cash-outs
    van_trips: int
    van_cost_bdt: float
    actions: dict[RecommendationChannel, int]  # deliveries ordered, by channel


class ImpactDelta(BaseModel):
    """Baseline minus AI: positive = the AI did better."""

    stockout_hours_reduced: float
    stockout_hours_reduced_pct: float | None  # None when the baseline had none
    value_saved_bdt: float
    fee_saved_bdt: float
    van_trips_avoided: int  # negative = the AI used more trips
    van_cost_avoided_bdt: float


class ImpactTotals(BaseModel):
    start: date  # local (Asia/Dhaka) dates, inclusive
    end: date
    days: int
    model: ScenarioTotals
    baseline: ScenarioTotals
    delta: ImpactDelta


class SweepPoint(BaseModel):
    alert_share: float
    stockout_hours: float
    van_trips: int
    value_lost_bdt: float


class EqualService(BaseModel):
    """The threshold rule swept over thresholds, read at the AI's level (linear in between).

    None = the AI's value lies outside what the swept thresholds reach.
    """

    baseline_trips_at_ai_stockout_hours: float | None  # rule's trips for the AI's service
    van_trips_avoided: float | None
    baseline_stockout_hours_at_ai_trips: float | None  # rule's service for the AI's van budget
    stockout_hours_avoided: float | None
    sweep: list[SweepPoint]


class ImpactAssumptions(BaseModel):
    alert_share: float
    decision_hours: list[int]
    emergency_eta_h: float
    van_lead_time_h: float
    topup_eta_h: float
    cashout_fee_pct: float
    van_cost_per_trip_bdt: float
    rebalance_horizon_h: int


class ImpactSummary(ImpactTotals):
    scope: str  # "all" or the distributor's code
    n_agents: int
    equal_service: EqualService
    assumptions: ImpactAssumptions
    model_version: str
    generated_at: datetime


class ImpactDay(BaseModel):
    date: date
    model: ScenarioTotals
    baseline: ScenarioTotals
    delta: ImpactDelta


class ImpactComparison(BaseModel):
    scope: str
    n_agents: int
    days: list[ImpactDay]
    totals: ImpactTotals | None  # None when the range misses the holdout
    model_version: str
    generated_at: datetime
