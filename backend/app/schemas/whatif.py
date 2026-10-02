from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import FloatType, RiskLevelCode
from app.schemas.risk import HorizonRisk

# Coarse guard only; the real bound is 0 <= balance + delta <= capacity (422 delta_out_of_bounds).
MAX_DELTA_BDT = 10_000_000


class WhatIfIn(BaseModel):
    float_type: FloatType
    delta_amount: float = Field(ge=-MAX_DELTA_BDT, le=MAX_DELTA_BDT, allow_inf_nan=False)


class BalancePoint(BaseModel):
    ts: datetime  # end of hour `hour` (hour 0 = as_of)
    hour: int
    low: float  # p10 projected balance, BDT, no refill, floored at 0
    expected: float  # p50
    high: float  # p90


class WhatIfScenario(BaseModel):
    balance: float  # BDT at as_of
    stockout_at: datetime | None
    hours_to_stockout: float | None
    confidence: float
    level: RiskLevelCode  # at the headline horizon (24 h)
    horizons: list[HorizonRisk]
    series: list[BalancePoint]  # hour 0..72


class WhatIfOut(BaseModel):
    agent_id: int
    float_type: FloatType
    delta_amount: float
    capacity: float
    as_of: datetime
    unit: Literal["BDT"] = "BDT"
    before: WhatIfScenario  # equals the cached stockout + risk
    after: WhatIfScenario
    model_version: str
    generated_at: datetime
    advisory: Literal[True] = True
