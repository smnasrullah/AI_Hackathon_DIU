"""Train the per-peer-group Isolation Forests (F9) and score them against injected anomalies.

Unsupervised: labels (system_meta.synthetic_labels) are used only for evaluation. Training
windows end on or before HOLDOUT_START; the 14-day holdout is scored, never fitted.

    python -m ml.training.anomaly [--seed 42]   (reads DATABASE_URL)
"""

import argparse
import hashlib
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sqlalchemy.orm import Session

from app.core.config import DATA_VERSION, get_settings
from app.core.db import get_engine
from app.models.system_meta import SystemMeta
from ml.data_gen.timeline import HOLDOUT_START, N_HOURS, hour_index
from ml.features.anomaly import (
    FEATURES,
    GLOBAL_GROUP,
    HISTORY_H,
    MIN_PEERS,
    STRIDE_H,
    WINDOW_H,
    Series,
    load_series,
    window_features,
)
from ml.features.panel import hour_of
from ml.inference.anomaly import Detector
from ml.registry import ANOMALY_FILE, ANOMALY_MANIFEST, ANOMALY_MODEL, ANOMALY_SEMVER, sha256_file

log = logging.getLogger(__name__)
N_TREES = 200
# Share of windows each forest flags. Smallest value whose pre-holdout recall >= 0.85
# (sweep in docs/METHODS.md); ~1.5 of 300 agents per weekly window to review.
CONTAMINATION = 0.005
# A window counts as a true anomaly when >= 3 of its 7 days overlap an injected one; windows
# with a smaller, non-zero overlap are ambiguous and left out of precision/recall.
EVAL_MIN_OVERLAP_H = 72


def stack(s: Series, ends: range) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Features for every agent x window end: (rows, F), agent row index, window end."""
    xs = [window_features(s, e).x for e in ends]
    n = len(s.agent_ids)
    return (np.vstack(xs), np.tile(np.arange(n), len(xs)),
            np.repeat(np.array(list(ends), dtype=np.int64), n))


def fit(s: Series, seed: int, holdout_h: int) -> tuple[Detector, dict[str, int]]:
    x, rows, _ = stack(s, range(WINDOW_H + HISTORY_H, holdout_h + 1, STRIDE_H))
    groups = np.array(s.groups)[rows]
    models: dict[str, IsolationForest] = {}
    sizes: dict[str, int] = {}
    for g in sorted(set(s.groups) | {GLOBAL_GROUP}):
        m = np.ones(len(x), dtype=bool) if g == GLOBAL_GROUP else groups == g
        models[g] = IsolationForest(n_estimators=N_TREES, contamination=CONTAMINATION,
                                    random_state=seed).fit(x[m])
        sizes[g] = int(m.sum())
        log.info("fitted group %s on %d windows", g, sizes[g])
    return Detector("candidate", models), sizes


def label_spans(labels: list[dict[str, str]]) -> dict[str, list[tuple[int, int, str]]]:
    out: dict[str, list[tuple[int, int, str]]] = {}
    for lab in labels:
        span = (hour_of(datetime.fromisoformat(lab["window_start"])),
                hour_of(datetime.fromisoformat(lab["window_end"])), lab["kind"])
        out.setdefault(lab["agent_code"], []).append(span)
    return out


def _overlap(spans: list[tuple[int, int, str]], end: int) -> tuple[int, str | None]:
    best, kind = 0, None
    for a, b, k in spans:
        o = max(0, min(b, end) - max(a, end - WINDOW_H))
        if o > best:
            best, kind = o, k
    return best, kind


def _ratio(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


def evaluate(det: Detector, s: Series, spans: dict[str, list[tuple[int, int, str]]],
             ends: range) -> dict[str, Any]:
    """Window- and agent-level precision/recall of the flags against the injected labels."""
    x, rows, end_of = stack(s, ends)
    score, thr = det.score(x, np.array(s.groups)[rows])
    flag = score > thr
    found = [_overlap(spans.get(s.codes[r], []), int(e)) for r, e in zip(rows, end_of, strict=True)]
    pos = np.array([o >= EVAL_MIN_OVERLAP_H for o, _ in found])
    keep = pos | np.array([o == 0 for o, _ in found])
    tp, fp = int((flag & pos).sum()), int((flag & keep & ~pos).sum())
    fn = int((~flag & pos).sum())
    by_kind: dict[str, dict[str, int]] = {}
    for i in np.flatnonzero(pos):
        k = by_kind.setdefault(str(found[i][1]), {"windows": 0, "flagged": 0})
        k["windows"] += 1
        k["flagged"] += int(flag[i])
    true_agents = {int(r) for r in rows[pos]}
    flagged_agents = {int(r) for r in rows[flag & keep]}
    hit = len(true_agents & flagged_agents)
    return {
        "windows": int(keep.sum()), "excluded_ambiguous": int((~keep).sum()),
        "positives": int(pos.sum()), "flagged": int((flag & keep).sum()),
        "tp": tp, "fp": fp, "fn": fn,
        "precision": _ratio(tp, tp + fp), "recall": _ratio(tp, tp + fn),
        "recall_by_kind": {k: _ratio(v["flagged"], v["windows"]) for k, v in sorted(
            by_kind.items())},
        "agents_true": len(true_agents), "agents_flagged": len(flagged_agents),
        "agent_precision": _ratio(hit, len(flagged_agents)),
        "agent_recall": _ratio(hit, len(true_agents)),
    }


def _labels(session: Session) -> list[dict[str, str]]:
    row = session.get(SystemMeta, "synthetic_labels")
    value = row.value if row else None
    return list(value.get("anomalies", [])) if isinstance(value, dict) else []


def run(artifacts_dir: Path, seed: int) -> dict[str, Any]:
    holdout_h = hour_index(HOLDOUT_START)
    with Session(get_engine()) as session:
        s = load_series(session)
        spans = label_spans(_labels(session))
    det, sizes = fit(s, seed, holdout_h)
    first = WINDOW_H + HISTORY_H
    metrics = {
        "holdout": evaluate(det, s, spans, range(holdout_h + WINDOW_H, N_HOURS + 1, STRIDE_H)),
        "train_period": evaluate(det, s, spans, range(first, holdout_h + 1, STRIDE_H)),
    }
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump({"features": list(FEATURES), "models": det.models}, artifacts_dir / ANOMALY_FILE,
                compress=3)
    digest = sha256_file(artifacts_dir / ANOMALY_FILE)
    short = hashlib.sha256(digest.encode()).hexdigest()[:8]
    manifest: dict[str, Any] = {
        "model_version": f"iforest-{ANOMALY_SEMVER}-{short}",
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "seed": seed, "data_version": DATA_VERSION,
        "files": {ANOMALY_FILE: digest},
        "anomaly": {
            "model_name": ANOMALY_MODEL, "features": list(FEATURES), "window_h": WINDOW_H,
            "history_h": HISTORY_H, "stride_h": STRIDE_H, "n_estimators": N_TREES,
            "contamination": CONTAMINATION, "min_peers": MIN_PEERS, "group_windows": sizes,
            "train_windows_end_before": HOLDOUT_START.isoformat(),
            "eval_min_overlap_h": EVAL_MIN_OVERLAP_H, "metrics": metrics,
        },
    }
    (artifacts_dir / ANOMALY_MANIFEST).write_text(json.dumps(manifest, indent=2),
                                                  encoding="utf-8")
    log.info("wrote %s (%s)", ANOMALY_MANIFEST, manifest["model_version"])
    return manifest


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[train-anomaly] %(message)s")
    parser = argparse.ArgumentParser(description="Train the agent anomaly detector")
    parser.add_argument("--seed", type=int, default=get_settings().seed)
    args = parser.parse_args()
    manifest = run(get_settings().artifacts_dir, args.seed)
    print(json.dumps(manifest["anomaly"]["metrics"], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
