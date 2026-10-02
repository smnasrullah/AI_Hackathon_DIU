"""What-if (F8): re-project one float from the cached quantile paths with balance + delta.

Same seed and Monte Carlo config as the risk cache, so `before` reproduces the cached numbers.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent, FloatSnapshot
from app.models.enums import FloatType
from app.rules.risk_rules import HEADLINE_HORIZON, HORIZONS, RiskConfig, level_confidence, level_for
from app.schemas.risk import HorizonRisk
from app.schemas.whatif import BalancePoint, WhatIfIn, WhatIfOut, WhatIfScenario
from app.services import forecast, risk
from app.services.model_registry import active_model
from ml.inference import whatif
from ml.inference.stockout import StockoutConfig
from ml.registry import FORECAST_MODEL


class WhatIfError(Exception):
    """delta_out_of_bounds (422)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _scenario(s: whatif.Scenario, now: datetime, cfg: RiskConfig) -> WhatIfScenario:
    res = s.result
    horizons: list[HorizonRisk] = []
    for h in HORIZONS:
        p = round(res.prob_within(h), 4)
        horizons.append(HorizonRisk(horizon_h=h, probability=p, level=level_for(p, h, cfg),
                                    confidence=round(level_confidence(p), 4)))
    return WhatIfScenario(
        balance=round(s.balance, 2),
        stockout_at=None if res.hours is None else now + timedelta(hours=res.hours),
        hours_to_stockout=None if res.hours is None else round(res.hours, 2),
        confidence=round(res.confidence, 4),
        level=next(r.level for r in horizons if r.horizon_h == HEADLINE_HORIZON),
        horizons=horizons,
        series=[BalancePoint(ts=now + timedelta(hours=h), hour=h, low=round(float(lo), 2),
                             expected=round(float(mid), 2), high=round(float(hi), 2))
                for h, (lo, mid, hi) in enumerate(s.bands)],
    )


def run(session: Session, agent: Agent, req: WhatIfIn, cfg: RiskConfig, seed: int
        ) -> WhatIfOut | None:
    """None when the forecast cache or the as-of balance is missing (not ready)."""
    mv = active_model(session, FORECAST_MODEL)
    if mv is None:
        return None
    now = forecast.sim_now(session)
    snap = session.scalar(select(FloatSnapshot).where(FloatSnapshot.agent_id == agent.id,
                                                      FloatSnapshot.ts == now))
    quantiles = risk.load_quantiles(session, mv.id, max(HORIZONS), agent.id)
    ft = req.float_type
    drain, inflow = quantiles.get((agent.id, ft)), quantiles.get((agent.id, risk.INFLOW_OF[ft]))
    if snap is None or drain is None or inflow is None:
        return None
    b0 = float(snap.cash_balance if ft == FloatType.cash else snap.emoney_balance)
    capacity = float(agent.cash_capacity if ft == FloatType.cash else agent.emoney_capacity)
    # A float may sit above its nominal capacity; it can then only be drawn down.
    if not 0 <= b0 + req.delta_amount <= max(capacity, b0):
        raise WhatIfError("delta_out_of_bounds")
    before, after = whatif.run(b0, req.delta_amount, drain, inflow, StockoutConfig(),
                               risk.path_rng(seed, agent.id, ft))
    return WhatIfOut(
        agent_id=agent.id, float_type=ft, delta_amount=req.delta_amount, capacity=capacity,
        as_of=now, before=_scenario(before, now, cfg), after=_scenario(after, now, cfg),
        model_version=mv.version, generated_at=datetime.now(UTC),
    )
