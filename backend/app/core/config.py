import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

# Bump when the synthetic generator changes; bootstrap regenerates data on mismatch.
DATA_VERSION = "1.0.0"

LlmProvider = Literal["auto", "anthropic", "openai_compatible", "replay", "template"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    app_name: str = "AgentPulse AI"
    db_mode: Literal["postgres", "sqlite"] = "postgres"
    database_url: str = "postgresql+psycopg://agentpulse:agentpulse@localhost:5432/agentpulse"
    seed: int = 42
    bootstrap_state_file: Path = Path("/tmp/agentpulse_bootstrap_state")
    artifacts_dir: Path = BACKEND_DIR / "ml" / "artifacts"

    jwt_secret: SecretStr = SecretStr("change-me")
    jwt_access_ttl_min: int = 15
    jwt_refresh_ttl_days: int = 7

    # Demo login passwords; values live only in .env (template: .env.example).
    # An empty value skips seeding that role's demo users.
    demo_admin_password: SecretStr = SecretStr("")
    demo_distributor_password: SecretStr = SecretStr("")
    demo_agent_password: SecretStr = SecretStr("")

    llm_provider: LlmProvider = "auto"
    llm_model: str = "claude-haiku-4-5-20251001"
    llm_base_url: str = ""
    llm_api_key: SecretStr = SecretStr("")
    llm_timeout_s: float = 8.0

    def model_post_init(self, __context: object) -> None:
        if self.db_mode == "sqlite" and "DATABASE_URL" not in os.environ:
            self.database_url = f"sqlite:///{(BACKEND_DIR / 'agentpulse-local.db').as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
