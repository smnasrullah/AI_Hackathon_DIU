"""CLI: generate the synthetic dataset and load it into the database (DATABASE_URL).

    python -m ml.data_gen.run [--seed 42] [--agents 300]
"""

import argparse
import logging
import sys

from app.core.config import get_settings
from ml.data_gen import generate
from ml.data_gen.dataset import N_AGENTS


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[data_gen] %(message)s")
    parser = argparse.ArgumentParser(description="Generate + load synthetic AgentPulse data")
    parser.add_argument("--seed", type=int, default=get_settings().seed)
    parser.add_argument("--agents", type=int, default=N_AGENTS)
    args = parser.parse_args()
    generate.run(seed=args.seed, n_agents=args.agents)
    return 0


if __name__ == "__main__":
    sys.exit(main())
