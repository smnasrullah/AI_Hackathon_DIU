"""Model training entry point. Scaffold: no models are trained yet, no manifest is written."""

import logging
from pathlib import Path

log = logging.getLogger(__name__)


def run(artifacts_dir: Path, seed: int) -> None:
    log.info("training scaffold (seed=%d): nothing written to %s", seed, artifacts_dir)
