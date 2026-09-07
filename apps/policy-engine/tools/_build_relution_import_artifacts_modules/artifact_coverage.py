"""Cross-source recommendation coverage matrix generation."""

from datetime import datetime, timezone
from typing import Any

from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

from .artifact_io_json import read_json
from .artifact_io_json import write_json
from .artifact_paths import COVERAGE_MATRIX_PATH, PLATFORM_ORDER, SOURCE_CONFIGS
from .artifact_pipeline_inputs import required_recommendation_catalog_paths
from .mapping_candidate_targets import iter_candidate_mapping_targets
from .mapping_exact_targets import iter_exact_mapping_targets


def build_coverage_matrix() -> None:
    """Build the cross-source recommendation achievability matrix artifact."""
    rows: list[dict[str, Any]] = []
    counters = {"bySource": {}, "byPlatform": {}, "byCategory": {}, "bySurface": {}}
    for source, catalog_path in required_recommendation_catalog_paths(SOURCE_CONFIGS):
        recommendations = read_json(catalog_path)
        if not isinstance(recommendations, list):
            raise ValueError(f"Required recommendation catalog malformed: source={source} path={catalog_path} expected list")
        for recommendation in recommendations:
            row = coverage_row(source, recommendation)
            rows.append(row)
            update_coverage_counters(counters, row)
    rows.sort(key=lambda row: (row["source"], PLATFORM_ORDER.get(row["platform"], 99), row["platform"], row["recommendationId"]))
    write_json(COVERAGE_MATRIX_PATH, {"version": 1, "name": "Relution Recommendation Achievability Matrix", "generatedAt": utc_timestamp(), "rows": rows, "summary": {"totalRecommendations": len(rows), **counters}})


def coverage_row(source: str, recommendation: dict[str, Any]) -> dict[str, Any]:
    """Project a normalized recommendation into a coverage-matrix row."""
    implementation = recommendation.get("implementation", {})
    return {"source": source, "recommendationId": recommendation["id"], "platform": recommendation["platform"], "title": recommendation["title"], "category": implementation.get("category", "gap"), "surfaces": list(implementation.get("surfaces", [])), "importableVia": list(implementation.get("importableVia", [])), "mappingStatus": recommendation.get("relutionMapping", {}).get("status", "none"), "targetTypes": unique_preserving_order(iter_exact_mapping_targets(recommendation)), "candidateTargetTypes": unique_preserving_order(iter_candidate_mapping_targets(recommendation)), "blockingReasons": list(implementation.get("blockingReasons", []))}


def update_coverage_counters(counters: dict[str, dict[str, int]], row: dict[str, Any]) -> None:
    """Increment summary counters for one projected coverage row."""
    for bucket, value in (("bySource", row["source"]), ("byPlatform", row["platform"]), ("byCategory", row["category"])):
        counters[bucket][value] = counters[bucket].get(value, 0) + 1
    for surface in row["surfaces"]:
        counters["bySurface"][surface] = counters["bySurface"].get(surface, 0) + 1


def utc_timestamp() -> str:
    """Return the generated-artifact timestamp format."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
