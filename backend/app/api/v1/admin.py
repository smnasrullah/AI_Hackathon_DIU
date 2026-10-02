from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.core.csv_export import CSV_RESPONSES, csv_response
from app.core.deps import SessionDep, require_roles
from app.models import User
from app.models.enums import UserRole
from app.services import exports

router = APIRouter(prefix="/admin", tags=["admin"])

Admin = Annotated[User, Depends(require_roles(UserRole.admin))]


@router.get("/audit-log/export.csv", response_class=Response, responses=CSV_RESPONSES)
def export_audit_log(_user: Admin, session: SessionDep) -> Response:
    """Every human decision (swap, anomaly, request), newest first. Admin only."""
    return csv_response("audit-log.csv", exports.AUDIT_HEADER, exports.audit_rows(session))
