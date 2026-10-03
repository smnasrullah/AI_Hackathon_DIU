"""Admin console: overview, users, organisation directory, audit log. Admin role only."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.config import get_settings
from app.core.csv_export import CSV_RESPONSES, csv_response
from app.core.deps import SessionDep, require_roles
from app.core.params import PageQuery
from app.models import User
from app.models.enums import UserRole
from app.schemas.admin import (
    AdminOverview,
    AdminUser,
    AdminUserCreate,
    AdminUserPage,
    AdminUserUpdate,
    AuditPage,
    OrgDirectory,
    UserStatus,
)
from app.services import admin_audit, admin_overview, admin_users, exports
from app.services.admin_audit import AuditFilter
from app.services.admin_users import UserAdminError

router = APIRouter(prefix="/admin", tags=["admin"])

Admin = Annotated[User, Depends(require_roles(UserRole.admin))]
_USER_STATUS = {"user_not_found": status.HTTP_404_NOT_FOUND,
                "email_taken": status.HTTP_409_CONFLICT,
                "cannot_change_self": status.HTTP_409_CONFLICT}


def _user_http(exc: UserAdminError) -> HTTPException:
    return HTTPException(_USER_STATUS.get(exc.code, status.HTTP_422_UNPROCESSABLE_ENTITY),
                         detail=exc.code)


@router.get("/overview", response_model=AdminOverview)
def get_overview(_user: Admin, session: SessionDep) -> AdminOverview:
    """Counts by role, open work queues, active models, LLM calls vs cap, latest job, audit."""
    return admin_overview.overview(session, get_settings())


# --- users ------------------------------------------------------------------------------------

@router.get("/users", response_model=AdminUserPage)
def list_users(
    _user: Admin,
    session: SessionDep,
    role: UserRole | None = None,
    user_status: Annotated[UserStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
    page: PageQuery = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AdminUserPage:
    """Users by role then e-mail; `q` matches e-mail or name."""
    return admin_users.user_page(session, role, user_status, q, page, page_size)


@router.post("/users", response_model=AdminUser, status_code=status.HTTP_201_CREATED)
def create_user(body: AdminUserCreate, user: Admin, session: SessionDep) -> AdminUser:
    """Create a user linked to an agent (agent) or distributor (distributor). audit_log."""
    try:
        item = admin_users.create(session, user, body)
    except UserAdminError as exc:
        raise _user_http(exc) from exc
    session.commit()
    return item


@router.patch("/users/{user_id}", response_model=AdminUser)
def update_user(user_id: uuid.UUID, body: AdminUserUpdate, user: Admin,
                session: SessionDep) -> AdminUser:
    """Name, role + link, or active flag. Disabling revokes every session. audit_log."""
    try:
        item = admin_users.update_user(session, user, user_id, body)
    except UserAdminError as exc:
        raise _user_http(exc) from exc
    session.commit()
    return item


@router.get("/org", response_model=OrgDirectory)
def get_org(_user: Admin, session: SessionDep) -> OrgDirectory:
    """Distributors and agents (id, code, name) for linking users."""
    return admin_users.directory(session)


# --- audit log --------------------------------------------------------------------------------

def _audit_filter(
    action: Annotated[str | None, Query(max_length=80)] = None,
    entity_type: Annotated[str | None, Query(max_length=80)] = None,
    user: Annotated[str | None, Query(max_length=120, description="e-mail contains")] = None,
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
) -> AuditFilter:
    return AuditFilter(action=action, entity_type=entity_type, user=user, start=start, end=end)


AuditQuery = Annotated[AuditFilter, Depends(_audit_filter)]


@router.get("/audit-log", response_model=AuditPage)
def list_audit(_user: Admin, session: SessionDep, f: AuditQuery,
               page: PageQuery = 1,
               page_size: Annotated[int, Query(ge=1, le=200)] = 50) -> AuditPage:
    """Human decisions and admin changes, newest first, with the action / entity facets."""
    return admin_audit.audit_page(session, f, page, page_size)


@router.get("/audit-log/export.csv", response_class=Response, responses=CSV_RESPONSES)
def export_audit_log(_user: Admin, session: SessionDep, f: AuditQuery) -> Response:
    """Every human decision (swap, anomaly, request, admin change), newest first; same filters
    as the list."""
    return csv_response("audit-log.csv", exports.AUDIT_HEADER, exports.audit_rows(session, f))
