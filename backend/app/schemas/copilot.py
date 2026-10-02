from pydantic import BaseModel, Field

from app.llm.copilot.intents import Route
from app.llm.copilot.tools import ToolCall
from app.models.enums import Lang
from app.schemas.llm import LlmText


class CopilotChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)  # sanitized and cut to 500 chars
    lang: Lang | None = None  # default: user's language
    # Agents: own account (omit, or their own id). Distributors / admins: required.
    agent_id: int | None = None


class CopilotSuggestions(BaseModel):
    """Suggested questions; the only ones with recorded replay wording (exact-text match)."""

    lang: Lang
    items: list[str]


class CopilotSource(BaseModel):
    """Liquidity Playbook passage the answer is grounded in (cited by title)."""

    slug: str
    title: str
    score: float


class CopilotMeta(BaseModel):
    agent_id: int
    route: Route
    tool: ToolCall | None  # allow-listed read-only tool the backend ran
    sources: list[CopilotSource]


class CopilotReply(CopilotMeta):
    """SSE `done` event. `answer.text` is verified against the evidence pack."""

    answer: LlmText


class CopilotDraft(BaseModel):
    """SSE `template` / `delta` event."""

    text: str


class CopilotError(BaseModel):
    """SSE `error` event."""

    detail: str
