import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import (
    FloatType,
    HelpOrigin,
    HelpReasonCategory,
    HelpResponse,
    HelpStatus,
    UserRole,
)
from app.schemas.swap import Note

# owner: the requester agent, their distributor or an admin (full detail).
# recipient: a helper who was asked (amount, area and deadline only; never who claimed it).
HelpView = Literal["owner", "recipient"]


class HelpRequester(BaseModel):
    agent_id: int
    code: str
    name: str
    upazila: str | None
    district: str


class HelpRecipientOut(BaseModel):
    """Owner view only."""

    user_id: uuid.UUID
    display: str  # agent code or distributor code, never an e-mail
    role: UserRole
    wave_number: int
    response: HelpResponse
    notified_at: datetime | None
    responded_at: datetime | None
    distance_km: float | None


class HelpRequestItem(BaseModel):
    """Fields after `recipients` are owner-side extras: left unset, and so omitted from the
    response (response_model_exclude_unset), for anyone not entitled to them."""

    id: int
    view: HelpView
    requester: HelpRequester
    float_type: FloatType
    amount_needed: float
    needed_by: datetime  # wall clock (app/core/clock.py), like every other time here
    status: HelpStatus
    urgent: bool = False  # stock-out forecast sooner than twice the deadline floor
    # Show "as soon as possible", not needed_by: the deadline floor put needed_by after the
    # forecast stock-out (column deadline_after_stockout). Sent to helpers too; no forecast
    # detail beyond "now".
    deadline_asap: bool = False
    # Coarse, number-free reason: the only reason a helper sees.
    reason_category: HelpReasonCategory = HelpReasonCategory.unknown
    created_by: HelpOrigin
    created_at: datetime
    updated_at: datetime
    claimed_at: datetime | None
    claim_expires_at: datetime | None
    fulfilled_at: datetime | None
    # Recipient view: the caller's own answer and whether the caller holds the claim.
    my_response: HelpResponse | None = None
    claimed_by_me: bool = False
    my_distance_km: float | None = None
    simulated: bool = False  # true only for demo runs of the admin "simulate shortage" helper
    # Owner view only. reason_summary: the full reason in the reader's language.
    reason_summary: str | None = None
    claimed_by: HelpRecipientOut | None = None
    recipients: list[HelpRecipientOut] | None = None
    # Forecast stock-out placed on the wall clock when the request was made (the agent page's
    # "stock-out in X" at that moment); needed_by is always before it.
    stockout_at: datetime | None = None
    # A claim timed out and the request reopened: the requester side may confirm late delivery.
    can_confirm_late: bool | None = None
    # Distributor and admin owner view only (read only); never sent to agents or helpers.
    wave_number: int | None = None
    max_waves: int | None = None
    is_last_wave: bool | None = None
    advisory: Literal[True] = True  # coordination only: the system never moves money


class HelpRequestPage(BaseModel):
    items: list[HelpRequestItem]
    total: int
    page: int
    page_size: int


class HelpNoteIn(BaseModel):
    note: Note | None = None


class HelpSettingsOut(BaseModel):
    enabled: bool
    dry_run: bool
    claim_timeout_min: int
    cooldown_min: int
    daily_cap_per_agent: int
    max_recipients_per_wave: int
    late_confirm_grace_h: int


class HelpSettingsIn(BaseModel):
    """Partial update; omitted fields keep their value."""

    enabled: bool | None = None
    dry_run: bool | None = None
    claim_timeout_min: int | None = Field(default=None, ge=1, le=24 * 60)
    cooldown_min: int | None = Field(default=None, ge=0, le=24 * 60)
    daily_cap_per_agent: int | None = Field(default=None, ge=1, le=100)
    max_recipients_per_wave: int | None = Field(default=None, ge=1, le=50)
    late_confirm_grace_h: int | None = Field(default=None, ge=0, le=168)


class HelpSweepOut(BaseModel):
    reopened: int
    expired: int
