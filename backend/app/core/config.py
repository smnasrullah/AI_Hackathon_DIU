import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

# Bump when the synthetic generator changes; bootstrap regenerates data on mismatch.
DATA_VERSION = "1.0.0"

MIN_JWT_SECRET_BYTES = 32

LlmProvider = Literal["auto", "anthropic", "openai_compatible", "replay", "template"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    app_name: str = "AgentPulse AI"
    db_mode: Literal["postgres", "sqlite"] = "postgres"
    database_url: str = "postgresql+psycopg://agentpulse:agentpulse@localhost:5432/agentpulse"
    seed: int = 42
    bootstrap_state_file: Path = Path("/tmp/agentpulse_bootstrap_state")
    artifacts_dir: Path = BACKEND_DIR / "ml" / "artifacts"

    # "test" skips the JWT secret length guard (pytest only).
    app_env: str = "production"
    # No usable default: run.bat / run.sh write a random value into .env.
    jwt_secret: SecretStr = SecretStr("")
    jwt_access_ttl_min: int = 15
    jwt_refresh_ttl_days: int = 7
    # Refresh cookie: httpOnly, SameSite=Lax, path /api/v1/auth. Set true behind HTTPS.
    refresh_cookie_secure: bool = False
    # Lockout: this many failures per email+IP inside the window blocks that pair for the window.
    login_max_failures: int = 5
    login_lockout_min: int = 15

    # Demo login passwords; values live only in .env (template: .env.example).
    # An empty value skips seeding that role's demo users.
    demo_admin_password: SecretStr = SecretStr("")
    demo_distributor_password: SecretStr = SecretStr("")
    demo_agent_password: SecretStr = SecretStr("")
    # Landing role cards + POST /auth/demo-login (one click, no password, is_demo accounts
    # only). Synthetic data only. MUST be false on any public deployment.
    demo_mode: bool = True
    demo_login_per_min: int = 10  # per client IP

    # Self-signup (POST /auth/signup): pending agent accounts an admin approves. Per client IP.
    signup_per_hour: int = 5
    # Password reset: requests per client IP and per account per hour; link lifetime.
    reset_request_per_hour: int = 5
    reset_per_account_per_hour: int = 3
    reset_token_ttl_min: int = 30
    # "dev_log" writes reset links to the server log (development only; no email is sent).
    mailer: Literal["dev_log"] = "dev_log"
    # Origin the browser uses for the app; reset links point here.
    public_base_url: str = "http://localhost:5173"

    # Browser origins allowed to call the API cross-site. Empty (default): same-origin only,
    # which is how nginx serves the app; no CORS headers are sent at all.
    cors_origins: list[str] = []
    # Per client IP, every /api request / POST /auth/login; then 429 rate_limited.
    api_rate_per_min: int = 1200
    login_rate_per_min: int = 60
    max_body_bytes: int = 1_048_576

    # Optional override of app/rules/risk_rules.DEFAULT_CUTS: {"6": [amber, red], ...}.
    risk_thresholds: dict[int, list[float]] = {}
    # app/rules/rebalance_rules.py + swap_rules.py; defaults mirror the rule dataclasses.
    rebalance_horizon_h: int = 24
    rebalance_lead_time_h: float = 3.0
    rebalance_buffer_share: float = 0.10
    rebalance_buffer_min_bdt: float = 2_000.0
    swap_radius_km: float = 5.0
    swap_min_amount_bdt: float = 5_000.0
    # app/rules/channel_rules.py (van vs top-up vs self-fetch); assumptions in docs/METHODS.md.
    van_min_batch_amount_bdt: float = 100_000.0
    van_lead_time_h: float = 4.0
    van_cluster_radius_km: float = 10.0
    van_cost_per_trip_bdt: float = 1_500.0
    topup_fee_pct: float = 0.5
    topup_eta_h: float = 0.25
    self_fetch_max_km: float = 10.0
    self_fetch_speed_kmh: float = 15.0
    travel_cost_per_km_bdt: float = 10.0
    urgent_manual_cost_bdt: float = 2_500.0
    # app/rules/impact_rules.py (holdout backtest, F11); assumptions in docs/METHODS.md.
    impact_alert_share: float = 0.20
    impact_decision_hours: list[int] = [8, 14, 20]
    impact_cashout_fee_pct: float = 1.85

    # Liquidity help requests: defaults only; admins override them at runtime
    # (app/services/help_settings.py, stored in system_meta).
    help_enabled: bool = True
    help_dry_run: bool = False
    help_claim_timeout_min: int = 20
    help_cooldown_min: int = 30
    help_daily_cap_per_agent: int = 3
    help_max_recipients_per_wave: int = 5
    # Automatic trigger (app/services/help_trigger.py): defaults only, admins override at runtime
    # (app/services/help_settings.py trigger_*). Interval 0 turns the background loop off.
    help_trigger_interval_s: int = 60
    help_trigger_horizon_h: int = 6
    help_trigger_buffer_pct: float = 25.0  # of the agent's own average daily demand
    help_trigger_min_shortfall_bdt: float = 5_000.0
    help_trigger_max_request_bdt: float = 200_000.0
    help_trigger_lead_margin_h: float = 1.0
    help_trigger_radius_km: float = 5.0
    help_trigger_wave_timeout_min: int = 15
    help_trigger_max_waves: int = 3
    help_trigger_recent_ask_h: float = 2.0

    llm_provider: LlmProvider = "auto"
    llm_model: str = "claude-haiku-4-5-20251001"
    llm_base_url: str = ""
    llm_api_key: SecretStr = SecretStr("")
    llm_timeout_s: float = 8.0
    # Live provider calls (all users, UTC day) and per-user calls per minute; then template.
    llm_daily_call_cap: int = 500
    llm_user_calls_per_min: int = 10
    llm_cache_ttl_h: int = 168
    llm_replay_file: Path = BACKEND_DIR / "app" / "llm" / "cache" / "demo_replay.json"

    def model_post_init(self, __context: object) -> None:
        secret_bytes = len(self.jwt_secret.get_secret_value().encode())
        if self.app_env != "test" and secret_bytes < MIN_JWT_SECRET_BYTES:
            raise ValueError(
                f"JWT_SECRET must be at least {MIN_JWT_SECRET_BYTES} bytes; "
                "run run.bat / run.sh once to generate .env, or set a random 64-hex value."
            )
        if self.db_mode == "sqlite" and "DATABASE_URL" not in os.environ:
            self.database_url = f"sqlite:///{(BACKEND_DIR / 'agentpulse-local.db').as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
