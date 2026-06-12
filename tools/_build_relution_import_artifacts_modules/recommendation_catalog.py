"""Load normalized recommendations from all generated source catalogs."""

from __future__ import annotations

from typing import Any

from .artifact_io import read_json
from .artifact_paths import SOURCE_CONFIGS


def load_recommendations_by_global_id() -> dict[str, dict[str, Any]]:
    """Return source-qualified recommendations keyed by global ID."""

    recommendations: dict[str, dict[str, Any]] = {}
    for source, config in SOURCE_CONFIGS.items():
        if not config.recommendation_catalog_path.exists():
            continue
        for recommendation in read_json(config.recommendation_catalog_path):
            if not isinstance(recommendation, dict) or not isinstance(
                recommendation.get("id"), str
            ):
                continue
            global_id = f"{source}:{recommendation['id']}"
            recommendations[global_id] = {
                **recommendation,
                "_source": source,
                "_globalId": global_id,
            }
    return recommendations
