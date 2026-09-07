"""Required recommendation-catalog input validation."""

from pathlib import Path
from typing import Any, Mapping

from .artifact_paths import SOURCE_CONFIGS


def required_recommendation_catalog_paths(
    source_configs: Mapping[str, Any] | None = None,
) -> list[tuple[str, Path]]:
    """Return all required source catalogs or fail with a complete missing list."""
    present, missing = [], []
    configs = SOURCE_CONFIGS if source_configs is None else source_configs
    for source, config in configs.items():
        (present if config.recommendation_catalog_path.exists() else missing).append((source, config.recommendation_catalog_path))
    if missing:
        raise FileNotFoundError(missing_required_inputs_message("recommendation catalogs", present, missing))
    return present


def missing_required_inputs_message(label: str, present: list[tuple[str, Path]], missing: list[tuple[str, Path]]) -> str:
    """Format required-input failures with present and missing source counts."""
    missing_paths = ", ".join(f"{source}:{path}" for source, path in missing)
    return f"Required {label} missing: present={len(present)} missing={len(missing)} missingInputs=[{missing_paths}]"
