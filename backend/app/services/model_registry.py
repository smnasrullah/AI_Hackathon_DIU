"""model_versions rows for the committed artifacts (one active version per model name)."""

import hashlib
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import ModelVersion
from ml.inference.forecaster import ArtifactError
from ml.registry import FORECAST_MODEL, read_manifest, verify


def register_forecast_model(session: Session, artifacts_dir: Path) -> ModelVersion:
    """Upsert the manifest's forecast model as the active version (idempotent)."""
    ok, why = verify(artifacts_dir)
    manifest = read_manifest(artifacts_dir)
    if not ok or manifest is None:
        raise ArtifactError(f"forecast artifacts invalid: {why}")
    version = str(manifest["model_version"])
    files: dict[str, str] = manifest["files"]
    digest = hashlib.sha256("".join(files[k] for k in sorted(files)).encode()).hexdigest()
    row = session.scalar(select(ModelVersion).where(
        ModelVersion.model_name == FORECAST_MODEL, ModelVersion.version == version))
    if row is None:
        row = ModelVersion(model_name=FORECAST_MODEL, version=version)
        session.add(row)
    row.trained_at = datetime.fromisoformat(manifest["trained_at"])
    row.artifact_sha256 = digest
    row.metrics = manifest["forecast"]["holdout_metrics"]
    session.execute(update(ModelVersion).where(ModelVersion.model_name == FORECAST_MODEL,
                                               ModelVersion.version != version)
                    .values(is_active=False))
    row.is_active = True
    session.flush()
    return row


def active_model(session: Session, model_name: str) -> ModelVersion | None:
    return session.scalar(select(ModelVersion).where(
        ModelVersion.model_name == model_name, ModelVersion.is_active.is_(True)))
