from app.core.config import Settings
from app.schemas.system import LlmMode

LIVE: frozenset[LlmMode] = frozenset({"anthropic", "openai_compatible"})


def resolve_mode(settings: Settings) -> LlmMode:
    """auto: key -> live provider; no key -> replay (if recorded); else template."""
    if settings.llm_provider != "auto":
        return settings.llm_provider
    if settings.llm_api_key.get_secret_value():
        return "openai_compatible" if settings.llm_base_url else "anthropic"
    return "replay" if settings.llm_replay_file.is_file() else "template"
