from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import SessionDep, require_roles
from app.core.params import IdPath, PageQuery
from app.models import User
from app.models.enums import AnomalyStatus, UserRole
from app.schemas.anomaly import AnomalyDetail, AnomalyPage, AnomalyReviewIn
from app.services import anomalies
from app.services.anomalies import AnomalyError

router = APIRouter(prefix="/anomalies", tags=["anomalies"])

Reviewer = Annotated[User, Depends(require_roles(UserRole.distributor, UserRole.admin))]
_STATUS = {"forbidden": status.HTTP_403_FORBIDDEN, "not_found": status.HTTP_404_NOT_FOUND}


def _http(exc: AnomalyError) -> HTTPException:
    code = _STATUS.get(exc.code, status.HTTP_409_CONFLICT)
    return HTTPException(code, detail="anomaly_not_found" if exc.code == "not_found" else exc.code)


def _ready(session: SessionDep) -> None:
    if not anomalies.is_ready(session):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="anomalies_not_ready")


@router.get("", response_model=AnomalyPage)
def list_anomalies(
    user: Reviewer,
    session: SessionDep,
    anomaly_status: Annotated[AnomalyStatus | None, Query(alias="status")] = None,
    page: PageQuery = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> AnomalyPage:
    """Isolation Forest flags in scope (distributor: own agents; admin: all), open first."""
    _ready(session)
    return anomalies.anomaly_page(session, user, anomaly_status, page, page_size)


@router.get("/{anomaly_id}", response_model=AnomalyDetail)
def get_anomaly(anomaly_id: IdPath, user: Reviewer, session: SessionDep) -> AnomalyDetail:
    """One flag with its peer-group distribution per feature and the top reasons."""
    _ready(session)
    try:
        return anomalies.detail(session, user, anomaly_id)
    except AnomalyError as exc:
        raise _http(exc) from exc


@router.post("/{anomaly_id}/review", response_model=AnomalyDetail)
def review_anomaly(anomaly_id: IdPath, body: AnomalyReviewIn, user: Reviewer,
                   session: SessionDep) -> AnomalyDetail:
    """Human review: confirmed or dismissed with a note (audit_log). Nothing else happens."""
    _ready(session)
    try:
        item = anomalies.review(session, user, anomaly_id, body.decision, body.note)
    except AnomalyError as exc:
        raise _http(exc) from exc
    session.commit()
    return item
