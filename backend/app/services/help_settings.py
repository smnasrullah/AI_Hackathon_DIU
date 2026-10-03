"""Help request switches: env defaults (app/core/config.py) overridden by admins at runtime.

Overrides live in system_meta under KEY, so they survive restarts and need no redeploy.
"""

from dataclasses import asdict, fields, replace
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AuditLog, SystemMeta, User
from app.rules.help_request_rules import HelpPolicy

KEY = "help_request_settings"


def defaults() -> HelpPolicy:
    s = get_settings()
    return HelpPolicy(enabled=s.help_enabled, dry_run=s.help_dry_run,
                      claim_timeout_min=s.help_claim_timeout_min,
                      cooldown_min=s.help_cooldown_min,
                      daily_cap_per_agent=s.help_daily_cap_per_agent,
                      max_recipients_per_wave=s.help_max_recipients_per_wave)


def current(session: Session) -> HelpPolicy:
    row = session.get(SystemMeta, KEY)
    stored: dict[str, Any] = row.value if row is not None and isinstance(row.value, dict) else {}
    known = {f.name for f in fields(HelpPolicy)}
    return replace(defaults(), **{k: v for k, v in stored.items() if k in known})


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
