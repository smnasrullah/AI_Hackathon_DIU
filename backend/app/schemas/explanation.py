from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from app.models.enums import FloatType, GeneratedBy, Lang, TxnType


class Reason(BaseModel):
    factor: str  # salary, eid, holiday, hat_bazar, rain, last_week, recent_demand, ...
    impact: float  # BDT change of window demand vs a usual window (signed, rounded)
    direction: Literal["up", "down"]
    share: float  # of the total absolute impact, 0..1
    sentence: str  # template text in `lang`


class AgentExplanation(BaseModel):
    agent_id: int
    target: FloatType
    demand_type: TxnType  # demand explained: cash <- cash_out, emoney <- cash_in
    lang: Lang
    as_of: datetime
    window_hours: int
    unit: Literal["BDT"] = "BDT"
    usual_bdt: float  # model base value: demand of a usual window of this length
    model_version: str
    generated_at: datetime
    generated_by: GeneratedBy = GeneratedBy.template
    reasons: list[Reason]
    # Compact facts + top drivers for the LLM layer (no volatile fields).
    evidence: dict[str, Any]
