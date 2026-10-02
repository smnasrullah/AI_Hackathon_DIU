"""Live LLM providers behind one interface. Replay and template are not providers: they never
leave the process (app/llm/replay.py, app/llm/templates.py)."""

from dataclasses import dataclass
from typing import Protocol

from app.core.config import Settings
from app.schemas.system import LlmMode


@dataclass(frozen=True)
class Completion:
    text: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class ProviderError(Exception):
    """Any failure of the live call; the message is a short code, never the key or payload."""


class ProviderTimeout(ProviderError):
    pass


class Provider(Protocol):
    name: str
    model: str

    def complete(self, system: str, user: str, max_tokens: int) -> Completion: ...


def build(mode: LlmMode, settings: Settings) -> Provider:
    """Live provider for `mode` (anthropic | openai_compatible). Tests monkeypatch this."""
    if mode == "anthropic":
        from app.llm.providers.anthropic_api import AnthropicProvider

        return AnthropicProvider(settings)
    if mode == "openai_compatible":
        from app.llm.providers.openai_compatible import OpenAICompatibleProvider

        return OpenAICompatibleProvider(settings)
    raise ValueError(f"not a live provider: {mode}")
