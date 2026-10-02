"""Hand-made market for recommendation + swap tests (flat forecasts -> exact answers).

AGT-0001 (Mirpur, DST-DHK) runs out of cash at 5.5 h -> red receiver. AGT-9001 sits ~0.4 km
away with spare cash -> donor. AGT-9002 has spare cash too but is ~7.7 km away (Uttara).
AGT-0002 (DST-CTG) is also short of cash but has no donor in its territory.
"""

from datetime import UTC, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.core.db import get_engine
from app.models import Agent, Distributor, FloatSnapshot, Forecast, ModelVersion
from app.models.enums import FloatType, UrbanRural
from app.rules.rebalance_rules import RebalanceConfig
from app.rules.risk_rules import build_config
from app.rules.swap_rules import SwapConfig
from app.services import rebalance, risk
from ml.data_gen.timeline import SIM_NOW
from ml.registry import FORECAST_MODEL

NOW = SIM_NOW.astimezone(UTC)
RCFG, SCFG = RebalanceConfig(), SwapConfig(radius_km=5, min_amount_bdt=5_000)
# code -> (cash balance, e-money balance, cash_out per hour, cash_in per hour)
MARKET: dict[str, tuple[float, float, float, float]] = {
    "AGT-0001": (5_500, 100_000, 1_000, 0),
    "AGT-0002": (5_500, 100_000, 1_000, 0),
    "AGT-0003": (60_000, 60_000, 0, 0),
    "AGT-9001": (90_000, 50_000, 0, 0),
    "AGT-9002": (90_000, 50_000, 0, 0),
}
EXTRA = {"AGT-9001": ("Mirpur 11 Point", "Mirpur", 23.8100, 90.3700),
         "AGT-9002": ("Uttara Sector 7 Store", "Uttara", 23.8759, 90.3795)}


def _flat(mv: int, agent: int, cash_out: float, cash_in: float) -> list[dict[str, Any]]:
    rows = []
    for ft, v in ((FloatType.cash, cash_out), (FloatType.emoney, cash_in)):
        rows += [{"model_version_id": mv, "agent_id": agent, "float_type": ft,
                  "ts": NOW + timedelta(hours=h - 1), "horizon_h": h, "q_low": v, "q_mid": v,
                  "q_high": v, "generated_at": NOW} for h in range(1, 73)]
    return rows


def build_market() -> int:
    """Seeded DB -> forecasts, risk, recommendations, swaps. Returns recommendations written."""
    with Session(get_engine()) as session, session.begin():
        dhk = session.scalar(select(Distributor.id).where(Distributor.code == "DST-DHK"))
        assert dhk is not None
        for code, (name, upazila, lat, lng) in EXTRA.items():
            session.add(Agent(code=code, name=name, distributor_id=dhk, region="Dhaka",
                              district="Dhaka", upazila=upazila, urban_rural=UrbanRural.urban,
                              tier=2, lat=lat, lng=lng, cash_capacity=Decimal("100000"),
                              emoney_capacity=Decimal("100000")))
        mv = ModelVersion(model_name=FORECAST_MODEL, version="test-flat", trained_at=NOW,
                          artifact_sha256="0" * 64, metrics={}, is_active=True)
        session.add(mv)
        session.flush()
        ids = dict(session.execute(select(Agent.code, Agent.id)).tuples().all())
        for code, (cash, em, out, cin) in MARKET.items():
            session.add(FloatSnapshot(agent_id=ids[code], ts=NOW, cash_balance=Decimal(cash),
                                      emoney_balance=Decimal(em)))
            session.execute(insert(Forecast), _flat(mv.id, ids[code], out, cin))
        risk.precompute(session, build_config(), seed=42)
        return rebalance.precompute(session, RCFG, SCFG)
