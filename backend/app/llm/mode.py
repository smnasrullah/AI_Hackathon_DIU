from pathlib import Path

from app.core.config import Settings
from app.schemas.system import LlmMode

REPLAY_FILE = Path(__file__).resolve().parent / "cache" / "demo_replay.json"


def resolve_mode(settings: Settings) -> LlmMode:
    """auto: key -> live provider; no key -> replay (if recorded); else template."""
    if settings.llm_provider != "auto":
        return settings.llm_provider
    if settings.llm_api_key.get_secret_value():
        return "openai_compatible" if settings.llm_base_url else "anthropic"
    return "replay" if REPLAY_FILE.is_file() else "template"
