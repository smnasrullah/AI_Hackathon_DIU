"""Admin console: overview, users, organisation lookups, audit log."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.params import DbId
from app.models.enums import UserRole
from app.schemas.auth import PASSWORD_MIN
from app.schemas.jobs import JobOut

Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3,
                                         max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
UserStatus = Literal["active", "disabled"]


class AdminUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    agent_id: int | None
    agent_code: str | None
    distributor_id: int | None
    distributor_code: str | None
    is_active: bool
    is_demo: bool
    last_login_at: datetime | None
    created_at: datetime


class AdminUserPage(BaseModel):
    items: list[AdminUser]
    total: int
    page: int
    page_size: int


class AdminUserCreate(BaseModel):
    """agent -> agent_id required; distributor -> distributor_id required; admin -> neither."""

    model_config = ConfigDict(extra="forbid")

    email: Email
    full_name: FullName
    role: UserRole
    agent_id: DbId | None = None
    distributor_id: DbId | None = None
    password: str = Field(min_length=PASSWORD_MIN, max_length=128)


class AdminUserUpdate(BaseModel):
    """Only sent fields change. Changing role re-checks the agent / distributor link."""

    model_config = ConfigDict(extra="forbid")

    full_name: FullName | None = None
    role: UserRole | None = None
    agent_id: DbId | None = None
    distributor_id: DbId | None = None
    is_active: bool | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class OrgDistributor(BaseModel):
    id: int
    code: str
    name: str


class OrgAgent(BaseModel):
    id: int
    code: str
    name: str
    distributor_id: int


class OrgDirectory(BaseModel):
    distributors: list[OrgDistributor]
    agents: list[OrgAgent]


class AuditItem(BaseModel):
    id: int
    created_at: datetime
    user_email: str | None
    user_role: UserRole | None
    action: str
    entity_type: str
    entity_id: str
    note: str | None
    payload: str  # JSON text, sorted keys; never rendered as HTML


class AuditPage(BaseModel):
    items: list[AuditItem]
    total: int
    page: int
    page_size: int
    actions: list[str]  # every action in the log, for the filter
    entity_types: list[str]


class ActiveModel(BaseModel):
    model_name: str
    version: str
    trained_at: datetime


class RoleCount(BaseModel):
    role: UserRole
    total: int
    active: int


class AdminOverview(BaseModel):
    users: list[RoleCount]
    distributors: int
    agents: int
    events: int
    open_anomalies: int
    pending_swaps: int
    open_requests: int
    llm_calls_today: int
    llm_daily_cap: int
    active_models: list[ActiveModel]
    latest_job: JobOut | None
    recent_audit: list[AuditItem]
    generated_at: datetime
