"""Candidates helpers for recommendation mapping."""

from typing import Any
from ._mapping_models import ScoredField

from .field_matching_values import (
    flatten_value_paths,
)

def candidate_from_score(entry: ScoredField) -> dict[str, Any]:
    """Convert a scored field into the candidate mapping payload shape."""

    return {
        "kind": entry.field.kind,
        "target": entry.field.target,
        "fieldPaths": [entry.field.field_path],
        "match": {
            "score": entry.score,
            "matchedTerms": list(entry.matched_terms),
            "valueCompatibility": entry.value_compatibility,
            "reason": (
                "Bilingual normalized setting-name match against Relution/Apple "
                "field metadata."
            ),
        },
    }
def candidate_key(candidate: dict[str, Any]) -> tuple[str, str, tuple[str, ...]]:
    """Return the deduplication key for a candidate mapping."""

    return (
        str(candidate.get("kind", "")),
        str(candidate.get("target", "")),
        tuple(str(path) for path in candidate.get("fieldPaths", [])),
    )
def kind_priority(kind: str) -> int:
    """Sort native Relution candidates before Apple fallbacks."""

    return {
        "relution-native": 0,
        "apple-schema-profile": 1,
        "apple-mobileconfig": 2,
    }.get(kind, 9)
def candidate_from_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    """Convert an exact mapping object into the candidate comparison shape."""

    if mapping.get("kind") == "relution-native":
        target = str(mapping.get("type", ""))
    elif mapping.get("kind") == "apple-schema-profile":
        target = str(mapping.get("schemaId", ""))
    else:
        target = str(mapping.get("payloadType", ""))
    candidate: dict[str, Any] = {
        "kind": mapping.get("kind", ""),
        "target": target,
        "fieldPaths": flatten_value_paths(mapping.get("values", {})),
    }
    if isinstance(mapping.get("match"), dict):
        candidate["match"] = mapping["match"]
    return candidate
def merge_candidate_lists(
    *candidate_groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge candidate groups by key while preserving first occurrence order."""

    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()
    for candidate in [candidate for group in candidate_groups for candidate in group]:
        key = (
            str(candidate.get("kind", "")),
            str(candidate.get("target", "")),
            tuple(str(path) for path in candidate.get("fieldPaths", [])),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(candidate)
    return merged[:8]
