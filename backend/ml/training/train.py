"""Train the LightGBM quantile demand forecaster (q10/q50/q90 x cash_out/cash_in).

Direct multi-horizon: one model per target and quantile, horizon 1..72 h is a feature. Training
rows use only targets before HOLDOUT_START; the last 14 days are scored in evaluate.py.

    python -m ml.training.train [--seed 42] [--rounds 300]   (reads DATABASE_URL)
"""

import argparse
import hashlib
import json
import logging
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
from sqlalchemy.orm import Session

from app.core.config import DATA_VERSION, get_settings
from app.core.db import get_engine
from ml.data_gen.timeline import HOLDOUT_START, N_HOURS, hour_index
from ml.features.build import CATEGORICAL, FEATURES, MAX_HORIZON_H, MIN_HISTORY_H, build
from ml.features.panel import TARGETS, Panel, load_panel
from ml.inference.forecaster import Forecaster
from ml.registry import (
    FORECAST_MODEL,
    FORECAST_SEMVER,
    MANIFEST,
    QUANTILES,
    forecast_file,
    sha256_file,
)
from ml.training.evaluate import evaluate

log = logging.getLogger(__name__)
ORIGINS_PER_DAY = 2
HORIZONS_PER_ORIGIN = 12
ROUNDS = 300


def lgb_params(q: float, seed: int) -> dict[str, Any]:
    return {
        "objective": "quantile", "alpha": q, "learning_rate": 0.05, "num_leaves": 31,
        "min_data_in_leaf": 100, "feature_fraction": 0.9, "lambda_l2": 1.0,
        "deterministic": True, "force_row_wise": True, "num_threads": 4, "seed": seed,
        "verbose": -1,
    }


def sample_rows(n_agents: int, holdout_h: int, seed: int
                ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Random (agent, origin, horizon) triples whose target hour is before the holdout."""
    rng = np.random.default_rng(seed)
    days = np.arange(MIN_HISTORY_H // 24, holdout_h // 24)
    n_orig = n_agents * len(days) * ORIGINS_PER_DAY
    agents = np.repeat(np.arange(n_agents), len(days) * ORIGINS_PER_DAY)
    t0 = np.tile(np.repeat(days, ORIGINS_PER_DAY), n_agents) * 24 + rng.integers(0, 24, n_orig)
    rows = np.repeat(agents, HORIZONS_PER_ORIGIN)
    origins = np.repeat(t0, HORIZONS_PER_ORIGIN)
    hs = rng.integers(1, MAX_HORIZON_H + 1, n_orig * HORIZONS_PER_ORIGIN)
    keep = origins + hs - 1 < holdout_h
    return rows[keep], origins[keep], hs[keep]


def fit(panel: Panel, seed: int, rounds: int, holdout_h: int,
        on_step: Callable[[str], None] | None = None) -> tuple[dict[str, list[str]], int]:
    rows, origins, hs = sample_rows(len(panel.agent_ids), holdout_h, seed)
    models: dict[str, list[str]] = {}
    for target in TARGETS:
        x, scale = build(panel, target, rows, origins, hs)
        z = panel.demand[target][rows, origins + hs - 1] / scale
        data = lgb.Dataset(x, label=z, feature_name=list(FEATURES),
                           categorical_feature=list(CATEGORICAL), free_raw_data=False)
        models[target] = []
        for q in QUANTILES:
            booster = lgb.train(lgb_params(q, seed), data, num_boost_round=rounds)
            models[target].append(booster.model_to_string())
            log.info("trained %s q=%.1f on %d rows", target, q, len(z))
            if on_step is not None:
                on_step(f"fit:{target}:q{q}")
    return models, len(rows)


def _write(artifacts_dir: Path, models: dict[str, list[str]]) -> dict[str, str]:
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    files: dict[str, str] = {}
    for target, strings in models.items():
        name = forecast_file(target)
        joblib.dump({str(q): s for q, s in zip(QUANTILES, strings, strict=True)},
                    artifacts_dir / name, compress=3)
        files[name] = sha256_file(artifacts_dir / name)
    return files


def run(artifacts_dir: Path, seed: int, rounds: int = ROUNDS,
        on_step: Callable[[str], None] | None = None) -> dict[str, Any]:
    """`on_step` (admin retrain progress) hears "panel", "fit:<target>:q<q>", "evaluate"."""
    holdout_h = hour_index(HOLDOUT_START)
    with Session(get_engine()) as session:
        panel = load_panel(session)
    if on_step is not None:
        on_step("panel")
    models, n_rows = fit(panel, seed, rounds, holdout_h, on_step)
    if on_step is not None:
        on_step("evaluate")
    boosters = {t: [lgb.Booster(model_str=s) for s in models[t]] for t in TARGETS}
    metrics = evaluate(Forecaster(FORECAST_MODEL, "candidate", boosters), panel, holdout_h,
                       N_HOURS)
    files = _write(artifacts_dir, models)
    digest = hashlib.sha256("".join(files[k] for k in sorted(files)).encode()).hexdigest()
    manifest: dict[str, Any] = {
        "model_version": f"lgbq-{FORECAST_SEMVER}-{digest[:8]}",
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "seed": seed,
        "data_version": DATA_VERSION,
        "files": files,
        "forecast": {
            "model_name": FORECAST_MODEL, "targets": list(TARGETS), "quantiles": list(QUANTILES),
            "max_horizon_h": MAX_HORIZON_H, "features": list(FEATURES), "rounds": rounds,
            "params": lgb_params(0.5, seed) | {"alpha": "per quantile"},
            "train_rows": n_rows, "train_targets_before": HOLDOUT_START.isoformat(),
            "holdout_metrics": metrics,
        },
    }
    (artifacts_dir / MANIFEST).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    log.info("wrote %s (%s)", MANIFEST, manifest["model_version"])
    return manifest


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[train] %(message)s")
    parser = argparse.ArgumentParser(description="Train the quantile demand forecaster")
    parser.add_argument("--seed", type=int, default=get_settings().seed)
    parser.add_argument("--rounds", type=int, default=ROUNDS)
    args = parser.parse_args()
    manifest = run(get_settings().artifacts_dir, args.seed, args.rounds)
    print(json.dumps(manifest["forecast"]["holdout_metrics"], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
