from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_engine
from app.core.security import verify_password
from app.models import Agent, Distributor, User
from app.models.enums import Lang, UserRole
from app.services import seed
from ml.data_gen import demo_spec


@pytest.fixture
def migrated(env: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("DEMO_ADMIN_PASSWORD", "test-admin-pw")
    monkeypatch.setenv("DEMO_DISTRIBUTOR_PASSWORD", "test-dist-pw")
    monkeypatch.setenv("DEMO_AGENT_PASSWORD", "test-agent-pw")
    get_settings.cache_clear()
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = get_settings().database_url
    command.upgrade(cfg, "head")
    return env


def _run_seed() -> dict[str, int]:
    with Session(get_engine()) as session, session.begin():
        return seed.run(session, get_settings())


def _snapshot() -> list[tuple[str, str, str, int | None, int | None]]:
    with Session(get_engine()) as session:
        rows = session.scalars(select(User).order_by(User.email)).all()
        return [(u.email, u.role.value, u.password_hash, u.agent_id, u.distributor_id)
                for u in rows]


def _count(model: type[Agent] | type[Distributor] | type[User]) -> int:
    with Session(get_engine()) as session:
        return session.scalar(select(func.count()).select_from(model)) or 0


def test_seed_creates_reference_rows(migrated: Path) -> None:
    counts = _run_seed()
    assert counts == {
        "distributors_created": 3, "agents_created": 3, "users_created": 7, "users_skipped": 0,
    }
    with Session(get_engine()) as session:
        roles = [u.role for u in session.scalars(select(User)).all()]
        admin = session.scalar(select(User).where(User.role == UserRole.admin))
        agent_email = "agent.mirpur@agentpulse.demo"
        agent_user = session.scalar(select(User).where(User.email == agent_email))
        assert admin is not None and agent_user is not None
        assert verify_password("test-admin-pw", admin.password_hash)
        assert "test-admin-pw" not in admin.password_hash
        assert agent_user.agent_id is not None and agent_user.distributor_id is not None
    assert roles.count(UserRole.admin) == 1
    assert roles.count(UserRole.distributor) == 3
    assert roles.count(UserRole.agent) == 3


def test_seed_is_idempotent(migrated: Path) -> None:
    _run_seed()
    before = _snapshot()
    again = _run_seed()
    assert again == {
        "distributors_created": 0, "agents_created": 0, "users_created": 0, "users_skipped": 0,
    }
    assert _snapshot() == before
    assert (_count(Distributor), _count(Agent), _count(User)) == (3, 3, 7)


def test_seed_skips_users_without_password(
    migrated: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEMO_AGENT_PASSWORD", "")
    get_settings.cache_clear()
    counts = _run_seed()
    assert counts["users_created"] == 4
    assert counts["users_skipped"] == 3


def _add_helper_agent(code: str) -> None:
    with Session(get_engine()) as session, session.begin():
        mirpur = session.scalar(select(Agent).where(Agent.code == "AGT-0001"))
        assert mirpur is not None
        session.add(Agent(code=code, name=f"Synthetic shop {code}",
                          distributor_id=mirpur.distributor_id, region="Dhaka",
                          district="Dhaka", upazila="Mirpur", urban_rural=mirpur.urban_rural,
                          tier=1, lat=23.81, lng=90.37, cash_capacity=450_000,
                          emoney_capacity=450_000, help_opt_out=True))


def test_helper_login_appears_once_its_agent_exists(migrated: Path) -> None:
    """The helper shops come with the synthetic data; their logins follow them."""
    assert seed.HELPER_USERS[0].agent_code == demo_spec.DONOR_AGENT
    assert len(seed.HELPER_USERS) >= 3  # the donor and at least two more
    _run_seed()
    assert _count(User) == 7  # before the data load: skipped, nothing else changes
    helper = seed.HELPER_USERS[0]
    assert helper.agent_code is not None
    _add_helper_agent(helper.agent_code)
    assert _run_seed()["users_created"] == 1
    with Session(get_engine()) as session:
        user = session.scalar(select(User).where(User.email == helper.email))
        assert user is not None and user.role == UserRole.agent and not user.is_demo
        assert user.distributor_id is not None
    assert _run_seed()["users_created"] == 0  # idempotent


def test_ensure_helpers_is_create_only_and_opts_in(migrated: Path) -> None:
    _run_seed()
    codes = [u.agent_code for u in seed.HELPER_USERS if u.agent_code]
    for code in codes:
        _add_helper_agent(code)
    with Session(get_engine()) as session, session.begin():
        assert seed.ensure_helpers(session, get_settings()) == len(codes)
    with Session(get_engine()) as session, session.begin():
        flags = session.scalars(select(Agent.help_opt_out).where(Agent.code.in_(codes))).all()
        assert flags == [False] * len(codes)  # new helper logins start opted in
        first = session.scalar(select(User).where(User.email == seed.HELPER_USERS[0].email))
        assert first is not None
        first.lang, first.full_name = Lang.en, "Renamed by the user"
        session.scalar(select(Agent).where(Agent.code == codes[0])).help_opt_out = True
    with Session(get_engine()) as session, session.begin():
        assert seed.ensure_helpers(session, get_settings()) == 0  # nothing missing
    with Session(get_engine()) as session:
        kept = session.scalar(select(User).where(User.email == seed.HELPER_USERS[0].email))
        assert kept is not None and (kept.lang, kept.full_name) == (Lang.en, "Renamed by the user")
        assert session.scalar(select(Agent.help_opt_out).where(Agent.code == codes[0])) is True
