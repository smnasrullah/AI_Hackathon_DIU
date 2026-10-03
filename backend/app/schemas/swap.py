from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.models.enums import FloatType, SwapResponse, SwapStatus

Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class SwapParty(BaseModel):
    agent_id: int
    code: str
    name: str
    upazila: str | None
    response: SwapResponse | None


class SwapItem(BaseModel):
    id: int
    donor: SwapParty
    receiver: SwapParty
    float_type: FloatType
    amount_bdt: float  # never above the donor's surplus over own need + buffer
    distance_km: float
    van_trip_saved: bool  # swap covers the receiver's whole recommendation
    score: float  # coverage x closeness, 0..1
    status: SwapStatus
    # When the receiver needs the money by (their recommendation's deadline); None if no longer due.
    deadline_at: datetime | None
    decided_at: datetime | None
    note: str | None
    model_version: str | None
    generated_at: datetime


class SwapPage(BaseModel):
    items: list[SwapItem]
    total: int
    page: int
    page_size: int
    van_trips_avoided: int  # est., over matching swaps that are not rejected
    advisory: Literal[True] = True


class SwapDecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: Note


class SwapRespondIn(BaseModel):
    response: Literal["accept", "decline"]
    note: Note | None = None
