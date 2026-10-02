"""Input and output guardrails around every LLM call.

In: untrusted text is stripped of control characters and chat/role tokens, capped at 500 chars
and wrapped in delimiters the system prompt declares as data. Out: one JSON object validated by
Pydantic, language checked, cited factors limited to the pack, numbers guard (numbers.py).
"""

import json
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.llm import numbers
from app.models.enums import GuardResult, Lang

MAX_USER_CHARS = 500
MAX_TEXT_CHARS = 1500
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩]")
# Chat-template / role markers and our own delimiters, so data cannot close its own wrapper.
_TOKENS = re.compile(
    r"<\|[^|>]{0,40}\|>|\[/?INST\]|<</?SYS>>|</?\s*(evidence|draft|untrusted|system)\s*>"
    r"|^\s*(system|assistant|user|human)\s*:",
    re.IGNORECASE | re.MULTILINE)
_BANGLA = re.compile(r"[ঀ-৿]")
_JSON = re.compile(r"\{.*\}", re.DOTALL)
AGENT_CODE = re.compile(r"\bAGT[-\s]?(\d{1,6})\b", re.IGNORECASE)


def sanitize(text: str, limit: int = MAX_USER_CHARS) -> str:
    cleaned = _TOKENS.sub(" ", _CONTROL.sub("", text))
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()[:limit]


def wrap(tag: str, text: str) -> str:
    return f"<{tag}>\n{sanitize(text, limit=20_000)}\n</{tag}>"


def wrap_untrusted(text: str) -> str:
    return f"<untrusted>\n{sanitize(text)}\n</untrusted>"


def scrub(value: Any) -> Any:
    """Sanitize every string inside the evidence pack (names, districts come from the DB)."""
    if isinstance(value, str):
        return sanitize(value, limit=200)
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


class LlmOutput(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    lang: Lang
    cited_factors: list[str] = Field(default_factory=list, max_length=8)


class GuardFailure(Exception):
    def __init__(self, result: GuardResult, detail: str) -> None:
        super().__init__(detail)
        self.result = result
        self.detail = detail


def parse(raw: str, lang: Lang, factors: set[str]) -> LlmOutput:
    """Schema + language check; GuardFailure(schema_fail) otherwise."""
    match = _JSON.search(raw)
    try:
        out = LlmOutput.model_validate(json.loads(match.group(0) if match else raw))
    except (ValueError, ValidationError) as exc:
        raise GuardFailure(GuardResult.schema_fail, "invalid_json") from exc
    if out.lang != lang or bool(_BANGLA.search(out.text)) != (lang is Lang.bn):
        raise GuardFailure(GuardResult.schema_fail, "wrong_language")
    if _TOKENS.search(out.text):
        raise GuardFailure(GuardResult.injection, "control_tokens")
    out.cited_factors = [f for f in dict.fromkeys(out.cited_factors) if f in factors]
    return out


def check_numbers(text: str, allowed: numbers.Allowed) -> None:
    if bad := numbers.unknown(text, allowed):
        raise GuardFailure(GuardResult.numbers_fail, "unknown_numbers:" + ",".join(bad[:5]))


def agent_codes(text: str) -> set[str]:
    return {f"AGT-{int(m.group(1)):04d}" for m in AGENT_CODE.finditer(numbers.normalise(text))}


def check_agents(text: str, allowed: frozenset[str]) -> None:
    """Leak guard: the output may name only agents that are in the evidence pack."""
    if bad := sorted(agent_codes(text) - allowed):
        raise GuardFailure(GuardResult.injection, "unknown_agents:" + ",".join(bad[:5]))
