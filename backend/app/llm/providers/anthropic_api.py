"""Anthropic Messages API via the official SDK. Retries are ours (service.py), not the SDK's."""

import anthropic

from app.core.config import Settings
from app.llm.providers import Completion, ProviderError, ProviderTimeout


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, settings: Settings) -> None:
        self.model = settings.llm_model
        self._client = anthropic.Anthropic(api_key=settings.llm_api_key.get_secret_value(),
                                           timeout=settings.llm_timeout_s, max_retries=0)

    def complete(self, system: str, user: str, max_tokens: int) -> Completion:
        try:
            msg = self._client.messages.create(
                model=self.model, max_tokens=max_tokens, system=system,
                messages=[{"role": "user", "content": user}])
        except anthropic.APITimeoutError as exc:
            raise ProviderTimeout("timeout") from exc
        except anthropic.RateLimitError as exc:
            raise ProviderError("rate_limited") from exc
        except anthropic.APIStatusError as exc:
            raise ProviderError(f"http_{exc.status_code}") from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderError("connection") from exc
        if msg.stop_reason == "refusal":
            raise ProviderError("refusal")
        text = "".join(b.text for b in msg.content if b.type == "text")
        return Completion(text=text, prompt_tokens=msg.usage.input_tokens,
                          completion_tokens=msg.usage.output_tokens)
