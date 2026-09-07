"""Bidirectional semantic index artifact generation."""

from datetime import datetime, timezone
from typing import Any

from _recommendation_mapping_modules.candidate_inference_index import build_setting_index

from .artifact_io_json import write_json
from .artifact_paths import PLATFORM_ORDER, SEMANTIC_INDEX_PATH, SOURCE_CONFIGS
from .artifact_pipeline_inputs import required_recommendation_catalog_paths
from .artifact_semantic_fields import add_field_semantic_links
from .artifact_semantic_links import add_catalog_semantic_links


def build_semantic_index() -> None:
    """Build the bidirectional semantic index linking sources to Relution fields."""
    concepts: dict[str, dict[str, Any]] = {}
    targets: dict[str, dict[str, Any]] = {}
    recommendations_index: list[dict[str, Any]] = []
    state = {"concepts": concepts, "targets": targets, "recommendationsIndex": recommendations_index, "counters": {"bySource": {}, "byPlatform": {}}}
    for platform, fields in build_setting_index().items():
        add_field_semantic_links(platform, fields, concepts, targets)
    for source, catalog_path in required_recommendation_catalog_paths(SOURCE_CONFIGS):
        add_catalog_semantic_links(source, catalog_path, state)
    normalize_semantic_collections(concepts, targets)
    recommendations_index.sort(key=lambda entry: (entry["source"], PLATFORM_ORDER.get(entry["platform"], 99), entry["platform"], entry["recommendationId"]))
    concept_entries, target_entries = sorted(concepts.values(), key=lambda entry: entry["id"]), sorted(targets.values(), key=lambda entry: (PLATFORM_ORDER.get(entry["platform"], 99), entry["platform"], entry["kind"], entry["target"], entry["id"]))
    write_json(SEMANTIC_INDEX_PATH, {"version": 1, "name": "Relution Bidirectional Semantic Index", "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), "concepts": concept_entries, "relutionTargets": target_entries, "recommendations": recommendations_index, "summary": {"totalConcepts": len(concept_entries), "totalRelutionTargets": len(target_entries), "totalRecommendations": len(recommendations_index), **state["counters"]}})


def normalize_semantic_collections(concepts: dict[str, dict[str, Any]], targets: dict[str, dict[str, Any]]) -> None:
    """Sort semantic relation lists for deterministic generated artifacts."""
    for collection in concepts.values(), targets.values():
        for entry in collection:
            for key, value in entry.items():
                if isinstance(value, list):
                    entry[key] = sorted(value)
