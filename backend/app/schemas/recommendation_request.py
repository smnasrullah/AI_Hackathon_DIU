import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.enums import FloatType, RecommendationChannel, RequestStatus
from app.schemas.swap import Note


class RequestAgent(BaseModel):
    agent_id: int
    code: str
    name: str


class RequestItem(BaseModel):
    id: int
    recommendation_id: int
    agent: RequestAgent
    float_type: FloatType
    channel: RecommendationChannel | None
    amount_bdt: float  # copied from the recommendation when requested
    deadline_at: datetime
    status: RequestStatus
    requested_by: uuid.UUID
    decided_by: uuid.UUID | None
    note: str | None
    created_at: datetime
    decided_at: datetime | None
    advisory: Literal[True] = True  # recording a decision moves no money


class RequestPage(BaseModel):
    items: list[RequestItem]
    total: int
    page: int
    page_size: int


class RequestDecisionIn(BaseModel):
    decision: Literal["approve", "decline"]
    note: Note


class RequestNoteIn(BaseModel):
    note: Note | None = None
