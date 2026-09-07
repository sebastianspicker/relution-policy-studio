"""Apple Mapping helpers for recommendation mapping."""

from typing import Any

from .field_matching_apple_merge import (
    merge_match_metadata,
    merge_without_conflict,
)

def apple_schema_mapping(
    schema_id: str,
    values: dict[str, Any],
    field_paths: tuple[str, ...],
    *,
    constraints: tuple[tuple[str, str, Any], ...] = (),
    reason: str,
) -> dict[str, Any]:
    """Build a curated Apple schema mapping with match metadata."""

    mapping: dict[str, Any] = {
        "kind": "apple-schema-profile",
        "schemaId": schema_id,
        "values": values,
        "match": {
            "score": 100,
            "matchedTerms": list(field_paths),
            "valueCompatibility": "curated-analog",
            "reason": reason,
        },
    }
    if constraints:
        mapping["constraints"] = [
            {"path": path, "operator": operator, "value": value}
            for path, operator, value in constraints
        ]
    return mapping
def merge_apple_schema_mappings(mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Combine same-schema Apple mappings when their value trees do not conflict."""

    by_schema: dict[str, dict[str, Any]] = {}
    for mapping in mappings:
        schema_id = str(mapping.get("schemaId", ""))
        values = mapping.get("values")
        if not schema_id or not isinstance(values, dict):
            continue
        existing = by_schema.get(schema_id)
        if existing is None:
            by_schema[schema_id] = dict(mapping)
            continue
        merged_values = merge_without_conflict(existing.get("values", {}), values)
        if merged_values is None:
            continue
        existing["values"] = merged_values
        existing["match"] = merge_match_metadata(
            existing.get("match"), mapping.get("match")
        )
        existing_constraints = existing.setdefault("constraints", [])
        if isinstance(mapping.get("constraints"), list):
            existing_constraints.extend(mapping["constraints"])
    return list(by_schema.values())
