"""Role-scoped evidence packs, built deterministically from the rules/ML read services.

Callers resolve scope first (ScopedAgent, scoped anomaly/risk queries), so a pack only ever holds
data the caller may see. No volatile fields (generated_at): replay and cache keys stay stable.
Clock times are given in local time (Asia/Dhaka) as the UI shows them.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.llm.numbers import BDT
from app.models import Agent, User
from app.models.enums import FLOAT_DEMAND, AnomalyStatus, FloatType, LlmIntent, SwapStatus
from app.rules.risk_rules import HEADLINE_HORIZON
from app.services import anomalies, explanation, recommendation_read, risk_read, swaps
from app.services.evidence import evidence_pack
from ml.explain import drivers as drv

PACK_VERSION = 1
TOP_AGENTS = 5


@dataclass(frozen=True)
class Pack:
    intent: LlmIntent
    data: dict[str, Any]
    model_version: str | None

    @property
    def factors(self) -> set[str]:
        return set(self.data.get("factors", []))


def hm(ts: datetime) -> str:
    return ts.astimezone(BDT).strftime("%H:%M")


def day_of(ts: datetime, as_of: datetime) -> str:
    days = (ts.astimezone(BDT).date() - as_of.astimezone(BDT).date()).days
    return "today" if days <= 0 else "tomorrow" if days == 1 else "later"


def narrate(session: Session, agent: Agent, float_type: FloatType) -> Pack | None:
    if (hit := explanation.load(session, agent.id, float_type)) is None:
        return None
    mv, row = hit
    data = evidence_pack(session, agent, mv, row)
    data["factors"] = [d["factor"] for d in data["drivers"]]
    return Pack(LlmIntent.narrate, data, mv.version)


def _top_driver(session: Session, agent: Agent, ft: FloatType) -> dict[str, Any] | None:
    if (hit := explanation.load(session, agent.id, ft)) is None:
        return None
    top = drv.top([drv.Driver.from_json(x) for x in hit[1].drivers])
    if not top:
        return None
    d = top[0]
    return {"factor": d.factor, "impact_bdt": d.impact_bdt, "facts": d.facts,
            "window_h": hit[1].window_h}


def agent_briefing(session: Session, agent: Agent) -> Pack | None:
    summary = risk_read.agent_summary(session, agent)
    if summary is None:
        return None
    as_of = summary.as_of
    floats: list[dict[str, Any]] = []
    for f in summary.floats:
        h24 = next((h for h in f.horizons if h.horizon_h == HEADLINE_HORIZON), None)
        floats.append({
            "float_type": f.float_type.value, "demand_type": FLOAT_DEMAND[f.float_type].value,
            "balance_bdt": round(f.balance), "level_24h": f.level.value,
            "probability_24h": round(h24.probability, 2) if h24 else None,
            "hours_to_stockout": None if f.hours_to_stockout is None
            else round(f.hours_to_stockout, 1),
            "stockout_time": hm(f.stockout_at) if f.stockout_at else None,
            "stockout_day": day_of(f.stockout_at, as_of) if f.stockout_at else None,
            "confidence": round(f.confidence, 2),
            "top_driver": _top_driver(session, agent, f.float_type),
        })
    rec = recommendation_read.agent_recommendation(session, agent)
    actions = [{"kind": r.kind.value, "channel": r.channel.value if r.channel else None,
                "float_type": r.float_type.value, "amount_bdt": round(r.amount_bdt),
                "deadline_time": hm(r.deadline_at), "deadline_day": day_of(r.deadline_at, as_of),
                "urgent": r.rationale.urgent} for r in (rec.items if rec else [])]
    data = {
        "v": PACK_VERSION, "agent": {"id": agent.id, "code": agent.code,
                                     "district": agent.district},
        "as_of": as_of.isoformat(), "model_version": summary.model_version, "unit": "BDT",
        "horizon_h": HEADLINE_HORIZON, "level": summary.level.value, "floats": floats,
        "actions": actions,
        "factors": sorted({f["top_driver"]["factor"] for f in floats if f["top_driver"]}),
    }
    return Pack(LlmIntent.agent_briefing, data, summary.model_version)


def anomaly(session: Session, user: User, anomaly_id: int) -> Pack:
    """AnomalyError (forbidden / not_found) when out of scope, as the anomaly API."""
    d = anomalies.detail(session, user, anomaly_id)
    reasons = [r.model_dump() for r in d.reasons]
    data = {
        "v": PACK_VERSION, "anomaly_id": d.id,
        "agent": {"id": d.agent.agent_id, "code": d.agent.code, "district": d.agent.district},
        "window_start": d.window_start.astimezone(BDT).strftime("%Y-%m-%d %H:%M"),
        "window_end": d.window_end.astimezone(BDT).strftime("%Y-%m-%d %H:%M"),
        "window_h": d.window_h, "score": round(d.score, 2), "threshold": round(d.threshold, 2),
        "peer_group": d.peer_group, "peer_count": d.peer_count,
        "reasons": [{**r, "value": round(r["value"], 2), "peer_median": round(r["peer_median"], 2),
                     "deviation": round(r["deviation"], 1)} for r in reasons],
        "context": d.context.model_dump(), "status": d.status.value,
        "model_version": d.model_version, "unit": "BDT",
        "factors": [r["feature"] for r in reasons],
    }
    return Pack(LlmIntent.anomaly_narrative, data, d.model_version)


def distributor(session: Session, user: User) -> Pack | None:
    """Distributor: own agents; admin: all agents."""
    page = risk_read.risk_page(session, user, HEADLINE_HORIZON, None, "risk", 1, 100_000, None)
    if page is None:
        return None
    counts = {lvl: sum(1 for r in page.items if r.level.value == lvl)
              for lvl in ("red", "amber", "green")}
    top = [{"code": r.code, "district": r.district, "level": r.level.value,
            "probability": round(r.probability, 2), "worst_float": r.worst_float.value,
            "hours_to_stockout": None if r.hours_to_stockout is None
            else round(r.hours_to_stockout, 1)}
           for r in page.items[:TOP_AGENTS] if r.level.value != "green"]
    pending = (len(swaps.all_items(session, user, SwapStatus.pending))
               if swaps.is_ready(session) else 0)
    open_flags = (anomalies.anomaly_page(session, user, AnomalyStatus.open, 1, 1).total
                  if anomalies.is_ready(session) else 0)
    data = {
        "v": PACK_VERSION, "scope": "all" if user.distributor_id is None
        else f"distributor:{user.distributor_id}",
        "as_of": page.as_of.isoformat() if page.as_of else None,
        "model_version": page.model_version, "horizon_h": HEADLINE_HORIZON,
        "agents_total": page.total, "levels": counts, "top": top,
        "swaps_pending": pending, "anomalies_open": open_flags, "factors": [],
    }
    return Pack(LlmIntent.distributor_briefing, data, page.model_version)
