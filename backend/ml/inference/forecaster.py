"""Quantile demand forecaster: low / expected / high per target for one origin."""

from dataclasses import dataclass
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np

from ml.features.build import build, grid
from ml.features.panel import TARGETS, Panel
from ml.registry import FORECAST_MODEL, QUANTILES, forecast_file, read_manifest, verify


class ArtifactError(RuntimeError):
    pass


@dataclass
class Forecaster:
    model_name: str
    model_version: str
    boosters: dict[str, list[lgb.Booster]]  # target -> boosters in QUANTILES order

    @classmethod
    def load(cls, artifacts_dir: Path) -> "Forecaster":
        ok, why = verify(artifacts_dir)
        manifest = read_manifest(artifacts_dir)
        if not ok or manifest is None:
            raise ArtifactError(f"forecast artifacts invalid: {why}")
        boosters: dict[str, list[lgb.Booster]] = {}
        for target in TARGETS:
            blob: dict[str, str] = joblib.load(artifacts_dir / forecast_file(target))
            boosters[target] = [lgb.Booster(model_str=blob[str(q)]) for q in QUANTILES]
        return cls(FORECAST_MODEL, str(manifest["model_version"]), boosters)

    def predict_rows(self, panel: Panel, target: str, rows: np.ndarray, origins: np.ndarray,
                     horizons: np.ndarray) -> np.ndarray:
        """(n, 3) BDT [low, expected, high]: clipped at 0 and sorted so low <= mid <= high."""
        x, scale = build(panel, target, rows, origins, horizons)
        z = np.column_stack([b.predict(x, num_threads=1) for b in self.boosters[target]])
        return np.sort(np.maximum(z, 0.0), axis=1) * scale[:, None]

    def predict_origin(self, panel: Panel, origin: int, horizon: int) -> dict[str, np.ndarray]:
        """target -> (agents, horizon, 3) for every panel agent, horizons 1..horizon."""
        rows, origins, hs = grid(len(panel.agent_ids), origin, horizon)
        return {t: self.predict_rows(panel, t, rows, origins, hs).reshape(-1, horizon, 3)
                for t in TARGETS}
