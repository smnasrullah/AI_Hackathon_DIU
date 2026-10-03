"""Admin system overview counts and the model registry listing."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.llm import store
from app.models import (
    Agent,
    Anomaly,
    Distributor,
    Event,
    ModelVersion,
    RecommendationRequest,
    SwapSuggestion,
    User,
)
from app.models.enums import AnomalyStatus, RequestStatus, SwapStatus, UserRole
from app.schemas.admin import ActiveModel, AdminOverview, RoleCount
from app.schemas.admin_ops import MetricItem, ModelRegistry, ModelVersionItem
from app.services import admin_audit, jobs

RECENT_AUDIT = 6


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def _count(session: Session, model: Any, *where: Any) -> int:
    return session.scalar(select(func.count()).select_from(model).where(*where)) or 0


def overview(session: Session, settings: Settings) -> AdminOverview:
    roles = [RoleCount(role=r, total=_count(session, User, User.role == r),
                       active=_count(session, User, User.role == r, User.is_active.is_(True)))
             for r in UserRole]
    models = session.scalars(select(ModelVersion).where(ModelVersion.is_active.is_(True))
                             .order_by(ModelVersion.model_name))
    job = jobs.latest(session)
    return AdminOverview(
        users=roles, distributors=_count(session, Distributor), agents=_count(session, Agent),
        events=_count(session, Event),
        open_anomalies=_count(session, Anomaly, Anomaly.status == AnomalyStatus.open),
        pending_swaps=_count(session, SwapSuggestion,
                             SwapSuggestion.status == SwapStatus.pending),
        open_requests=_count(session, RecommendationRequest,
                             RecommendationRequest.status == RequestStatus.requested),
        llm_calls_today=store.live_calls_today(session),
        llm_daily_cap=settings.llm_daily_call_cap,
        active_models=[ActiveModel(model_name=m.model_name, version=m.version,
                                   trained_at=_utc(m.trained_at)) for m in models],
        latest_job=jobs.to_out(session, job) if job else None,
        recent_audit=admin_audit.recent(session, RECENT_AUDIT),
        generated_at=datetime.now(UTC))


def flatten(metrics: dict[str, Any], prefix: str = "") -> list[MetricItem]:
    """Numeric leaves of a nested metrics document as dotted keys (booleans skipped)."""
    out: list[MetricItem] = []
    for key, value in metrics.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            out.extend(flatten(value, f"{path}."))
        elif isinstance(value, int | float) and not isinstance(value, bool):
            out.append(MetricItem(key=path, value=float(value)))
    return out


def registry(session: Session) -> ModelRegistry:
    rows = session.scalars(select(ModelVersion).order_by(
        ModelVersion.model_name, ModelVersion.is_active.desc(), ModelVersion.trained_at.desc()))
    items = [ModelVersionItem(
        id=m.id, model_name=m.model_name, version=m.version, trained_at=_utc(m.trained_at),
        is_active=m.is_active, artifact_sha256=m.artifact_sha256,
        metrics=flatten(m.metrics or {}), created_at=_utc(m.created_at)) for m in rows]
    return ModelRegistry(items=items, generated_at=datetime.now(UTC))
