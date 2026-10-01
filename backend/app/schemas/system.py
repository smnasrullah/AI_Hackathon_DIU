from datetime import datetime
from typing import Literal

from pydantic import BaseModel

BootstrapState = Literal[
    "starting",
    "waiting_for_db",
    "migrating",
    "seeding",
    "training",
    "finalizing",
    "ready",
    "failed",
]
LlmMode = Literal["anthropic", "openai_compatible", "replay", "template"]


class HealthResponse(BaseModel):
    status: Literal["ok"]


class SystemStatus(BaseModel):
    ready: bool
    bootstrap_state: BootstrapState
    db: bool
    migration_current: str | None
    migration_head: str | None
    seed: int | None
    data_version: str | None
    artifacts_ok: bool
    model_version: str | None
    llm_mode: LlmMode
    generated_at: datetime
