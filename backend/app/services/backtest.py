"""Holdout backtests at bootstrap: impact (F11) and fairness (F12) from one set of inputs.

Skipped when model, data, seed, rules and method are unchanged (same key in both caches).
"""

import json
import logging
from dataclasses import asdict
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import DATA_VERSION, Settings
from app.models import SystemMeta
from app.rules.risk_rules import HEADLINE_HORIZON, build_config
from app.services import fairness, forecast, holdout_inputs, impact, rebalance
from app.services.model_registry import active_model
from ml.registry import FORECAST_MODEL

log = logging.getLogger(__name__)
METHOD = "holdout-1"


def precompute(session: Session, settings: Settings, force: bool = False) -> int:
    """Returns impact rows written (0 when current or skipped)."""
    mv = active_model(session, FORECAST_MODEL)
    if mv is None:
        raise RuntimeError("no active forecast model; run the forecast precompute first")
    rcfg, scfg, ccfg = rebalance.configs(settings)
    cfg = impact.impact_config(settings)
    risk_cfg = build_config(settings.risk_thresholds)
    raw: dict[str, Any] = {
        "model_version": mv.version, "seed": settings.seed, "data_version": DATA_VERSION,
        "events": forecast.events_fingerprint(session), "method": METHOD,
        "impact": asdict(cfg), "rebalance": asdict(rcfg), "swap": asdict(scfg),
        "channel": asdict(ccfg), "risk": risk_cfg.as_dict()}
    key = json.loads(json.dumps(raw))  # tuples -> lists, as stored
    metas = [session.get(SystemMeta, k) for k in (impact.CACHE_KEY, fairness.CACHE_KEY)]
    if not force and all(m is not None and m.value.get("key") == key for m in metas):
        log.info("holdout backtests current (%s)", mv.version)
        return 0
    horizon = max(rcfg.horizon_h, fairness.HORIZON_H)
    h = holdout_inputs.load(session, settings, cfg, horizon)
    if h is None:
        return 0
    n = impact.store(session, h, mv, cfg, rcfg, scfg, ccfg, key)
    fairness.store(session, h, mv, risk_cfg.cuts[HEADLINE_HORIZON].amber, settings.seed, key)
    return n
