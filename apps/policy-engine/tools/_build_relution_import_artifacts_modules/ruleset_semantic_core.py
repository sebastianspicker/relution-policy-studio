"""Core semantic-index data helpers for Relution rulesets."""

from __future__ import annotations

from typing import Any

from _tooling_text_io import slugify
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order


def semantic_target_id(
    platform: str, kind: str, target: str, field_paths: list[str]
) -> str:
    """Build a deterministic semantic target id from platform, type, and paths."""

    path_part = "__".join(field_paths) if field_paths else "target"
    return slugify(f"{platform}-{kind}-{target}-{path_part}")


def append_unique(values: list[Any], value: Any) -> None:
    """Append a value while preserving insertion order and uniqueness."""

    if value not in values:
        values.append(value)


def empty_semantic_concept(concept_id: str) -> dict[str, Any]:
    """Create an empty semantic concept accumulator with all link buckets."""

    return {
        "id": concept_id,
        "label": {},
        "matchedTerms": [],
        "relutionTargetIds": [],
        "recommendationIds": [],
        "exactRecommendationIds": [],
        "candidateRecommendationIds": [],
    }


def ensure_semantic_target(
    targets: dict[str, dict[str, Any]],
    platform: str,
    kind: str,
    target: str,
    field_paths: list[str],
) -> dict[str, Any]:
    """Return or create the semantic-index entry for a Relution target."""

    target_id = semantic_target_id(platform, kind, target, field_paths)
    return targets.setdefault(
        target_id,
        {
            "id": target_id,
            "platform": platform,
            "kind": kind,
            "target": target,
            "fieldPaths": field_paths,
            "labels": [],
            "conceptIds": [],
            "exactRecommendationIds": [],
            "candidateRecommendationIds": [],
        },
    )


def ensure_semantic_concept(
    concepts: dict[str, dict[str, Any]], concept: dict[str, Any]
) -> dict[str, Any]:
    """Return or create a semantic concept while merging labels and terms."""

    concept_id = str(concept["id"])
    entry = concepts.setdefault(concept_id, empty_semantic_concept(concept_id))
    label = concept.get("label")
    if isinstance(label, dict):
        entry["label"] = dict(label)
    entry["matchedTerms"] = unique_preserving_order(
        [
            *entry["matchedTerms"],
            *[
                str(term)
                for term in concept.get("matchedTerms", [])
                if isinstance(term, str)
            ],
        ]
    )
    return entry
