from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.enums import FloatType, TxnType


class ForecastPoint(BaseModel):
    ts: datetime  # start of the forecast hour (UTC)
    horizon_h: int
    low: float  # q10, BDT
    expected: float  # q50, BDT
    high: float  # q90, BDT


class FloatForecast(BaseModel):
    float_type: FloatType
    # Demand that draws this float down: cash float <- cash_out, e-money float <- cash_in.
    demand_type: TxnType
    points: list[ForecastPoint]


class AgentForecast(BaseModel):
    agent_id: int
    as_of: datetime  # simulated "now" the forecast was issued at
    horizon_hours: int
    unit: Literal["BDT"] = "BDT"
    model_version: str
    generated_at: datetime
    floats: list[FloatForecast]
