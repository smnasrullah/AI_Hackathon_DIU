"""Allow-listed, read-only tools the copilot may request. A request is validated JSON
(`ToolCall`, extra fields forbidden); anything else is rejected. The backend executes it against
the caller's scoped agent only and returns a compact, deterministic evidence dict (no volatile
fields), so the response cache and replay keys stay stable."""

import json
from datetime import datetime, timedelta
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError, model_validator
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.llm.packs import day_of, hm
from app.models import Agent, User
from app.models.enums import FloatType
from app.rules.risk_rules import HEADLINE_HORIZON, build_config
from app.schemas.whatif import MAX_DELTA_BDT, WhatIfIn, WhatIfScenario
from app.services import swaps, whatif
from app.services.forecast import agent_forecast
from ml.features.build import MAX_HORIZON_H

ALLOWED = ("get_whatif", "get_swap_status", "get_forecast_window")
MAX_SWAPS = 3


class _Call(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class WhatIfCall(_Call):
    tool: Literal["get_whatif"]
    float_type: FloatType
    delta_amount: float = Field(ge=-MAX_DELTA_BDT, le=MAX_DELTA_BDT, allow_inf_nan=False)


class SwapStatusCall(_Call):
    tool: Literal["get_swap_status"]


class ForecastWindowCall(_Call):
    tool: Literal["get_forecast_window"]
    from_h: int = Field(ge=0, lt=MAX_HORIZON_H)  # hours after the forecast's as-of time
    to_h: int = Field(gt=0, le=MAX_HORIZON_H)

    @model_validator(mode="after")
    def _ordered(self) -> "ForecastWindowCall":
        if self.from_h >= self.to_h:
            raise ValueError("from_h must be before to_h")
        return self


ToolCall = Annotated[WhatIfCall | SwapStatusCall | ForecastWindowCall,
                     Field(discriminator="tool")]
_ADAPTER: TypeAdapter[ToolCall] = TypeAdapter(ToolCall)


class ToolRejected(Exception):
    pass


def parse_request(raw: str | dict[str, Any]) -> ToolCall:
    """Validate a tool request; ToolRejected for unknown tools, extra or bad arguments."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(data, dict) or data.get("tool") not in ALLOWED:
            raise ToolRejected("tool_not_allowed")
        return _ADAPTER.validate_python(data)
    except (ValueError, ValidationError) as exc:
        raise ToolRejected("invalid_arguments") from exc


def _scenario(s: WhatIfScenario, as_of: datetime) -> dict[str, Any]:
    return {"balance_bdt": round(s.balance), "level_24h": s.level.value,
            "hours_to_stockout": None if s.hours_to_stockout is None
            else round(s.hours_to_stockout, 1),
            "stockout_time": hm(s.stockout_at) if s.stockout_at else None,
            "stockout_day": day_of(s.stockout_at, as_of) if s.stockout_at else None,
            "confidence": round(s.confidence, 2)}


def _whatif(session: Session, settings: Settings, agent: Agent, call: WhatIfCall
            ) -> dict[str, Any]:
    base = {"float_type": call.float_type.value, "delta_bdt": round(call.delta_amount)}
    try:
        out = whatif.run(session, agent, WhatIfIn(float_type=call.float_type,
                                                  delta_amount=call.delta_amount),
                         build_config(settings.risk_thresholds), settings.seed)
    except whatif.WhatIfError:
        return {**base, "status": "out_of_bounds"}
    if out is None:
        return {**base, "status": "not_ready"}
    return {**base, "status": "ok", "capacity_bdt": round(out.capacity),
            "horizon_h": MAX_HORIZON_H, "headline_h": HEADLINE_HORIZON,
            "before": _scenario(out.before, out.as_of), "after": _scenario(out.after, out.as_of),
            "model_version": out.model_version}


def _swaps(session: Session, user: User, agent: Agent) -> dict[str, Any]:
    if not swaps.is_ready(session):
        return {"status": "not_ready"}
    mine = [s for s in swaps.all_items(session, user, None)
            if agent.id in (s.donor.agent_id, s.receiver.agent_id)]
    items = []
    for s in mine[:MAX_SWAPS]:
        gives = s.donor.agent_id == agent.id
        me, partner = (s.donor, s.receiver) if gives else (s.receiver, s.donor)
        items.append({"id": s.id, "role": "give" if gives else "receive",
                      "float_type": s.float_type.value, "amount_bdt": round(s.amount_bdt),
                      "partner": {"code": partner.code, "name": partner.name},
                      "distance_km": round(s.distance_km, 1), "status": s.status.value,
                      "my_response": me.response.value if me.response else None})
    model_version = next((s.model_version for s in mine if s.model_version), None)
    return {"status": "ok", "total": len(mine), "items": items, "model_version": model_version}


def _forecast(session: Session, agent: Agent, call: ForecastWindowCall) -> dict[str, Any]:
    fc = agent_forecast(session, agent.id, call.to_h)
    if fc is None:
        return {"status": "not_ready"}
    start, end = fc.as_of + timedelta(hours=call.from_h), fc.as_of + timedelta(hours=call.to_h)
    floats = []
    for f in fc.floats:
        pts = [p for p in f.points if call.from_h < p.horizon_h <= call.to_h]
        floats.append({"float_type": f.float_type.value, "demand_type": f.demand_type.value,
                       **{f"{k}_bdt": int(round(sum(getattr(p, k) for p in pts), -2))
                          for k in ("low", "expected", "high")}})
    return {"status": "ok", "from_h": call.from_h, "to_h": call.to_h,
            "from_time": hm(start), "from_day": day_of(start, fc.as_of),
            "to_time": hm(end), "to_day": day_of(end, fc.as_of), "floats": floats,
            "model_version": fc.model_version}


def execute(session: Session, settings: Settings, user: User, agent: Agent, call: ToolCall
            ) -> dict[str, Any]:
    """Run one validated tool for the caller's scoped `agent` (callers check scope first)."""
    if isinstance(call, WhatIfCall):
        return _whatif(session, settings, agent, call)
    if isinstance(call, SwapStatusCall):
        return _swaps(session, user, agent)
    return _forecast(session, agent, call)
