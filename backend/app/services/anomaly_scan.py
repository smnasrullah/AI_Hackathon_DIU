"""Anomaly cache: every agent's last 7 days before SIM_NOW scored by its peer group's forest.

Only flagged windows are stored, with their peer evidence. Re-running replaces open flags;
reviewed ones (confirmed / dismissed) stay with their audit trail and are not re-flagged.
"""

import logging
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Anomaly, SystemMeta
from app.models.enums import AnomalyStatus
from app.services import forecast, notify
from app.services.model_registry import register_anomaly_model
from ml.explain.anomaly_evidence import evidence
from ml.features.anomaly import WINDOW_H, load_series, window_features
from ml.features.panel import hour_of, ts_of
from ml.inference.anomaly import load_detector

log = logging.getLogger(__name__)
CACHE_KEY = "anomaly_cache"
METHOD = "iforest-peer-window-1"


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def precompute(session: Session, artifacts_dir: Path, force: bool = False) -> int:
    """Score all agents at SIM_NOW; returns flags written (0 when the cache is current)."""
    mv = register_anomaly_model(session, artifacts_dir)
    now = forecast.sim_now(session)
    data = session.get(SystemMeta, "data_version")
    key = {"model_version": mv.version, "sim_now": now.isoformat(), "method": METHOD,
           "data_version": data.value if data else None}
    meta = session.get(SystemMeta, CACHE_KEY)
    if not force and meta is not None and meta.value == key:
        log.info("anomaly cache current (%s)", mv.version)
        return 0
    detector = load_detector(artifacts_dir)
    end = hour_of(now)
    series = load_series(session, end)
    w = window_features(series, end)
    groups = np.array(series.groups)
    score, threshold = detector.score(w.x, groups)
    start_ts, end_ts = ts_of(end - WINDOW_H), ts_of(end)
    # Agents already flagged for this window were notified then; only new flags notify.
    known = {(a, _utc(ts)) for a, ts in session.execute(select(Anomaly.agent_id,
             Anomaly.window_start).where(Anomaly.status == AnomalyStatus.open))}
    session.execute(delete(Anomaly).where(Anomaly.status == AnomalyStatus.open))
    reviewed = {(a, _utc(ts)) for a, ts in session.execute(
        select(Anomaly.agent_id, Anomaly.window_start))}
    flags: list[Anomaly] = []
    for i in np.flatnonzero(score > threshold):
        agent_id = int(series.agent_ids[i])
        if (agent_id, start_ts) in reviewed:
            continue
        flags.append(Anomaly(model_version_id=mv.id, agent_id=agent_id, window_start=start_ts,
                             window_end=end_ts, score=round(float(score[i]), 4),
                             features=evidence(w, score, threshold, groups, int(i)) | {
                                 "as_of": now.isoformat()}))
    session.add_all(flags)
    session.merge(SystemMeta(key=CACHE_KEY, value=key))
    session.flush()
    notify.anomalies_new(session, [f for f in flags if (f.agent_id, start_ts) not in known])
    written = len(flags)
    log.info("anomaly cache: %d of %d agents flagged at %s (%s)", written,
             len(series.agent_ids), now.isoformat(), mv.version)
    return written
