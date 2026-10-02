"""Isolation Forest per peer group: scores agent windows (F9). Flags are leads, never verdicts."""

from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from ml.features.anomaly import FEATURES, GLOBAL_GROUP
from ml.inference.forecaster import ArtifactError
from ml.registry import ANOMALY_FILE, ANOMALY_MANIFEST, read_manifest, verify_anomaly


@dataclass(frozen=True)
class Detector:
    version: str
    models: dict[str, IsolationForest]  # peer group -> forest; GLOBAL_GROUP always present

    def model_for(self, group: str) -> IsolationForest:
        return self.models.get(group, self.models[GLOBAL_GROUP])

    def score(self, x: np.ndarray, groups: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Score in (0, 1), higher = easier to isolate, and each row's group threshold.

        score = -score_samples (the Liu et al. 2^(-E[h]/c(n)) score); a row is flagged when
        score > threshold = -offset_, i.e. the forest's `contamination` cut.
        """
        score, threshold = np.zeros(len(x)), np.zeros(len(x))
        for g in np.unique(groups):
            m, forest = groups == g, self.model_for(str(g))
            score[m] = -forest.score_samples(x[m])
            threshold[m] = -float(forest.offset_)
        return score, threshold


def load_detector(artifacts_dir: Path) -> Detector:
    ok, why = verify_anomaly(artifacts_dir)
    manifest = read_manifest(artifacts_dir, ANOMALY_MANIFEST)
    if not ok or manifest is None:
        raise ArtifactError(f"anomaly artifacts invalid: {why}")
    blob = joblib.load(artifacts_dir / ANOMALY_FILE)
    if tuple(blob["features"]) != FEATURES or GLOBAL_GROUP not in blob["models"]:
        raise ArtifactError("anomaly artifact does not match the feature list")
    return Detector(str(manifest["model_version"]), blob["models"])
