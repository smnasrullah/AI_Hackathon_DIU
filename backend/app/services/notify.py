"""Write in-app notifications for pipeline and human events, to the right users only.

agent: own headline risk change, swap offers on own agent, decisions on own swaps.
distributor: red-count change in own territory, new anomalies, new pending swaps.
Texts are i18n keys + params (numbers from the backend). Users with notify_in_app off get none.
"""

import uuid
from collections import Counter
from collections.abc import Iterable

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import Agent, Anomaly, Notification, RiskLevel, SwapSuggestion, User
from app.models.enums import (
    NotificationSeverity,
    NotificationType,
    RiskLevelCode,
    SwapStatus,
    UserRole,
)
from app.rules.risk_rules import HEADLINE_HORIZON, worst

Param = str | int | float | bool | None
SwapKey = tuple[int, int, str]
LEVEL_SEVERITY = {RiskLevelCode.green: NotificationSeverity.info,
                  RiskLevelCode.amber: NotificationSeverity.warning,
                  RiskLevelCode.red: NotificationSeverity.critical}


def _recipients(session: Session, role: UserRole, ids: Iterable[int]) -> dict[int, list[uuid.UUID]]:
    """agent id (role agent) or distributor id (role distributor) -> opted-in user ids."""
    wanted = set(ids)
    if not wanted:
        return {}
    col = User.agent_id if role == UserRole.agent else User.distributor_id
    out: dict[int, list[uuid.UUID]] = {}
    for key, user_id in session.execute(select(col, User.id).where(
            User.role == role, User.is_active.is_(True), User.notify_in_app.is_(True),
            col.in_(wanted))).tuples():
        if key is not None:
            out.setdefault(key, []).append(user_id)
    return out


def _add(session: Session, users: Iterable[uuid.UUID], kind: NotificationType,
         severity: NotificationSeverity, title_key: str, params: dict[str, Param],
         entity: tuple[str, str | None]) -> int:
    rows = [{"user_id": u, "type": kind, "severity": severity, "title_key": title_key,
             "params": params, "entity_type": entity[0], "entity_id": entity[1]} for u in users]
    if rows:
        session.execute(insert(Notification), rows)
    return len(rows)


def _distributor_of(session: Session, agent_ids: Iterable[int]) -> dict[int, tuple[int, str]]:
    """agent id -> (distributor id, agent code)."""
    found = session.execute(select(Agent.id, Agent.distributor_id, Agent.code)
                            .where(Agent.id.in_(set(agent_ids)))).tuples()
    return {a: (d, code) for a, d, code in found}


# --- risk -------------------------------------------------------------------------------------

def headline_levels(session: Session) -> dict[int, RiskLevelCode]:
    """Worst float level per agent at the headline horizon, from the current risk cache."""
    out: dict[int, RiskLevelCode] = {}
    for agent_id, level in session.execute(select(RiskLevel.agent_id, RiskLevel.level).where(
            RiskLevel.horizon_h == HEADLINE_HORIZON)).tuples():
        out[agent_id] = worst((out.get(agent_id, RiskLevelCode.green), level))
    return out


def risk_changed(session: Session, before: dict[int, RiskLevelCode],
                 after: dict[int, RiskLevelCode]) -> int:
    """Agents whose headline level moved; distributors whose red count moved.

    An agent with no previous level counts as green, so the first run reports amber/red agents.
    """
    green = RiskLevelCode.green
    agents = _distributor_of(session, set(before) | set(after))
    changed = {a: (before.get(a, green), lvl) for a, lvl in after.items()
               if before.get(a, green) != lvl and a in agents}
    written = 0
    users = _recipients(session, UserRole.agent, changed)
    for a, (prev, new) in changed.items():
        written += _add(session, users.get(a, []), NotificationType.risk_change,
                        LEVEL_SEVERITY[new], "notifications.risk_change",
                        {"agent_code": agents[a][1], "from": prev.value, "to": new.value,
                         "horizon_h": HEADLINE_HORIZON}, ("agent", str(a)))
    red_before = Counter(agents[a][0] for a, lvl in before.items()
                         if lvl == RiskLevelCode.red and a in agents)
    red_after = Counter(agents[a][0] for a, lvl in after.items()
                        if lvl == RiskLevelCode.red and a in agents)
    moved = {d for d in set(red_before) | set(red_after) if red_before[d] != red_after[d]}
    dist_users = _recipients(session, UserRole.distributor, moved)
    for d in moved:
        up = red_after[d] > red_before[d]
        written += _add(session, dist_users.get(d, []), NotificationType.risk_change,
                        NotificationSeverity.critical if up else NotificationSeverity.info,
                        "notifications.red_count_change",
                        {"previous": red_before[d], "current": red_after[d],
                         "horizon_h": HEADLINE_HORIZON}, ("distributor", str(d)))
    return written


# --- swaps ------------------------------------------------------------------------------------

def pending_swap_keys(session: Session) -> set[SwapKey]:
    found = session.execute(select(SwapSuggestion.donor_agent_id,
                                   SwapSuggestion.receiver_agent_id, SwapSuggestion.float_type)
                            .where(SwapSuggestion.status == SwapStatus.pending)).tuples()
    return {(d, r, ft.value) for d, r, ft in found}


def swap_offers(session: Session, known: set[SwapKey]) -> int:
    """Pending swaps not in `known`: donor + receiver agents, and their distributor (a count)."""
    swaps = [s for s in session.scalars(select(SwapSuggestion).where(
        SwapSuggestion.status == SwapStatus.pending).order_by(SwapSuggestion.id))
        if (s.donor_agent_id, s.receiver_agent_id, s.float_type.value) not in known]
    if not swaps:
        return 0
    parties = {a for s in swaps for a in (s.donor_agent_id, s.receiver_agent_id)}
    agents = _distributor_of(session, parties)
    users = _recipients(session, UserRole.agent, parties)
    written = 0
    per_distributor: Counter[int] = Counter()
    for s in swaps:
        base: dict[str, Param] = {"float_type": s.float_type.value,
                                  "amount_bdt": float(s.amount_bdt),
                                  "distance_km": float(s.distance_km)}
        for side, me, other in (("donor", s.donor_agent_id, s.receiver_agent_id),
                                ("receiver", s.receiver_agent_id, s.donor_agent_id)):
            written += _add(session, users.get(me, []), NotificationType.swap_offer,
                            NotificationSeverity.info, f"notifications.swap_offer.{side}",
                            base | {"counterpart_code": agents[other][1]}, ("swap", str(s.id)))
        per_distributor[agents[s.receiver_agent_id][0]] += 1
    dist_users = _recipients(session, UserRole.distributor, per_distributor)
    for d, n in per_distributor.items():
        written += _add(session, dist_users.get(d, []), NotificationType.swap_offer,
                        NotificationSeverity.warning, "notifications.swaps_pending",
                        {"count": n}, ("swap", None))
    return written


def swap_decided(session: Session, s: SwapSuggestion) -> int:
    """Tell both agents of a swap the distributor's decision (never the free-text note)."""
    agents = _distributor_of(session, (s.donor_agent_id, s.receiver_agent_id))
    users = _recipients(session, UserRole.agent, agents)
    params: dict[str, Param] = {"status": s.status.value, "float_type": s.float_type.value,
                                "amount_bdt": float(s.amount_bdt)}
    written = 0
    for me, other in ((s.donor_agent_id, s.receiver_agent_id),
                      (s.receiver_agent_id, s.donor_agent_id)):
        written += _add(session, users.get(me, []), NotificationType.swap_decision,
                        NotificationSeverity.info, "notifications.swap_decision",
                        params | {"counterpart_code": agents[other][1]}, ("swap", str(s.id)))
    return written


# --- anomalies --------------------------------------------------------------------------------

def anomalies_new(session: Session, flags: list[Anomaly]) -> int:
    """One notification per distributor for its newly flagged agents."""
    agents = _distributor_of(session, (f.agent_id for f in flags))
    grouped: dict[int, list[Anomaly]] = {}
    for f in flags:
        grouped.setdefault(agents[f.agent_id][0], []).append(f)
    users = _recipients(session, UserRole.distributor, grouped)
    written = 0
    for d, found in grouped.items():
        single = len(found) == 1
        written += _add(session, users.get(d, []), NotificationType.anomaly,
                        NotificationSeverity.warning, "notifications.anomalies_new",
                        {"count": len(found),
                         "agent_code": agents[found[0].agent_id][1] if single else None},
                        ("anomaly", str(found[0].id) if single else None))
    return written
