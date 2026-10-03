"""Help request switches: env defaults (app/core/config.py) overridden by admins at runtime.

Overrides live in system_meta under KEY, so they survive restarts and need no redeploy.
The automatic trigger's settings are stored the same way under TRIGGER_KEY.
In DEMO_MODE (with HELP_DEMO_DEFAULTS) the DEMO_* values replace the env defaults, so the wave
story works out of the box; an admin's stored override still wins over them.
"""

from dataclasses import asdict, fields, replace
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AuditLog, SystemMeta, User
from app.rules.help_request_rules import HelpPolicy
from app.rules.help_trigger_rules import TriggerPolicy

KEY = "help_request_settings"
TRIGGER_KEY = "help_trigger_settings"
# One helper agent per wave (urgent: twice that), so waves 2 and 3 still have someone to ask.
DEMO_HELP: dict[str, Any] = {"max_recipients_per_wave": 1}
DEMO_TRIGGER: dict[str, Any] = {"max_request_bdt": 100_000.0, "wave_timeout_min": 2,
                                "max_waves": 3, "recent_ask_h": 0.0}


def demo_defaults_on() -> bool:
    s = get_settings()
    return s.demo_mode and s.help_demo_defaults


def defaults() -> HelpPolicy:
    policy = _env_defaults()
    return replace(policy, **DEMO_HELP) if demo_defaults_on() else policy


def _env_defaults() -> HelpPolicy:
    s = get_settings()
    return HelpPolicy(enabled=s.help_enabled, dry_run=s.help_dry_run,
                      claim_timeout_min=s.help_claim_timeout_min,
                      cooldown_min=s.help_cooldown_min,
                      daily_cap_per_agent=s.help_daily_cap_per_agent,
                      max_recipients_per_wave=s.help_max_recipients_per_wave,
                      late_confirm_grace_h=s.help_late_confirm_grace_h)


def current(session: Session) -> HelpPolicy:
    row = session.get(SystemMeta, KEY)
    stored: dict[str, Any] = row.value if row is not None and isinstance(row.value, dict) else {}
    known = {f.name for f in fields(HelpPolicy)}
    return replace(defaults(), **{k: v for k, v in stored.items() if k in known})


def trigger_defaults() -> TriggerPolicy:
    policy = _env_trigger_defaults()
    return replace(policy, **DEMO_TRIGGER) if demo_defaults_on() else policy


def _env_trigger_defaults() -> TriggerPolicy:
    s = get_settings()
    return TriggerPolicy(horizon_h=s.help_trigger_horizon_h,
                         buffer_pct=s.help_trigger_buffer_pct,
                         min_shortfall_bdt=s.help_trigger_min_shortfall_bdt,
                         max_request_bdt=s.help_trigger_max_request_bdt,
                         lead_margin_h=s.help_trigger_lead_margin_h,
                         radius_km=s.help_trigger_radius_km,
                         wave_timeout_min=s.help_trigger_wave_timeout_min,
                         max_waves=s.help_trigger_max_waves,
                         recent_ask_h=s.help_trigger_recent_ask_h,
                         deadline_floor_min=s.help_trigger_deadline_floor_min,
                         urgent_wave_multiplier=s.help_trigger_urgent_wave_multiplier,
                         max_new_per_tick=s.help_trigger_max_new_per_tick)


def trigger_current(session: Session) -> TriggerPolicy:
    row = session.get(SystemMeta, TRIGGER_KEY)
    stored: dict[str, Any] = row.value if row is not None and isinstance(row.value, dict) else {}
    known = {f.name for f in fields(TriggerPolicy)}
    return replace(trigger_defaults(), **{k: v for k, v in stored.items() if k in known})


def update(session: Session, user: User, changes: dict[str, Any]) -> HelpPolicy:
    """Apply validated changes (schema bounds) and audit old -> new."""
    before = current(session)
    after = replace(before, **changes)
    session.merge(SystemMeta(key=KEY, value=asdict(after)))
    session.add(AuditLog(user_id=user.id, action="help_settings.update", entity_type="settings",
                         entity_id=KEY, note=None,
                         payload={"before": asdict(before), "after": asdict(after)}))
    session.flush()
    return after


def update_trigger(session: Session, user: User, changes: dict[str, Any]) -> TriggerPolicy:
    """Same as update(), for the automatic trigger's settings."""
    before = trigger_current(session)
    after = replace(before, **changes)  # __post_init__ re-checks the bounds
    session.merge(SystemMeta(key=TRIGGER_KEY, value=asdict(after)))
    session.add(AuditLog(user_id=user.id, action="help_trigger_settings.update",
                         entity_type="settings", entity_id=TRIGGER_KEY, note=None,
                         payload={"before": asdict(before), "after": asdict(after)}))
    session.flush()
    return after
