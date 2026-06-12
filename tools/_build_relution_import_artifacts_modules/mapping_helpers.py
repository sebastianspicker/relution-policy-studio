"""Shared helpers for exact and candidate Relution mapping structures."""

from __future__ import annotations

from typing import Any


def exact_mappings(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    """Return validated exact ruleset mappings for a recommendation."""

    relution_mapping = recommendation.get("relutionMapping", {})
    mappings = relution_mapping.get("rulesetMappings", [])
    if relution_mapping.get("status") != "exact" or not isinstance(mappings, list):
        return []
    exact: list[dict[str, Any]] = []
    for mapping in mappings:
        if (
            not isinstance(mapping, dict)
            or not isinstance(mapping.get("kind"), str)
            or not isinstance(mapping.get("values"), dict)
        ):
            return []
        exact.append(mapping)
    return exact


def mapping_target(mapping: dict[str, Any]) -> str | None:
    """Return the target identifier carried by a mapping payload."""

    for key in ("type", "payloadType", "schemaId"):
        if isinstance(mapping.get(key), str):
            return mapping[key]
    return None


def mapping_target_field(
    mapping_kind: str, *, allow_default: bool = True
) -> str | None:
    """Return the Relution mapping target field for a mapping kind."""
    if mapping_kind == "apple-mobileconfig":
        return "payloadType"
    if mapping_kind == "apple-schema-profile":
        return "schemaId"
    if mapping_kind == "relution-native" or allow_default:
        return "type"
    return None


def mapping_with_target(
    mapping_kind: str,
    target: str,
    values: dict[str, Any],
    *,
    allow_default: bool = True,
) -> dict[str, Any] | None:
    """Build a mapping payload with the correct target field for its kind."""
    target_field = mapping_target_field(mapping_kind, allow_default=allow_default)
    if target_field is None:
        return None
    return {"kind": mapping_kind, "values": values, target_field: target}


def iter_exact_mapping_targets(recommendation: dict[str, Any]) -> list[str]:
    """Return target identifiers used by exact recommendation mappings."""

    targets = []
    for mapping in exact_mappings(recommendation):
        target = mapping_target(mapping)
        if target is not None:
            targets.append(target)
    return targets


def iter_candidate_mapping_targets(recommendation: dict[str, Any]) -> list[str]:
    """Return candidate target identifiers not already covered by exact mappings."""

    exact_targets = set(iter_exact_mapping_targets(recommendation))
    targets = []
    for candidate in recommendation.get("relutionMapping", {}).get("candidates", []):
        if (
            isinstance(candidate, dict)
            and isinstance(candidate.get("target"), str)
            and candidate["target"] not in exact_targets
        ):
            targets.append(candidate["target"])
    return targets
