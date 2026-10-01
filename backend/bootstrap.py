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
from app.services import forecast
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
    """Register the active model and cache forecasts for every agent at SIM_NOW."""
    with Session(get_engine()) as session, session.begin():
        forecast.precompute(session, get_settings().artifacts_dir)
    return 0


def mark_ready() -> int:
    with Session(get_engine()) as session, session.begin():
        _set_meta(session, "bootstrap_state", "ready")
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
}


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[bootstrap] %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=sorted(COMMANDS))
    return COMMANDS[parser.parse_args().command]()


if __name__ == "__main__":
    sys.exit(main())
