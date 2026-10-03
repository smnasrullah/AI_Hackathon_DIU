"""Precompute every cache the app serves (bootstrap and the admin data job share this)."""

import logging
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import get_engine
from app.rules.risk_rules import build_config
from app.services import anomaly_scan, backtest, forecast, rebalance, risk
from ml import registry
from ml.training import anomaly as anomaly_train

log = logging.getLogger(__name__)

Step = Callable[[str], None]


def precompute(settings: Settings, on_step: Step | None = None) -> None:
    """Register the active models; cache forecasts, stockout + risk, rebalance + swaps, anomalies,
    holdout impact + fairness. Each stage skips itself when its inputs are unchanged.

    The anomaly forests train in seconds, so missing/invalid anomaly artifacts are refitted here.
    """
    step = on_step or (lambda _name: None)
    ok, why = registry.verify_anomaly(settings.artifacts_dir)
    if not ok:
        log.warning("anomaly artifacts need training: %s", why)
        anomaly_train.run(settings.artifacts_dir, settings.seed)
    with Session(get_engine()) as session, session.begin():
        step("forecast")
        forecast.precompute(session, settings.artifacts_dir)
        step("risk")
        risk.precompute(session, build_config(settings.risk_thresholds), settings.seed)
        step("rebalance")
        rebalance.precompute(session, *rebalance.configs(settings))
        step("anomalies")
        anomaly_scan.precompute(session, settings.artifacts_dir)
        step("backtest")
        backtest.precompute(session, settings)
