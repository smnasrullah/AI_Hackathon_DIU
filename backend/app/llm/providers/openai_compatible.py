"""Any OpenAI-compatible /chat/completions endpoint (Gemini, Groq, local Ollama) over httpx."""

from typing import Any

import httpx

from app.core.config import Settings
from app.llm.providers import Completion, ProviderError, ProviderTimeout


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, settings: Settings) -> None:
        self.model = settings.llm_model
        self._url = settings.llm_base_url.rstrip("/") + "/chat/completions"
        self._key = settings.llm_api_key.get_secret_value()
        self._timeout = settings.llm_timeout_s

    def complete(self, system: str, user: str, max_tokens: int) -> Completion:
        headers = {"Authorization": f"Bearer {self._key}"} if self._key else {}
        body = {"model": self.model, "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": system},
                             {"role": "user", "content": user}]}
        try:
            res = httpx.post(self._url, json=body, headers=headers, timeout=self._timeout)
        except httpx.TimeoutException as exc:
            raise ProviderTimeout("timeout") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("connection") from exc
        if res.status_code != 200:
            raise ProviderError(f"http_{res.status_code}")
        try:
            data: dict[str, Any] = res.json()
            text = str(data["choices"][0]["message"]["content"] or "")
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("bad_response") from exc
        usage = data.get("usage") or {}
        return Completion(text=text, prompt_tokens=usage.get("prompt_tokens"),
                          completion_tokens=usage.get("completion_tokens"))
