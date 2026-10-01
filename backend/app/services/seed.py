"""Idempotent seed of reference rows: 3 distributors, demo agents, demo users per role.

Upserts by natural key (distributor/agent code, user email); a re-run changes nothing.
Passwords come from settings (DEMO_*_PASSWORD in .env), never from code.
"""

import logging
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_password, verify_password
from app.models import Agent, Distributor, User
from app.models.enums import Lang, UrbanRural, UserRole

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class DistributorSeed:
    code: str
    name: str
    region: str
    district: str
    hub_lat: float
    hub_lng: float


@dataclass(frozen=True)
class AgentSeed:
    code: str
    name: str
    distributor_code: str
    region: str
    district: str
    upazila: str
    urban_rural: UrbanRural
    tier: int
    lat: float
    lng: float
    cash_capacity: Decimal
    emoney_capacity: Decimal


@dataclass(frozen=True)
class UserSeed:
    email: str
    full_name: str
    role: UserRole
    lang: Lang
    distributor_code: str | None = None
    agent_code: str | None = None


DISTRIBUTORS: tuple[DistributorSeed, ...] = (
    DistributorSeed("DST-DHK", "Dhaka North Distribution", "Dhaka", "Dhaka", 23.8223, 90.3654),
    DistributorSeed(
        "DST-CTG", "Chattogram South Distribution", "Chattogram", "Chattogram", 22.3569, 91.7832
    ),
    DistributorSeed("DST-SYL", "Sylhet Haor Distribution", "Sylhet", "Sunamganj", 25.0658, 91.3950),
)

DEMO_AGENTS: tuple[AgentSeed, ...] = (
    AgentSeed(
        "AGT-0001", "Mirpur 10 Mobile Point", "DST-DHK", "Dhaka", "Dhaka", "Mirpur",
        UrbanRural.urban, 1, 23.8069, 90.3687, Decimal("400000.00"), Decimal("400000.00"),
    ),
    AgentSeed(
        "AGT-0002", "Patiya Bazar Telecom", "DST-CTG", "Chattogram", "Chattogram", "Patiya",
        UrbanRural.peri_urban, 2, 22.2950, 91.9790, Decimal("200000.00"), Decimal("200000.00"),
    ),
    AgentSeed(
        "AGT-0003", "Tahirpur Hat Store", "DST-SYL", "Sylhet", "Sunamganj", "Tahirpur",
        UrbanRural.rural, 3, 25.0870, 91.1830, Decimal("80000.00"), Decimal("80000.00"),
    ),
)

DEMO_USERS: tuple[UserSeed, ...] = (
    UserSeed("admin@agentpulse.demo", "Demo Admin", UserRole.admin, Lang.en),
    UserSeed("dist.dhaka@agentpulse.demo", "Dhaka Distributor", UserRole.distributor, Lang.en,
             distributor_code="DST-DHK"),
    UserSeed("dist.chattogram@agentpulse.demo", "Chattogram Distributor", UserRole.distributor,
             Lang.bn, distributor_code="DST-CTG"),
    UserSeed("dist.sylhet@agentpulse.demo", "Sylhet Distributor", UserRole.distributor, Lang.bn,
             distributor_code="DST-SYL"),
    UserSeed("agent.mirpur@agentpulse.demo", "Mirpur Agent", UserRole.agent, Lang.bn,
             agent_code="AGT-0001"),
    UserSeed("agent.patiya@agentpulse.demo", "Patiya Agent", UserRole.agent, Lang.bn,
             agent_code="AGT-0002"),
    UserSeed("agent.sunamganj@agentpulse.demo", "Sunamganj Agent", UserRole.agent, Lang.bn,
             agent_code="AGT-0003"),
)


def _password_for(role: UserRole, settings: Settings) -> str:
    secret = {
        UserRole.admin: settings.demo_admin_password,
        UserRole.distributor: settings.demo_distributor_password,
        UserRole.agent: settings.demo_agent_password,
    }[role]
    return secret.get_secret_value()


def _upsert_distributors(session: Session) -> tuple[dict[str, int], int]:
    created = 0
    ids: dict[str, int] = {}
    for d in DISTRIBUTORS:
        row = session.scalar(select(Distributor).where(Distributor.code == d.code))
        if row is None:
            row = Distributor(code=d.code)
            session.add(row)
            created += 1
        row.name, row.region, row.district = d.name, d.region, d.district
        row.hub_lat, row.hub_lng = d.hub_lat, d.hub_lng
        session.flush()
        ids[d.code] = row.id
    return ids, created


def _upsert_agents(session: Session, dist_ids: dict[str, int]) -> tuple[dict[str, int], int]:
    created = 0
    ids: dict[str, int] = {}
    for a in DEMO_AGENTS:
        row = session.scalar(select(Agent).where(Agent.code == a.code))
        if row is None:
            row = Agent(code=a.code)
            session.add(row)
            created += 1
        row.name, row.distributor_id = a.name, dist_ids[a.distributor_code]
        row.region, row.district, row.upazila = a.region, a.district, a.upazila
        row.urban_rural, row.tier, row.lat, row.lng = a.urban_rural, a.tier, a.lat, a.lng
        row.cash_capacity, row.emoney_capacity = a.cash_capacity, a.emoney_capacity
        session.flush()
        ids[a.code] = row.id
    return ids, created


def _upsert_users(
    session: Session, settings: Settings, dist_ids: dict[str, int], agent_ids: dict[str, int]
) -> tuple[int, int]:
    created = skipped = 0
    for u in DEMO_USERS:
        password = _password_for(u.role, settings)
        if not password:
            log.warning("DEMO_%s_PASSWORD not set; skipping %s", u.role.value.upper(), u.email)
            skipped += 1
            continue
        row = session.scalar(select(User).where(User.email == u.email))
        if row is None:
            row = User(email=u.email, password_hash=hash_password(password))
            session.add(row)
            created += 1
        elif not verify_password(password, row.password_hash):
            row.password_hash = hash_password(password)
        row.full_name, row.role, row.lang, row.is_active = u.full_name, u.role, u.lang, True
        row.distributor_id = dist_ids[u.distributor_code] if u.distributor_code else None
        row.agent_id = agent_ids[u.agent_code] if u.agent_code else None
        if u.agent_code:
            # An agent's distributor is derived from the agent row.
            agent = session.get(Agent, row.agent_id)
            row.distributor_id = agent.distributor_id if agent else None
    session.flush()
    return created, skipped


def run(session: Session, settings: Settings) -> dict[str, int]:
    """Upsert all reference rows inside the caller's transaction; returns created counts."""
    dist_ids, dist_created = _upsert_distributors(session)
    agent_ids, agent_created = _upsert_agents(session, dist_ids)
    users_created, users_skipped = _upsert_users(session, settings, dist_ids, agent_ids)
    return {
        "distributors_created": dist_created,
        "agents_created": agent_created,
        "users_created": users_created,
        "users_skipped": users_skipped,
    }
