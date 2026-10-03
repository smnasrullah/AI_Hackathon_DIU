"""DEMO_MODE helpers for liquidity help requests. Never active when DEMO_MODE is off.

- reset(): admin action. Cancels the demo agents' active requests (kept, audited, nobody is
  notified), ends a simulated shortage and starts their cooldown / daily cap / demo auto cap
  afresh (a reset marker in system_meta; earlier requests stay in the history).
- counts_since(): the reset marker for one requester agent; the limits count from there.
- auto_count(): automatic requests for one agent and float in the last 24 h (demo auto cap).
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import as_utc
from app.core.config import get_settings
from app.models import AuditLog, LiquidityRequest, SystemMeta, User
from app.models.enums import FloatType, HelpOrigin
from app.rules import help_request_rules as rules
from app.services import help_settings
from app.services.help_core import audit, move

RESET_KEY = "help_demo_reset"
SHORTAGE_KEY = "help_demo_shortage"  # help_trigger.DEMO_KEY (not imported: no cycle)
DEMO_DOMAIN = "@agentpulse.demo"  # every seeded login (app/services/seed.py)


@dataclass(frozen=True)
class ResetResult:
    cancelled_request_ids: list[int]
    agent_ids: list[int]
    at: datetime


def demo_agent_ids(session: Session) -> list[int]:
    """Agents run by a seeded demo login (landing page accounts and the helper logins)."""
    ids = session.scalars(select(User.agent_id).where(
        User.email.endswith(DEMO_DOMAIN), User.agent_id.is_not(None))).all()
    return sorted({i for i in ids if i is not None})


def counts_since(session: Session, agent_id: int) -> datetime | None:
    """When this agent's limits were last reset (DEMO_MODE only), else None."""
    if not get_settings().demo_mode:
        return None
    row = session.get(SystemMeta, RESET_KEY)
    if row is None or not isinstance(row.value, dict):
        return None
    if agent_id not in row.value.get("agent_ids", []):
        return None
    return as_utc(datetime.fromisoformat(str(row.value["at"])))


def window_start(session: Session, agent_id: int, now: datetime) -> datetime:
    """Start of the rolling 24 h the limits count, moved forward by a demo reset."""
    since = counts_since(session, agent_id)
    start = now - rules.DAY
    return max(start, since) if since is not None else start


def auto_count(session: Session, agent_id: int, float_type: FloatType, now: datetime) -> int:
    return session.scalar(select(func.count()).select_from(LiquidityRequest).where(
        LiquidityRequest.requester_agent_id == agent_id,
        LiquidityRequest.float_type == float_type,
        LiquidityRequest.created_by == HelpOrigin.system,
        LiquidityRequest.created_at > window_start(session, agent_id, now))) or 0


def auto_capped(session: Session, agent_id: int, float_type: FloatType, now: datetime) -> bool:
    """DEMO_MODE: this agent and float already had its automatic requests for today."""
    s = get_settings()
    cap = s.help_demo_auto_per_day
    return s.demo_mode and cap > 0 and auto_count(session, agent_id, float_type, now) >= cap


def reset(session: Session, admin: User, now: datetime) -> ResetResult:
    """Clean demo state: see the module docstring. The caller checks DEMO_MODE and commits."""
    agent_ids = demo_agent_ids(session)
    policy = help_settings.current(session)
    cancelled: list[int] = []
    active = session.scalars(select(LiquidityRequest).where(
        LiquidityRequest.requester_agent_id.in_(agent_ids),
        LiquidityRequest.status.in_(list(rules.ACTIVE))).order_by(LiquidityRequest.id))
    for req in list(active):
        old = move(session, req, "cancel", now)
        if old is not None:
            audit(session, admin.id, "cancel", req, old, now, policy, "demo reset",
                  actor_role=admin.role.value, demo_reset=True)
            cancelled.append(req.id)
    session.merge(SystemMeta(key=RESET_KEY, value={"at": now.isoformat(),
                                                   "agent_ids": agent_ids}))
    shortage = session.get(SystemMeta, SHORTAGE_KEY)
    if shortage is not None:
        session.delete(shortage)
    session.add(AuditLog(user_id=admin.id, action="help_demo.reset", entity_type="settings",
                         entity_id=RESET_KEY, note=None,
                         payload={"cancelled_request_ids": cancelled, "agent_ids": agent_ids,
                                  "at": now.isoformat()}))
    session.flush()
    return ResetResult(cancelled, agent_ids, now)
