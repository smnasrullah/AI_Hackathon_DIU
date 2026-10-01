"""Seeded synthetic data generator: build the dataset and load it (used by bootstrap.py)."""

import logging

from sqlalchemy.orm import Session

from app.core.db import get_engine
from ml.data_gen.dataset import N_AGENTS, build_dataset
from ml.data_gen.load import load

log = logging.getLogger(__name__)


def run(seed: int, n_agents: int = N_AGENTS) -> dict[str, int]:
    ds = build_dataset(seed, n_agents)
    with Session(get_engine()) as session, session.begin():
        counts = load(session, ds)
    log.info("synthetic data loaded (seed=%d): %s", seed, counts)
    return counts
