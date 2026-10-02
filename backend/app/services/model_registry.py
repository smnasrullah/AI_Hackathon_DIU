"""model_versions rows for the committed artifacts (one active version per model name)."""

import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import ModelVersion
from ml.inference.forecaster import ArtifactError
from ml.registry import (
    ANOMALY_MANIFEST,
    ANOMALY_MODEL,
    FORECAST_MODEL,
    read_manifest,
    verify,
    verify_anomaly,
)


def _activate(session: Session, model_name: str, manifest: dict[str, Any],
              metrics: dict[str, Any]) -> ModelVersion:
    """Upsert one manifest's model as the only active version of its name (idempotent)."""
    version = str(manifest["model_version"])
    files: dict[str, str] = manifest["files"]
    digest = hashlib.sha256("".join(files[k] for k in sorted(files)).encode()).hexdigest()
    row = session.scalar(select(ModelVersion).where(
        ModelVersion.model_name == model_name, ModelVersion.version == version))
    if row is None:
        row = ModelVersion(model_name=model_name, version=version)
        session.add(row)
    row.trained_at = datetime.fromisoformat(manifest["trained_at"])
    row.artifact_sha256 = digest
    row.metrics = metrics
    session.execute(update(ModelVersion).where(ModelVersion.model_name == model_name,
                                               ModelVersion.version != version)
                    .values(is_active=False))
    row.is_active = True
    session.flush()
    return row


def register_forecast_model(session: Session, artifacts_dir: Path) -> ModelVersion:
    """Upsert the manifest's forecast model as the active version (idempotent)."""
    ok, why = verify(artifacts_dir)
    manifest = read_manifest(artifacts_dir)
    if not ok or manifest is None:
        raise ArtifactError(f"forecast artifacts invalid: {why}")
    return _activate(session, FORECAST_MODEL, manifest, manifest["forecast"]["holdout_metrics"])


def register_anomaly_model(session: Session, artifacts_dir: Path) -> ModelVersion:
    """Upsert the anomaly detector as the active version; metrics = precision/recall."""
    ok, why = verify_anomaly(artifacts_dir)
    manifest = read_manifest(artifacts_dir, ANOMALY_MANIFEST)
    if not ok or manifest is None:
        raise ArtifactError(f"anomaly artifacts invalid: {why}")
    return _activate(session, ANOMALY_MODEL, manifest, manifest["anomaly"]["metrics"])


def active_model(session: Session, model_name: str) -> ModelVersion | None:
    return session.scalar(select(ModelVersion).where(
        ModelVersion.model_name == model_name, ModelVersion.is_active.is_(True)))
