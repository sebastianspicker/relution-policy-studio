"""Accumulator primitives shared by CIS mapping rules."""
from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.field_matching_candidates import candidate_from_mapping

def add_exact(
    acc: dict[str, list[dict[str, Any]] | list[str]], spec: tuple[Any, ...]
) -> None:
    """Add a curated exact mapping and its candidate target to the accumulator."""
    kind, target, field_paths, values, *rest = spec
    constraints = rest[0] if rest else None
    acc["candidates"].append(
        {"kind": kind, "target": target, "fieldPaths": field_paths}
    )
    mapping: dict[str, Any] = {"kind": kind, "values": values}
    if constraints:
        mapping["constraints"] = constraints
    if kind == "relution-native":
        mapping["type"] = target
    elif kind == "apple-schema-profile":
        mapping["schemaId"] = target
    elif kind == "apple-mobileconfig":
        mapping["payloadType"] = target
    acc["exactMappings"].append(mapping)


def add_candidate(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    kind: str,
    target: str,
    field_paths: list[str],
    note: str,
) -> None:
    """Add a non-exact candidate target and explanatory note."""
    acc["candidates"].append(
        {"kind": kind, "target": target, "fieldPaths": field_paths}
    )
    acc["notes"].append(note)


def add_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]], mapping: dict[str, Any]
) -> None:
    """Add an already rendered exact mapping to the accumulator."""
    acc["candidates"].append(candidate_from_mapping(mapping))
    acc["exactMappings"].append(mapping)
