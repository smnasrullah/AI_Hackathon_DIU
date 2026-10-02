"""Anomaly queue: scoped list, peer-evidence detail, human review (audit_log).

A flag is a lead for a distributor to look at, never a verdict; review only records a decision.
"""

from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import Select, case, false, func, select
from sqlalchemy.orm import Session

from app.models import Agent, Anomaly, AuditLog, ModelVersion, SystemMeta, User
from app.models.enums import AnomalyStatus, UserRole
from app.schemas.anomaly import (
    AnomalyAgent,
    AnomalyContext,
    AnomalyDetail,
    AnomalyItem,
    AnomalyPage,
    AnomalyReason,
    PeerFeature,
    PeerScores,
)
from app.services.anomaly_scan import CACHE_KEY

ENTITY = "anomaly"
# Open first (needs a review), then most unusual.
_ORDER = (case((Anomaly.status == AnomalyStatus.open, 0), else_=1), Anomaly.score.desc(),
          Anomaly.id)
Row = tuple[Anomaly, Agent, str]


class AnomalyError(Exception):
    """forbidden (403), not_found (404, admin only), already_reviewed (409)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def _scoped(user: User) -> Select[tuple[Anomaly, Agent, str]]:
    query = (select(Anomaly, Agent, ModelVersion.version)
             .join(Agent, Agent.id == Anomaly.agent_id)
             .join(ModelVersion, ModelVersion.id == Anomaly.model_version_id))
    if user.role == UserRole.distributor:
        return query.where(Agent.distributor_id == user.distributor_id)
    if user.role == UserRole.agent:
        return query.where(false())  # agents never see flags (router blocks them too)
    return query


def _item_fields(a: Anomaly, agent: Agent, version: str) -> dict[str, Any]:
    ev = a.features
    return {
        "id": a.id,
        "agent": AnomalyAgent(agent_id=agent.id, code=agent.code, name=agent.name,
                              district=agent.district, upazila=agent.upazila),
        "window_start": _utc(a.window_start), "window_end": _utc(a.window_end),
        "score": float(a.score), "threshold": ev["threshold"], "peer_group": ev["peer_group"],
        "reasons": [AnomalyReason(**r) for r in ev["reasons"]], "status": a.status,
        "reviewed_at": _utc(a.reviewed_at) if a.reviewed_at else None, "note": a.note,
        "model_version": version, "generated_at": _utc(a.created_at),
    }


def is_ready(session: Session) -> bool:
    return session.get(SystemMeta, CACHE_KEY) is not None


def anomaly_page(session: Session, user: User, status: AnomalyStatus | None, page: int,
                 page_size: int) -> AnomalyPage:
    query = _scoped(user)
    if status is not None:
        query = query.where(Anomaly.status == status)
    ids = query.with_only_columns(Anomaly.id).subquery()
    total = session.scalar(select(func.count()).select_from(ids)) or 0
    rows = session.execute(query.order_by(*_ORDER).offset((page - 1) * page_size)
                           .limit(page_size)).tuples().all()
    return AnomalyPage(items=[AnomalyItem(**_item_fields(*r)) for r in rows], total=total,
                       page=page, page_size=page_size)


def _load(session: Session, user: User, anomaly_id: int, lock: bool = False) -> Row:
    """Out-of-scope ids are forbidden; unknown ids too, except for admins (404)."""
    query = _scoped(user).where(Anomaly.id == anomaly_id)
    if lock:
        # Row lock (Postgres) so two concurrent reviews cannot both pass the open check.
        query = query.with_for_update(of=Anomaly)
    found = session.execute(query).tuples().first()
    if found is None:
        raise AnomalyError("not_found" if user.role == UserRole.admin else "forbidden")
    return found


def _detail(session: Session, a: Anomaly, agent: Agent, version: str) -> AnomalyDetail:
    ev = a.features
    reviewer = session.get(User, a.reviewed_by) if a.reviewed_by else None
    return AnomalyDetail(
        **_item_fields(a, agent, version), peer_count=ev["peer_count"],
        window_h=ev["window_h"], history_h=ev["history_h"],
        features=[PeerFeature(**f) for f in ev["features"]],
        peer_scores=PeerScores(**ev["peer_scores"]), context=AnomalyContext(**ev["context"]),
        reviewed_by=reviewer.full_name if reviewer else None)


def detail(session: Session, user: User, anomaly_id: int) -> AnomalyDetail:
    return _detail(session, *_load(session, user, anomaly_id))


def review(session: Session, user: User, anomaly_id: int,
           decision: Literal["confirmed", "dismissed"], note: str) -> AnomalyDetail:
    a, agent, version = _load(session, user, anomaly_id, lock=True)
    if a.status != AnomalyStatus.open:
        raise AnomalyError("already_reviewed")
    a.status = AnomalyStatus(decision)
    a.reviewed_by, a.reviewed_at, a.note = user.id, datetime.now(UTC), note
    session.add(AuditLog(user_id=user.id, action=f"anomaly.{decision}", entity_type=ENTITY,
                         entity_id=str(a.id), note=note, payload={
                             "agent_id": a.agent_id, "score": float(a.score),
                             "window_start": _utc(a.window_start).isoformat(),
                             "window_end": _utc(a.window_end).isoformat(),
                             "model_version": version, "status": a.status.value}))
    session.flush()
    return _detail(session, a, agent, version)
