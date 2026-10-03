"""Liquidity help request rules: the state machine and the anti-abuse limits.

States: open -> claimed -> fulfilled; claimed -> open (helper withdraws or the claim times out,
"reopened"); open -> expired (nobody helped by needed_by); open | claimed -> cancelled;
open | expired -> fulfilled ("confirm_late": the helper whose claim timed out delivered after
all; only when the request had such a claim, and from expired only within the grace window).
Never from cancelled. Every status change in the service goes through TRANSITIONS; anything
else is a 409.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from app.models.enums import HelpStatus

Event = Literal["claim", "withdraw", "reopen", "confirm", "confirm_late", "expire", "exhaust",
                "cancel"]

# event -> (allowed from, new status). The one place the allowed transitions are written.
TRANSITIONS: dict[Event, tuple[frozenset[HelpStatus], HelpStatus]] = {
    "claim": (frozenset({HelpStatus.open}), HelpStatus.claimed),
    "withdraw": (frozenset({HelpStatus.claimed}), HelpStatus.open),
    "reopen": (frozenset({HelpStatus.claimed}), HelpStatus.open),  # claim timed out
    "confirm": (frozenset({HelpStatus.claimed}), HelpStatus.fulfilled),
    # After a timed-out claim; from expired only within HelpPolicy.late_confirm_grace_h.
    "confirm_late": (frozenset({HelpStatus.open, HelpStatus.expired}), HelpStatus.fulfilled),
    "expire": (frozenset({HelpStatus.open}), HelpStatus.expired),
    "exhaust": (frozenset({HelpStatus.open}), HelpStatus.expired),  # every wave failed
    "cancel": (frozenset({HelpStatus.open, HelpStatus.claimed}), HelpStatus.cancelled),
}
ACTIVE: frozenset[HelpStatus] = frozenset({HelpStatus.open, HelpStatus.claimed})
DAY = timedelta(hours=24)


@dataclass(frozen=True)
class HelpPolicy:
    """Admin-controlled switches. dry_run records everything but sends no notifications."""

    enabled: bool = True
    dry_run: bool = False
    claim_timeout_min: int = 20
    cooldown_min: int = 30
    daily_cap_per_agent: int = 3
    max_recipients_per_wave: int = 5
    late_confirm_grace_h: int = 24  # an expired request can be confirmed late this long after


def late_confirm_open(expired_at: datetime | None, now: datetime, policy: HelpPolicy) -> bool:
    """An expired request can still be confirmed late until the grace window closes."""
    return expired_at is not None and now <= expired_at + timedelta(
        hours=policy.late_confirm_grace_h)


def can(event: Event, status: HelpStatus) -> bool:
    return status in TRANSITIONS[event][0]


def target(event: Event) -> HelpStatus:
    return TRANSITIONS[event][1]


def claim_expires_at(claimed_at: datetime, policy: HelpPolicy) -> datetime:
    return claimed_at + timedelta(minutes=policy.claim_timeout_min)


def abuse_block(created: Iterable[datetime], now: datetime, policy: HelpPolicy) -> str | None:
    """'cooldown' or 'daily_cap' when the requester's earlier requests (any status, any float)
    forbid a new one now; None when allowed. The cap counts a rolling 24 hours."""
    recent = [ts for ts in created if ts > now - DAY]
    cooldown = timedelta(minutes=policy.cooldown_min)
    if any(ts > now - cooldown for ts in recent):
        return "cooldown"
    if len(recent) >= policy.daily_cap_per_agent:
        return "daily_cap"
    return None
