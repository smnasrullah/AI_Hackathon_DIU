"""Artifact manifest: names, sha256 and metrics of the committed model files."""

import hashlib
import json
from pathlib import Path
from typing import Any

from ml.features.build import FEATURES

MANIFEST = "manifest.json"
FORECAST_MODEL = "demand_forecast"
FORECAST_SEMVER = "1.0.0"
QUANTILES: tuple[float, ...] = (0.1, 0.5, 0.9)


def forecast_file(target: str) -> str:
    return f"forecast_{target}.joblib"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_manifest(artifacts_dir: Path) -> dict[str, Any] | None:
    try:
        data = json.loads((artifacts_dir / MANIFEST).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def verify(artifacts_dir: Path) -> tuple[bool, str]:
    """True when the manifest exists, every file hash matches and the feature list is current."""
    m = read_manifest(artifacts_dir)
    if m is None:
        return False, "manifest missing"
    fc = m.get("forecast", {})
    if tuple(fc.get("features", ())) != FEATURES:
        return False, "feature list changed"
    for name, digest in m.get("files", {}).items():
        path = artifacts_dir / name
        if not path.is_file() or sha256_file(path) != digest:
            return False, f"hash mismatch: {name}"
    if not m.get("files"):
        return False, "no files listed"
    return True, "ok"
