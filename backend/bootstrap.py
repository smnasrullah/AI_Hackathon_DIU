"""Idempotent bootstrap steps, called one by one from scripts/bootstrap.sh.

Exit codes for checks: 0 = work needed, 1 = already done.
"""

import argparse
import logging
import sys
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.config import DATA_VERSION, get_settings
from app.core.db import get_engine
from app.models.system_meta import SystemMeta
from app.services import auth, jobs, notifications, pipeline
from app.services import seed as reference_seed
from ml import registry
from ml.data_gen import generate
from ml.training import train

log = logging.getLogger("bootstrap")


def _get_meta(session: Session, key: str) -> Any:
    row = session.scalar(select(SystemMeta).where(SystemMeta.key == key))
    return row.value if row else None


def _set_meta(session: Session, key: str, value: Any) -> None:
    session.merge(SystemMeta(key=key, value=value))


def wait_db(attempts: int = 60, delay_s: float = 2.0) -> int:
    for i in range(1, attempts + 1):
        try:
            with get_engine().connect():
                log.info("database reachable")
                return 0
        except OperationalError:
            log.info("waiting for database (%d/%d)", i, attempts)
            time.sleep(delay_s)
    log.error("database not reachable")
    return 1


def needs_seed() -> int:
    with Session(get_engine()) as session:
        current = _get_meta(session, "data_version")
    return 0 if current != DATA_VERSION else 1


def seed() -> int:
    settings = get_settings()
    seed_reference()
    counts = generate.run(seed=settings.seed)
    with Session(get_engine()) as session, session.begin():
        _set_meta(session, "seed", settings.seed)
        _set_meta(session, "data_version", DATA_VERSION)
    log.info("seeded data_version=%s seed=%d counts=%s", DATA_VERSION, settings.seed, counts)
    return 0


def seed_reference() -> int:
    """Re-run only the idempotent distributor/agent/user seed (e.g. after a password change)."""
    with Session(get_engine()) as session, session.begin():
        log.info("reference seed: %s", reference_seed.run(session, get_settings()))
    return 0


def needs_train() -> int:
    ok, why = registry.verify(get_settings().artifacts_dir)
    if not ok:
        log.warning("artifacts need training: %s", why)
    return 1 if ok else 0


def run_train() -> int:
    log.warning("training from seed (slow path; committed artifacts were missing or invalid)")
    train.run(artifacts_dir=get_settings().artifacts_dir, seed=get_settings().seed)
    return 0


def precompute() -> int:
    """Register the active models and precompute every cache (app/services/pipeline.py)."""
    pipeline.precompute(get_settings())
    return 0


E2E_INBOX_USER = "dist.dhaka@agentpulse.demo"


def seed_notifications() -> int:
    """e2e fixture: the demo distributor's inbox becomes all-read plus one known unread notice."""
    with Session(get_engine()) as session, session.begin():
        nid = notifications.seed_one_unread(session, E2E_INBOX_USER)
    log.info("seeded unread notification %d for %s", nid, E2E_INBOX_USER)
    return 0


E2E_WRONG_PASSWORD_USER = "agent.sunamganj@agentpulse.demo"


def e2e_fixtures() -> int:
    """Known state before each e2e run (no DB reset): one unread notice for the distributor, and
    no lockout left on the account the wrong-password spec uses."""
    seed_notifications()
    with Session(get_engine()) as session, session.begin():
        n = auth.clear_login_failures(session, E2E_WRONG_PASSWORD_USER)
    log.info("cleared %d login failures for %s", n, E2E_WRONG_PASSWORD_USER)
    return 0


def mark_ready() -> int:
    with Session(get_engine()) as session, session.begin():
        _set_meta(session, "bootstrap_state", "ready")
        # A restart killed any admin job that was still running in the old process.
        jobs.mark_interrupted(session)
    return 0


COMMANDS = {
    "wait-db": wait_db,
    "needs-seed": needs_seed,
    "seed": seed,
    "seed-reference": seed_reference,
    "needs-train": needs_train,
    "train": run_train,
    "precompute": precompute,
    "mark-ready": mark_ready,
    "seed-notifications": seed_notifications,
    "e2e-fixtures": e2e_fixtures,
}


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[bootstrap] %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=sorted(COMMANDS))
    return COMMANDS[parser.parse_args().command]()


if __name__ == "__main__":
    sys.exit(main())
