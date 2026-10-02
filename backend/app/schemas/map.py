from datetime import datetime

from pydantic import BaseModel

from app.models.enums import FloatType, RiskLevelCode, SwapStatus


class MapAgent(BaseModel):
    agent_id: int
    code: str
    name: str
    district: str
    upazila: str | None
    lat: float
    lng: float
    level: RiskLevelCode  # worst float at at_hour
    probability: float  # highest float P(stockout by at_hour)
    worst_float: FloatType


class MapSwap(BaseModel):
    id: int
    donor_agent_id: int
    receiver_agent_id: int
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float
    float_type: FloatType
    amount_bdt: float
    status: SwapStatus  # pending | approved (rejected swaps are not shown)
    van_trip_saved: bool
    # The receiver's swapped float is amber/red at at_hour: draw the arrow.
    relevant: bool


class MapAgents(BaseModel):
    at_hour: int
    as_of: datetime
    ts: datetime  # as_of + at_hour
    agents: list[MapAgent]
    swaps: list[MapSwap]
    model_version: str
    generated_at: datetime
